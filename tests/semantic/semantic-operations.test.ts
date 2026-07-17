import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import { addMemory } from '../../src/store/sqlite-memory-store.js';
import {
  claimSemanticWork,
  enqueueSemanticUpsert,
  failSemanticWork,
  listSemanticWork,
} from '../../src/semantic/semantic-index-queue.js';
import {
  authoritativeMemorySnapshot,
  getSemanticStatus,
  reconcileSemanticIndex,
  rebuildSemanticIndex,
  type DerivedIndexRow,
  type SemanticIndexOperations,
} from '../../src/semantic/semantic-operations.js';
import { EMBEDDING_CONTRACT } from '../../src/semantic/embedding-contract.js';

class FakeIndex implements SemanticIndexOperations {
  rows = new Map<string, DerivedIndexRow>();
  healthy = true;
  deleteAllCalls = 0;

  async listAll(): Promise<DerivedIndexRow[]> { return [...this.rows.values()]; }
  async count(): Promise<number> { return this.rows.size; }
  async health(): Promise<boolean> { return this.healthy; }
  async deleteAll(): Promise<void> { this.deleteAllCalls++; this.rows.clear(); }
}

describe('semantic operations', () => {
  let tmpDir: string;
  let dbManager: DatabaseManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-ops-test-'));
    dbManager = new DatabaseManager(tmpDir);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports indexed, pending, failed, leased, health, and reconciliation state', async () => {
    const failed = addMemory(dbManager, 'failed fact');
    enqueueSemanticUpsert(dbManager, { ...failed, project: null }, EMBEDDING_CONTRACT.version, '2026-07-17T00:00:00.000Z');
    const claimed = claimSemanticWork(dbManager, 1, new Date('2026-07-17T00:00:00.000Z'), 1);
    let current = claimed[0];
    for (let attempt = 0; attempt < 8; attempt++) {
      failSemanticWork(dbManager, current, new Date(`2026-07-17T00:00:${String(attempt).padStart(2, '0')}.000Z`), { baseMs: 0, jitterMs: 0 });
      if (attempt < 7) {
        [current] = claimSemanticWork(dbManager, 1, new Date(`2026-07-17T00:00:${String(attempt + 1).padStart(2, '0')}.000Z`), 1);
      }
    }
    const pending = addMemory(dbManager, 'pending fact');
    enqueueSemanticUpsert(dbManager, { ...pending, project: null }, EMBEDDING_CONTRACT.version, '2026-07-17T00:01:00.000Z');
    const index = new FakeIndex();
    index.rows.set('indexed', { memoryId: 'indexed', contentHash: 'hash', contractVersion: EMBEDDING_CONTRACT.version });

    const status = await getSemanticStatus(dbManager, {
      enabled: true,
      contractVersion: EMBEDDING_CONTRACT.version,
      index,
      embeddingHealth: async () => true,
    });

    assert.equal(status.pending, 1);
    assert.equal(status.failed, 1);
    assert.equal(status.leased, 0);
    assert.equal(status.indexed, 1);
    assert.equal(status.databaseHealthy, true);
    assert.equal(status.embeddingHealthy, true);
    assert.equal(status.lastReconciliationAt, null);
  });

  it('previews missing, stale, changed-contract, and orphaned rows without changing state', async () => {
    addMemory(dbManager, 'valid fact');
    addMemory(dbManager, 'stale fact');
    addMemory(dbManager, 'contract fact');
    addMemory(dbManager, 'missing fact');
    const authority = authoritativeMemorySnapshot(dbManager);
    const [valid, stale, changed] = authority;
    const index = new FakeIndex();
    index.rows.set(valid.memoryId, { memoryId: valid.memoryId, contentHash: valid.contentHash, contractVersion: EMBEDDING_CONTRACT.version });
    index.rows.set(stale.memoryId, { memoryId: stale.memoryId, contentHash: 'old-hash', contractVersion: EMBEDDING_CONTRACT.version });
    index.rows.set(changed.memoryId, { memoryId: changed.memoryId, contentHash: changed.contentHash, contractVersion: 'old-contract' });
    index.rows.set('44444444-4444-4444-8444-444444444444', { memoryId: '44444444-4444-4444-8444-444444444444', contentHash: 'orphan', contractVersion: EMBEDDING_CONTRACT.version });

    const result = await reconcileSemanticIndex(dbManager, authority, index, {
      repair: false,
      contractVersion: EMBEDDING_CONTRACT.version,
    });

    assert.deepStrictEqual(result, { missing: 1, stale: 1, changedContract: 1, orphaned: 1, queued: 0 });
    assert.deepStrictEqual(listSemanticWork(dbManager), []);
    assert.equal(index.rows.size, 4);
  });

  it('repairs drift by queuing real upsert/delete work and records reconciliation time', async () => {
    addMemory(dbManager, 'valid fact');
    addMemory(dbManager, 'stale fact');
    addMemory(dbManager, 'contract fact');
    addMemory(dbManager, 'missing fact');
    const authority = authoritativeMemorySnapshot(dbManager);
    const [valid, stale, changed] = authority;
    const index = new FakeIndex();
    index.rows.set(valid.memoryId, { memoryId: valid.memoryId, contentHash: valid.contentHash, contractVersion: EMBEDDING_CONTRACT.version });
    index.rows.set(stale.memoryId, { memoryId: stale.memoryId, contentHash: 'old-hash', contractVersion: EMBEDDING_CONTRACT.version });
    index.rows.set(changed.memoryId, { memoryId: changed.memoryId, contentHash: changed.contentHash, contractVersion: 'old-contract' });
    index.rows.set('44444444-4444-4444-8444-444444444444', { memoryId: '44444444-4444-4444-8444-444444444444', contentHash: 'orphan', contractVersion: EMBEDDING_CONTRACT.version });

    const result = await reconcileSemanticIndex(dbManager, authority, index, {
      repair: true,
      contractVersion: EMBEDDING_CONTRACT.version,
      now: '2026-07-17T12:00:00.000Z',
    });
    const work = listSemanticWork(dbManager, '2026-07-17T12:00:00.000Z', 16);
    const status = await getSemanticStatus(dbManager, { enabled: true, contractVersion: EMBEDDING_CONTRACT.version });

    assert.deepStrictEqual(result, { missing: 1, stale: 1, changedContract: 1, orphaned: 1, queued: 4 });
    assert.equal(work.filter((entry) => entry.operation === 'upsert').length, 3);
    assert.equal(work.filter((entry) => entry.operation === 'delete').length, 1);
    assert.equal(status.lastReconciliationAt, '2026-07-17T12:00:00.000Z');
  });

  it('requires confirmation before deleting derived rows and requeues authority', async () => {
    addMemory(dbManager, 'fact one');
    addMemory(dbManager, 'fact two');
    const authority = authoritativeMemorySnapshot(dbManager);
    const index = new FakeIndex();
    index.rows.set('old', { memoryId: 'old', contentHash: 'old', contractVersion: 'old' });

    const preview = await rebuildSemanticIndex(dbManager, authority, index, {
      confirm: false,
      contractVersion: EMBEDDING_CONTRACT.version,
    });
    assert.deepStrictEqual(preview, { authoritative: 2, derived: 1, confirmed: false, queued: 0 });
    assert.equal(index.deleteAllCalls, 0);

    const executed = await rebuildSemanticIndex(dbManager, authority, index, {
      confirm: true,
      contractVersion: EMBEDDING_CONTRACT.version,
      now: '2026-07-17T12:00:00.000Z',
    });
    assert.deepStrictEqual(executed, { authoritative: 2, derived: 1, confirmed: true, queued: 2 });
    assert.equal(index.deleteAllCalls, 1);
    assert.equal(listSemanticWork(dbManager, '2026-07-17T12:00:00.000Z', 16).length, 2);
  });

  it('returns redacted status data only', async () => {
    const status = await getSemanticStatus(dbManager, {
      enabled: false,
      contractVersion: EMBEDDING_CONTRACT.version,
    });
    const serialized = JSON.stringify(status);
    assert.doesNotMatch(serialized, /postgres|password|authorization|embedding\s*:\s*\[/i);
  });
});
