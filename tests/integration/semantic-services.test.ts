import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import { HttpEmbeddingClient } from '../../src/semantic/embedding-client.js';
import { EMBEDDING_CONTRACT } from '../../src/semantic/embedding-contract.js';
import { PostgresSemanticIndex } from '../../src/semantic/postgres-semantic-index.js';
import { reconcileSemanticIndex, type AuthoritativeMemory } from '../../src/semantic/semantic-operations.js';
import { runSemanticStartupWork } from '../../src/semantic/semantic-index-worker.js';
import type { SemanticQueueWork } from '../../src/semantic/semantic-index-queue.js';

const postgresUrl = process.env.PI_HERMES_MEMORY_POSTGRES_URL;
const embeddingEndpoint = process.env.PI_HERMES_MEMORY_EMBEDDING_ENDPOINT;
const embeddingApiKey = process.env.PI_HERMES_MEMORY_EMBEDDING_API_KEY;
const enabled = Boolean(postgresUrl && embeddingEndpoint && embeddingApiKey);

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function authoritative(memoryId: string, content: string): AuthoritativeMemory {
  return {
    memoryId,
    content,
    contentHash: hash(content),
    project: 'semantic-integration-test',
    target: 'memory',
    category: null,
  };
}

function work(memory: AuthoritativeMemory, contractVersion = EMBEDDING_CONTRACT.version): SemanticQueueWork {
  return {
    ...memory,
    operation: 'upsert',
    contractVersion,
    attempts: 0,
    nextAttemptAt: new Date(0).toISOString(),
    leaseToken: 'integration-test',
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

it('repairs missing, stale, changed-contract, and orphaned rows against real services', { skip: !enabled }, async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-services-integration-'));
  const dbManager = new DatabaseManager(tmpDir);
  const embedding = new HttpEmbeddingClient(embeddingEndpoint!, embeddingApiKey!);
  const index = PostgresSemanticIndex.fromConnectionString(postgresUrl!, {
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
    statement_timeout: 2_000,
  });
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const authority = [
    authoritative(ids[0], 'integration missing memory'),
    authoritative(ids[1], 'integration current stale memory'),
    authoritative(ids[2], 'integration changed contract memory'),
  ];
  const orphan = authoritative(ids[3], 'integration orphan memory');

  try {
    await index.ensureSchema();
    await index.upsert(work({ ...authority[1], content: 'integration old stale memory', contentHash: hash('integration old stale memory') }), await embedding.embedDocument('integration old stale memory'));
    await index.upsert(work(authority[2], 'obsolete-contract'), await embedding.embedDocument(authority[2].content));
    await index.upsert(work(orphan), await embedding.embedDocument(orphan.content));

    const drift = await reconcileSemanticIndex(dbManager, authority, index, {
      repair: true,
      contractVersion: EMBEDDING_CONTRACT.version,
    });
    assert.deepStrictEqual(drift, { missing: 1, stale: 1, changedContract: 1, orphaned: 1, queued: 4 });

    const summary = await runSemanticStartupWork(dbManager, embedding, index, { maxEntries: 20 });
    assert.equal(summary.processed, 4);

    const rows = new Map((await index.listAll())
      .filter((row) => ids.includes(row.memoryId))
      .map((row) => [row.memoryId, row]));
    assert.equal(rows.size, 3);
    for (const memory of authority) {
      assert.equal(rows.get(memory.memoryId)?.contentHash, memory.contentHash);
      assert.equal(rows.get(memory.memoryId)?.contractVersion, EMBEDDING_CONTRACT.version);
    }
    assert.equal(rows.has(orphan.memoryId), false);
  } finally {
    for (const id of ids) {
      try { await index.delete(id); } catch {}
    }
    await index.close();
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
