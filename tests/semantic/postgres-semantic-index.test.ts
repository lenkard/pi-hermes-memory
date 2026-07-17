import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PostgresSemanticIndex,
  SEMANTIC_INDEX_TABLE,
  type Queryable,
} from '../../src/semantic/postgres-semantic-index.js';
import { EMBEDDING_CONTRACT } from '../../src/semantic/embedding-contract.js';
import type { SemanticQueueWork } from '../../src/semantic/semantic-index-queue.js';

function work(): SemanticQueueWork {
  return {
    memoryId: '11111111-1111-4111-8111-111111111111',
    operation: 'upsert',
    content: 'must never be sent to PostgreSQL',
    project: 'project-a',
    target: 'memory',
    category: 'convention',
    contentHash: 'hash',
    contractVersion: EMBEDDING_CONTRACT.version,
    attempts: 0,
    nextAttemptAt: '2026-07-17T00:00:00.000Z',
    leaseToken: 'lease',
    lastError: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  };
}

describe('PostgresSemanticIndex', () => {
  it('creates a vector(1024) metadata-only schema', async () => {
    const queries: string[] = [];
    const client: Queryable = {
      query: async (text) => {
        queries.push(text);
        return { rows: [], rowCount: 0 };
      },
    };
    await new PostgresSemanticIndex(client).ensureSchema();

    assert.match(queries[0], /CREATE EXTENSION IF NOT EXISTS vector/);
    assert.match(queries[1], new RegExp(`CREATE TABLE IF NOT EXISTS ${SEMANTIC_INDEX_TABLE}`));
    assert.match(queries[1], /embedding vector\(1024\)/);
    assert.doesNotMatch(queries[1], /content\s+TEXT/i);
  });

  it('upserts vectors and metadata without including plaintext content', async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client: Queryable = {
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [], rowCount: 1 };
      },
    };
    const vector = Array.from({ length: EMBEDDING_CONTRACT.dimensions }, () => 1 / Math.sqrt(EMBEDDING_CONTRACT.dimensions));

    await new PostgresSemanticIndex(client).upsert(work(), vector);

    assert.match(calls[0].text, /ON CONFLICT \(memory_id\) DO UPDATE/);
    assert.match(calls[0].text, /embedding/);
    assert.ok(!calls[0].values?.includes(work().content));
    assert.equal(calls[0].values?.[0], work().memoryId);
    assert.equal(calls[0].values?.[5], work().contentHash);
  });

  it('lists, counts, checks health, and deletes only derived rows', async () => {
    const calls: string[] = [];
    const client: Queryable = {
      query: async (text) => {
        calls.push(text);
        if (text.includes('memory_id, content_hash, contract_version')) {
          return { rows: [{ memory_id: 'id', content_hash: 'hash', contract_version: 'contract' }], rowCount: 1 };
        }
        if (text.includes('COUNT(*)')) return { rows: [{ count: 2 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    const index = new PostgresSemanticIndex(client);

    assert.deepStrictEqual(await index.listAll(), [{ memoryId: 'id', contentHash: 'hash', contractVersion: 'contract' }]);
    assert.equal(await index.count(), 2);
    assert.equal(await index.health(), true);
    await index.deleteAll();

    assert.ok(calls.some((sql) => /^SELECT 1$/.test(sql)));
    assert.ok(calls.some((sql) => /DELETE FROM pi_memory_semantic_index/.test(sql)));
  });

  it('applies scope filters before exact cosine ranking', async () => {
    let call: { text: string; values?: unknown[] } | undefined;
    const client: Queryable = {
      query: async (text, values) => {
        call = { text, values };
        return { rows: [{ memory_id: 'id', content_hash: 'hash', distance: '0.25' }], rowCount: 1 };
      },
    };
    const embedding = Array.from({ length: EMBEDDING_CONTRACT.dimensions }, () => 1 / Math.sqrt(EMBEDDING_CONTRACT.dimensions));

    const results = await new PostgresSemanticIndex(client).search(
      { vector: embedding },
      10,
      { project: 'project-a', target: 'memory', category: 'convention' },
    );

    assert.match(call?.text ?? '', /WHERE project = \$3 AND target = \$4 AND category = \$5\s+ORDER BY embedding <=> \$1::vector/);
    assert.deepStrictEqual(call?.values?.slice(1), [10, 'project-a', 'memory', 'convention']);
    assert.doesNotMatch(call?.text ?? '', /hnsw|ivfflat/i);
    assert.deepStrictEqual(results, [{ memoryId: 'id', contentHash: 'hash', distance: 0.25 }]);
  });

  it('deletes by stable Memory ID only', async () => {
    let values: unknown[] | undefined;
    const client: Queryable = {
      query: async (_text, queryValues) => {
        values = queryValues;
        return { rows: [], rowCount: 1 };
      },
    };

    await new PostgresSemanticIndex(client).delete(work().memoryId);

    assert.deepStrictEqual(values, [work().memoryId]);
  });
});
