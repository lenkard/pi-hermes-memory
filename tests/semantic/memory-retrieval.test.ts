import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import { addMemory, searchMemories } from '../../src/store/sqlite-memory-store.js';
import {
  retrieveMemories,
  type MemoryRetrievalDependencies,
  type SemanticCandidateIndex,
  type EmbeddedQuery,
} from '../../src/semantic/memory-retrieval.js';
import { EMBEDDING_CONTRACT } from '../../src/semantic/embedding-contract.js';

function vector(): number[] {
  return Array.from({ length: EMBEDDING_CONTRACT.dimensions }, () => 1 / Math.sqrt(EMBEDDING_CONTRACT.dimensions));
}

describe('memory retrieval module', () => {
  let tmpDir: string;
  let dbManager: DatabaseManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-retrieval-test-'));
    dbManager = new DatabaseManager(tmpDir);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function deps(overrides: Partial<MemoryRetrievalDependencies> = {}): MemoryRetrievalDependencies {
    return {
      lexical: (query, options) => searchMemories(dbManager, query, options),
      embedQuery: async () => vector(),
      semanticIndex: {
        async search(_embedded: EmbeddedQuery, _limit: number): Promise<{ memoryId: string; contentHash: string }[]> {
          return [];
        },
      },
      authority: (memoryId) => {
        if (memoryId === 'missing') return null;
        return {
          memoryId,
          content: 'durable fact from authority',
          contentHash: 'hash',
          project: null,
          target: 'memory',
          category: null,
          created: '2026-07-17',
          lastReferenced: '2026-07-17',
        };
      },
      scan: () => null,
      semanticTimeoutMs: 500,
      ...overrides,
    };
  }

  it('fuses lexical and semantic candidates with equal-weight RRF and dedupes by Memory ID', async () => {
    addMemory(dbManager, 'durable lexical hit relevant to query', 'memory', null);
    const depsValue = deps({
      semanticIndex: {
        async search() {
          return [{ memoryId: 'semantic-only', contentHash: 'hash' }];
        },
      },
      authority: (memoryId) => {
        if (memoryId === 'semantic-only') {
          return {
            memoryId,
            content: 'semantic only hit',
            contentHash: 'hash',
            project: null,
            target: 'memory',
            category: null,
            created: '2026-07-17',
            lastReferenced: '2026-07-17',
          };
        }
        const db = dbManager.getDb();
        const row = db.prepare('SELECT memory_id, content, project, target, category, created, last_referenced FROM memories WHERE memory_id = ?').get(memoryId) as
          | { memory_id: string; content: string; project: string | null; target: string; category: string | null; created: string; last_referenced: string }
          | undefined;
        if (!row) return null;
        return {
          memoryId: row.memory_id,
          content: row.content,
          contentHash: 'hash',
          project: row.project,
          target: row.target as 'memory' | 'user' | 'failure',
          category: row.category as null,
          created: row.created,
          lastReferenced: row.last_referenced,
        };
      },
    });

    const result = await retrieveMemories(dbManager, 'durable', {}, depsValue);

    assert.equal(result.entries.length, 2);
    assert.equal(result.fallback, false);
    assert.deepStrictEqual(
      {
        lexicalCandidates: result.diagnostics.lexicalCandidates,
        semanticCandidates: result.diagnostics.semanticCandidates,
        returned: result.diagnostics.returned,
        fusion: result.diagnostics.fusion,
        fallback: result.diagnostics.fallback,
      },
      { lexicalCandidates: 1, semanticCandidates: 1, returned: 2, fusion: 'rrf-equal', fallback: false },
    );
    assert.ok(result.diagnostics.elapsedMs >= 0);
    assert.ok(result.diagnostics.semanticElapsedMs >= 0);
    const ids = result.entries.map((entry) => entry.memoryId);
    assert.ok(ids.includes('semantic-only'));
  });

  it('excludes semantic candidates beyond the configured cosine distance cutoff', async () => {
    const depsValue = deps({
      semanticMaxDistance: 0.35,
      semanticIndex: {
        async search() {
          return [{ memoryId: 'too-distant', contentHash: 'hash', distance: 0.36 }];
        },
      },
    });

    const result = await retrieveMemories(dbManager, 'unrelated query', {}, depsValue);

    assert.equal(result.entries.length, 0);
    assert.equal(result.diagnostics.semanticCandidates, 0);
  });

  it('excludes stale semantic candidates whose authority content hash differs', async () => {
    const depsValue = deps({
      semanticIndex: {
        async search() {
          return [{ memoryId: 'stale-id', contentHash: 'stale-hash' }];
        },
      },
      authority: (memoryId) => {
        if (memoryId === 'stale-id') {
          return {
            memoryId,
            content: 'current content',
            contentHash: 'current-hash',
            project: null,
            target: 'memory',
            category: null,
            created: '2026-07-17',
            lastReferenced: '2026-07-17',
          };
        }
        return null;
      },
    });

    const result = await retrieveMemories(dbManager, 'durable', {}, depsValue);

    assert.equal(result.entries.length, 0);
    assert.deepEqual(result.exclusionsReasons, { stale: 1 });
  });

  it('falls back to lexical results with a redacted diagnostic when embedding rejects', async () => {
    addMemory(dbManager, 'lexical fallback hit', 'memory', null);
    const depsValue = deps({
      embedQuery: async () => { throw new Error('embedding down'); },
    });

    const result = await retrieveMemories(dbManager, 'lexical', {}, depsValue);

    assert.equal(result.fallback, true);
    assert.ok(result.fallbackDiagnostic);
    assert.ok(result.fallbackDiagnostic.length > 0);
    assert.ok(!result.fallbackDiagnostic.includes('embedding down'));
    assert.equal(result.entries.length, 1);
    assert.match(result.entries[0].content, /lexical fallback hit/);
  });

  it('enforces the hard two-second timeout on the semantic path', async () => {
    addMemory(dbManager, 'timeout lexical hit', 'memory', null);
    let aborted = false;
    const depsValue = deps({
      embedQuery: async (_query, signal) => {
        return new Promise((_, reject) => {
          signal?.addEventListener?.('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        });
      },
      semanticTimeoutMs: 50,
    });

    const result = await retrieveMemories(dbManager, 'timeout', {}, depsValue);

    assert.equal(result.fallback, true);
    assert.equal(aborted, true);
    assert.ok(result.entries.length >= 1);
  });

  it('excludes unsafe candidates found at read time', async () => {
    addMemory(dbManager, 'unsafe injection content', 'memory', null);
    const depsValue = deps({
      scan: (content) => (content.includes('injection') ? 'unsafe content' : null),
    });
    const result = await retrieveMemories(dbManager, 'unsafe', {}, depsValue);
    assert.equal(result.entries.length, 0);
    assert.deepEqual(result.exclusionsReasons, { unsafe: 1 });
  });

  it('excludes wrong-project semantic candidates in default Active Project scope', async () => {
    addMemory(dbManager, 'global hit', 'memory', null);
    addMemory(dbManager, 'other project hit', 'memory', 'other-project');
    let observedFilters: unknown;
    const depsValue = deps({
      semanticIndex: {
        async search(_embedding, _limit, filters) {
          observedFilters = filters;
          return [
            { memoryId: 'wrong-project', contentHash: 'hash' },
          ];
        },
      },
      authority: (memoryId) => {
        if (memoryId === 'wrong-project') {
          return {
            memoryId,
            content: 'wrong project content',
            contentHash: 'hash',
            project: 'other-project',
            target: 'memory',
            category: null,
            created: '2026-07-17',
            lastReferenced: '2026-07-17',
          };
        }
        return null;
      },
    });

    const result = await retrieveMemories(dbManager, 'query', { activeProject: 'active-project' }, depsValue);

    assert.deepEqual(observedFilters, {
      project: undefined,
      activeProject: 'active-project',
      target: undefined,
      category: undefined,
    });
    assert.equal(result.entries.length, 0);
    assert.deepEqual(result.exclusionsReasons, { scope: 1 });
  });
});