import { afterEach, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import { addMemory, getMemoryByMemoryId, searchMemories } from '../../src/store/sqlite-memory-store.js';
import { registerMemorySearchTool } from '../../src/tools/memory-search-tool.js';
import type { MemoryRetrievalDependencies } from '../../src/semantic/memory-retrieval.js';

let ROOT_DIR = '';

afterEach(() => {
  if (ROOT_DIR) fs.rmSync(ROOT_DIR, { recursive: true, force: true });
  ROOT_DIR = '';
});

function makeDbManager(): DatabaseManager {
  ROOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-memory-search-tool-test-'));
  return new DatabaseManager(ROOT_DIR);
}

describe('registerMemorySearchTool', () => {
  it('returns a broader natural-language match when strict term matching misses', async () => {
    const dbManager = makeDbManager();
    addMemory(dbManager, "user's name is Naruto", 'user');

    let captured: any;
    const mockPi = {
      registerTool: (def: any) => {
        captured = def;
      },
    } as any;

    registerMemorySearchTool(mockPi, dbManager);

    const result = await captured.execute('tc-1', { query: 'name identity Naruto', target: 'user' });

    assert.strictEqual(result.details.success, true);
    assert.strictEqual(result.details.count, 1);
    assert.match(result.content[0].text, /Naruto/);

    dbManager.close();
  });

  it('returns hybrid results and a redacted fallback diagnostic when the semantic path fails', async () => {
    const dbManager = makeDbManager();
    addMemory(dbManager, 'lexical fallback hit', 'memory', null);
    let captured: any;
    const mockPi = { registerTool: (def: any) => { captured = def; } } as any;
    const deps: MemoryRetrievalDependencies = {
      lexical: (query, options) => searchMemories(dbManager, query, options),
      embedQuery: async () => { throw new Error('embedding endpoint leaked secret'); },
      semanticIndex: { async search() { return []; } },
      authority: (memoryId) => {
        const entry = getMemoryByMemoryId(dbManager, memoryId);
        return entry ? { memoryId, content: entry.content, contentHash: 'hash', project: entry.project, target: entry.target, category: entry.category, created: entry.created, lastReferenced: entry.lastReferenced } : null;
      },
      scan: () => null,
      semanticTimeoutMs: 500,
    };
    registerMemorySearchTool(mockPi, dbManager, deps);
    const result = await captured.execute('tc', { query: 'lexical' });
    assert.strictEqual(result.details.success, true);
    assert.strictEqual(result.details.fallback, true);
    assert.ok(!JSON.stringify(result.details).includes('leaked secret'));
    assert.match(result.content[0].text, /lexical fallback hit/);
    dbManager.close();
  });
});
