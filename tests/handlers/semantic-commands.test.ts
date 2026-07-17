import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import { addMemory } from '../../src/store/sqlite-memory-store.js';
import { registerSemanticCommands } from '../../src/handlers/semantic-commands.js';
import type { DerivedIndexRow, SemanticIndexOperations } from '../../src/semantic/semantic-operations.js';
import { EMBEDDING_CONTRACT } from '../../src/semantic/embedding-contract.js';

class FakeIndex implements SemanticIndexOperations {
  rows = new Map<string, DerivedIndexRow>();
  async listAll(): Promise<DerivedIndexRow[]> { return [...this.rows.values()]; }
  async count(): Promise<number> { return this.rows.size; }
  async health(): Promise<boolean> { return true; }
  async deleteAll(): Promise<void> { this.rows.clear(); }
}

describe('semantic commands', () => {
  let tmpDir: string;
  let dbManager: DatabaseManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-command-test-'));
    dbManager = new DatabaseManager(tmpDir);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function register(
    index: SemanticIndexOperations | null = new FakeIndex(),
    cancelWorker?: () => void,
    scheduleWorker?: () => void,
  ) {
    const commands = new Map<string, any>();
    const pi = { registerCommand: (name: string, definition: any) => commands.set(name, definition) } as any;
    registerSemanticCommands(pi, {
      dbManager,
      enabled: true,
      contractVersion: EMBEDDING_CONTRACT.version,
      index,
      embeddingHealth: async () => true,
      scheduleWorker,
      cancelWorker,
    });
    return commands;
  }

  function context() {
    const notifications: Array<{ message: string; level?: string }> = [];
    return {
      notifications,
      ctx: { ui: { notify: (message: string, level?: string) => notifications.push({ message, level }) } },
    };
  }

  it('status reports bounded state without secrets, URLs, vectors, or memory text', async () => {
    addMemory(dbManager, 'sensitive memory text must not appear');
    const commands = register();
    const { ctx, notifications } = context();

    await commands.get('memory-semantic-status').handler('', ctx);

    const output = notifications.at(-1)?.message ?? '';
    assert.match(output, /Enabled: yes/);
    assert.match(output, /Contract: qwen3-embedding-0\.6b-q8_0-v1/);
    assert.match(output, /Database health: healthy/);
    assert.match(output, /Embedding health: healthy/);
    assert.match(output, /Indexed: 0/);
    assert.doesNotMatch(output, /sensitive memory|postgresql:\/\/|Bearer|\[[\d.,-]{20,}\]/);
  });

  it('reconcile previews by default and queues repairs only with repair argument', async () => {
    const memory = addMemory(dbManager, 'repair me');
    const index = new FakeIndex();
    index.rows.set(memory.memoryId, { memoryId: memory.memoryId, contentHash: 'stale', contractVersion: EMBEDDING_CONTRACT.version });
    let scheduled = 0;
    const commands = register(index, undefined, () => { scheduled++; });
    const first = context();

    await commands.get('memory-semantic-reconcile').handler('', first.ctx);
    let queued = (dbManager.getDb().prepare('SELECT COUNT(*) AS count FROM semantic_index_queue').get() as { count: number }).count;
    assert.equal(queued, 0);
    assert.equal(scheduled, 0);
    assert.match(first.notifications.at(-1)?.message ?? '', /preview/i);

    const second = context();
    await commands.get('memory-semantic-reconcile').handler('repair', second.ctx);
    queued = (dbManager.getDb().prepare('SELECT COUNT(*) AS count FROM semantic_index_queue').get() as { count: number }).count;
    assert.equal(queued, 1);
    assert.equal(scheduled, 1);
    assert.match(second.notifications.at(-1)?.message ?? '', /Queued repairs: 1/);
  });

  it('rebuild requires exact confirmation before deleting derived state', async () => {
    addMemory(dbManager, 'rebuild me');
    const index = new FakeIndex();
    index.rows.set('old', { memoryId: 'old', contentHash: 'old', contractVersion: 'old' });
    const commands = register(index);
    const preview = context();

    await commands.get('memory-semantic-rebuild').handler('', preview.ctx);
    assert.equal(index.rows.size, 1);
    assert.match(preview.notifications.at(-1)?.message ?? '', /confirm/);

    const execute = context();
    await commands.get('memory-semantic-rebuild').handler('confirm', execute.ctx);
    assert.equal(index.rows.size, 0);
    const queued = (dbManager.getDb().prepare('SELECT COUNT(*) AS count FROM semantic_index_queue').get() as { count: number }).count;
    assert.equal(queued, 1);
  });

  it('cancels background work while promising durable pending work is preserved', async () => {
    let cancelled = false;
    const commands = register(new FakeIndex(), () => { cancelled = true; });
    const { ctx, notifications } = context();

    await commands.get('memory-semantic-cancel').handler('', ctx);

    assert.equal(cancelled, true);
    assert.match(notifications.at(-1)?.message ?? '', /pending work is preserved/i);
  });

  it('redacts infrastructure failures', async () => {
    const failing: SemanticIndexOperations = {
      async listAll() { throw new Error('postgresql://user:password@secret-host/db'); },
      async count() { throw new Error('Bearer top-secret'); },
      async health() { throw new Error('Authorization: Bearer top-secret'); },
      async deleteAll() { throw new Error('private memory content'); },
    };
    const commands = register(failing);
    const { ctx, notifications } = context();

    await commands.get('memory-semantic-reconcile').handler('', ctx);

    const output = notifications.at(-1)?.message ?? '';
    assert.match(output, /unavailable/i);
    assert.doesNotMatch(output, /password|secret-host|Bearer|private memory/i);
  });
});