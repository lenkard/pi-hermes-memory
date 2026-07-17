import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import {
  enqueueSemanticDelete,
  enqueueSemanticUpsert,
  enqueueMarkdownUpsert,
  enqueueMarkdownDelete,
  failSemanticWork,
  claimSemanticWork,
  completeSemanticWork,
  listSemanticWork,
  type SemanticQueueMemory,
} from '../../src/semantic/semantic-index-queue.js';

const memory: SemanticQueueMemory = {
  memoryId: '11111111-1111-4111-8111-111111111111',
  content: 'durable fact',
  project: 'project-a',
  target: 'memory',
  category: null,
};

const contractVersion = 'qwen3-embedding-0.6b-q8_0-v1';

describe('semantic index queue', () => {
  let tmpDir: string;
  let dbManager: DatabaseManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-queue-test-'));
    dbManager = new DatabaseManager(tmpDir);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('durably coalesces repeated upserts by Memory ID', () => {
    enqueueSemanticUpsert(dbManager, memory, contractVersion, '2026-07-17T00:00:00.000Z');
    enqueueSemanticUpsert(dbManager, { ...memory, content: 'replacement fact' }, contractVersion, '2026-07-17T00:01:00.000Z');

    const work = listSemanticWork(dbManager, '2026-07-17T00:02:00.000Z');
    assert.equal(work.length, 1);
    assert.equal(work[0].operation, 'upsert');
    assert.equal(work[0].content, 'replacement fact');
    assert.equal(work[0].attempts, 0);
  });

  it('coalesces deletion after an upsert and preserves it across reload', () => {
    enqueueSemanticUpsert(dbManager, memory, contractVersion);
    enqueueSemanticDelete(dbManager, memory.memoryId, contractVersion);
    dbManager.close();

    dbManager = new DatabaseManager(tmpDir);
    const work = listSemanticWork(dbManager, new Date().toISOString());
    assert.equal(work.length, 1);
    assert.equal(work[0].operation, 'delete');
    assert.equal(work[0].content, null);
  });

  it('leases bounded work, completes it, and retries failures with attempts', () => {
    enqueueSemanticUpsert(dbManager, memory, contractVersion, '2026-07-17T00:00:00.000Z');
    const claimed = claimSemanticWork(dbManager, 16, new Date('2026-07-17T00:00:00.000Z'), 60_000);
    assert.equal(claimed.length, 1);
    assert.ok(claimed[0].leaseToken);
    assert.equal(listSemanticWork(dbManager, '2026-07-17T00:00:01.000Z').length, 0);

    failSemanticWork(dbManager, claimed[0], new Date('2026-07-17T00:00:00.000Z'), { baseMs: 1000, jitterMs: 0 });
    const retried = listSemanticWork(dbManager, '2026-07-17T00:00:01.000Z');
    assert.equal(retried.length, 1);
    assert.equal(retried[0].attempts, 1);

    const claimedAgain = claimSemanticWork(dbManager, 16, new Date('2026-07-17T00:00:02.000Z'), 60_000);
    completeSemanticWork(dbManager, claimedAgain[0]);
    assert.deepStrictEqual(listSemanticWork(dbManager, '2026-07-17T00:01:00.000Z'), []);
  });

  it('parses stable Memory IDs from Markdown entries and enqueues upsert or delete', () => {
    enqueueMarkdownUpsert(
      dbManager,
      'durable fact <!-- memory_id=11111111-1111-4111-8111-111111111111, created=2026-07-17, last=2026-07-17, project64=cHJvamVjdC1h -->',
      'memory',
      null,
      contractVersion,
    );
    let work = listSemanticWork(dbManager, new Date().toISOString());
    assert.equal(work.length, 1);
    assert.equal(work[0].project, null);

    enqueueMarkdownDelete(
      dbManager,
      'durable fact <!-- memory_id=11111111-1111-4111-8111-111111111111, created=2026-07-17, last=2026-07-17 -->',
      contractVersion,
    );
    work = listSemanticWork(dbManager, new Date().toISOString());
    assert.equal(work.length, 1);
    assert.equal(work[0].operation, 'delete');
    assert.equal(work[0].content, null);
  });

  it('stops retry eligibility after eight failures', () => {
    enqueueSemanticUpsert(dbManager, memory, contractVersion, '2026-07-17T00:00:00.000Z');
    for (let attempt = 0; attempt < 8; attempt++) {
      const now = new Date(Date.UTC(2026, 6, 17, 0, attempt, 0));
      const claimed = claimSemanticWork(dbManager, 16, now, 1);
      assert.equal(claimed.length, 1);
      failSemanticWork(dbManager, claimed[0], now, { baseMs: 0, jitterMs: 0 });
    }

    assert.deepStrictEqual(listSemanticWork(dbManager, '2026-07-18T00:00:00.000Z'), []);
  });
});
