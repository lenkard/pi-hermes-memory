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
  runSemanticStartupWork,
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

  it('releases leased work without consuming an attempt when cancelled', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-worker-cancel-test-'));
    const dbManager = new DatabaseManager(tmpDir);
    for (let index = 1; index <= 2; index++) {
      enqueueSemanticUpsert(dbManager, {
        memoryId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        content: `fact ${index}`,
        project: null,
        target: 'memory',
        category: null,
      }, EMBEDDING_CONTRACT.version, '2026-07-17T00:00:00.000Z');
    }
    const controller = new AbortController();
    controller.abort();
    const embedding: EmbeddingClientLike = { async embedDocument() { return vector(); } };
    const index: PostgresIndexLike = { async upsert() {}, async delete() {} };

    const summary = await runSemanticIndexWorkerOnce(
      dbManager,
      embedding,
      index,
      16,
      new Date('2026-07-17T00:00:00.000Z'),
      controller.signal,
    );
    const rows = dbManager.getDb().prepare('SELECT attempts, lease_token FROM semantic_index_queue').all() as Array<{ attempts: number; lease_token: string | null }>;

    assert.deepStrictEqual(summary, { claimed: 2, processed: 0, failed: 0, released: 2 });
    assert.ok(rows.every((row) => row.attempts === 0 && row.lease_token === null));
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('processes at most twenty startup entries in batches no larger than sixteen', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-worker-startup-test-'));
    const dbManager = new DatabaseManager(tmpDir);
    for (let index = 1; index <= 25; index++) {
      enqueueSemanticUpsert(dbManager, {
        memoryId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        content: `fact ${index}`,
        project: null,
        target: 'memory',
        category: null,
      }, EMBEDDING_CONTRACT.version, '2026-07-17T00:00:00.000Z');
    }
    const embedding: EmbeddingClientLike = { async embedDocument() { return vector(); } };
    const index: PostgresIndexLike = { async upsert() {}, async delete() {} };

    const summary = await runSemanticStartupWork(dbManager, embedding, index, {
      now: new Date('2026-07-17T00:00:00.000Z'),
    });
    const remaining = dbManager.getDb().prepare('SELECT COUNT(*) AS count FROM semantic_index_queue').get() as { count: number };

    assert.deepStrictEqual(summary, { claimed: 20, processed: 20, failed: 0, released: 0 });
    assert.equal(remaining.count, 5);
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
      assert.equal(future[0].lastError, 'semantic indexing failed');
      assert.doesNotMatch(future[0].lastError ?? '', /embedding unavailable|postgresql:\/\/|Bearer/i);
      dbManager.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});