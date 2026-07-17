import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import {
  enqueueSemanticUpsert,
  listSemanticWork,
  claimSemanticWork,
} from '../../src/semantic/semantic-index-queue.js';
import { EMBEDDING_CONTRACT } from '../../src/semantic/embedding-contract.js';
import {
  runSemanticIndexWorkerOnce,
  type EmbeddingClientLike,
  type PostgresIndexLike,
} from '../../src/semantic/semantic-index-worker.js';

function vector(): number[] {
  return Array.from({ length: EMBEDDING_CONTRACT.dimensions }, () => 1 / Math.sqrt(EMBEDDING_CONTRACT.dimensions));
}

describe('semantic index worker', () => {
  it('embeds content, upserts metadata only, and completes the lease', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-worker-test-'));
    const dbManager = new DatabaseManager(tmpDir);
    const work = {
      memoryId: '11111111-1111-4111-8111-111111111111',
      content: 'durable fact',
      project: 'project-a',
      target: 'memory' as const,
      category: null,
    };
    enqueueSemanticUpsert(dbManager, work, EMBEDDING_CONTRACT.version, '2026-07-17T00:00:00.000Z');

    const embedded: string[] = [];
    const indexCalls: Array<{ kind: 'upsert'; work: unknown; vector: string }> = [];
    const embedding: EmbeddingClientLike = {
      async embedDocument(content) {
        embedded.push(content);
        return vector();
      },
    };
    const index: PostgresIndexLike = {
      async upsert(work, vectorNorm) {
        indexCalls.push({ kind: 'upsert', work, vector: '[vector]' });
        return Promise.resolve();
      },
      async delete() {
        return Promise.resolve();
      },
    };

    return runSemanticIndexWorkerOnce(dbManager, embedding, index, 16, new Date('2026-07-17T00:00:00.000Z')).then((summary) => {
      assert.equal(summary.processed, 1);
      assert.equal(summary.failed, 0);
      assert.deepStrictEqual(embedded, ['durable fact']);
      assert.equal(indexCalls.length, 1);
      assert.equal(listSemanticWork(dbManager, '2026-07-17T00:00:00.000Z').length, 0);
      dbManager.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  it('records failure and retries later when embedding rejects', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-worker-test-'));
    const dbManager = new DatabaseManager(tmpDir);
    enqueueSemanticUpsert(dbManager, {
      memoryId: '22222222-2222-4222-8222-222222222222',
      content: 'retry fact',
      project: null,
      target: 'memory',
      category: null,
    }, EMBEDDING_CONTRACT.version, '2026-07-17T00:00:00.000Z');
    const embedding: EmbeddingClientLike = {
      async embedDocument() {
        throw new Error('embedding unavailable');
      },
    };
    const index: PostgresIndexLike = {
      async upsert() {
        return Promise.resolve();
      },
      async delete() {
        return Promise.resolve();
      },
    };

    return runSemanticIndexWorkerOnce(dbManager, embedding, index, 16, new Date('2026-07-17T00:00:00.000Z')).then((summary) => {
      assert.equal(summary.processed, 0);
      assert.equal(summary.failed, 1);
      const work = listSemanticWork(dbManager, new Date('2026-07-17T00:00:00.000Z').toISOString());
      assert.equal(work.length, 0);
      const future = claimSemanticWork(dbManager, 16, new Date('2026-07-17T00:00:02.000Z'), 60_000);
      assert.equal(future.length, 1);
      assert.equal(future[0].attempts, 1);
      dbManager.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});