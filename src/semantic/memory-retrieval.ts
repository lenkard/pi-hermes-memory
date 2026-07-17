import type { DatabaseManager } from '../store/db.js';
import { searchMemories } from '../store/sqlite-memory-store.js';
import type { SqliteMemoryEntry } from '../store/sqlite-memory-store.js';
import type { MemoryCategory } from '../types.js';

export interface AuthorityRecord {
  memoryId: string;
  content: string;
  contentHash: string;
  project: string | null;
  target: 'memory' | 'user' | 'failure';
  category: MemoryCategory | null;
  created: string;
  lastReferenced: string;
}

export interface SemanticCandidate {
  memoryId: string;
  contentHash: string;
}

export interface EmbeddedQuery {
  vector: readonly number[];
}

export interface SemanticCandidateIndex {
  search(
    embedded: EmbeddedQuery,
    limit: number,
    filters: { project?: string | null; target?: string; category?: MemoryCategory | null },
  ): Promise<SemanticCandidate[]>;
}

export interface MemoryRetrievalRequest {
  project?: string;
  target?: string;
  category?: MemoryCategory;
  limit?: number;
}

export interface MemoryRetrievalEntry {
  memoryId: string;
  content: string;
  project: string | null;
  target: 'memory' | 'user' | 'failure';
  category: MemoryCategory | null;
  created: string;
  lastReferenced: string;
  rank: number;
  source: 'lexical' | 'semantic' | 'hybrid';
}

export interface MemoryRetrievalDiagnostics {
  lexicalCandidates: number;
  semanticCandidates: number;
  returned: number;
  elapsedMs: number;
  semanticElapsedMs: number;
  exclusions: Partial<Record<'stale' | 'unsafe' | 'missing' | 'scope' | 'duplicate', number>>;
  fusion: 'rrf-equal' | 'lexical-only';
  fallback: boolean;
}

export interface MemoryRetrievalResult {
  entries: MemoryRetrievalEntry[];
  fallback: boolean;
  fallbackDiagnostic?: string;
  exclusionsReasons: Partial<Record<'stale' | 'unsafe' | 'missing' | 'scope' | 'duplicate', number>>;
  diagnostics: MemoryRetrievalDiagnostics;
}

export interface MemoryRetrievalDependencies {
  lexical(query: string, options: { project?: string; target?: string; category?: MemoryCategory; limit?: number }): SqliteMemoryEntry[];
  embedQuery?(query: string, signal?: AbortSignal): Promise<readonly number[]>;
  semanticIndex?: SemanticCandidateIndex;
  authority(memoryId: string): AuthorityRecord | null;
  scan(content: string): string | null;
  semanticTimeoutMs?: number;
  semanticEnabled?: boolean;
}

const K = 60;

export async function retrieveMemories(
  _dbManager: DatabaseManager,
  query: string,
  request: MemoryRetrievalRequest,
  deps: MemoryRetrievalDependencies,
): Promise<MemoryRetrievalResult> {
  const startedAt = Date.now();
  const limit = Math.min(request.limit ?? 10, 20);
  const exclusions: MemoryRetrievalResult['exclusionsReasons'] = {};
  const lexicalResults = deps.lexical(query, request);
  const lexicalById = new Map<string, SqliteMemoryEntry>();
  for (const entry of lexicalResults) lexicalById.set(entry.memoryId, entry);

  let semanticCandidates: SemanticCandidate[] = [];
  let fallback = false;
  let fallbackDiagnostic: string | undefined;
  const semanticCandidateLimit = Math.max(limit, 20);
  const timeoutMs = deps.semanticTimeoutMs ?? 2000;

  const semanticEnabled = deps.semanticEnabled !== false && !!deps.embedQuery && !!deps.semanticIndex;
  const controller = new AbortController();
  const semanticStartedAt = Date.now();
  let semanticElapsedMs = 0;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (semanticEnabled && deps.embedQuery && deps.semanticIndex) {
      const vector = await deps.embedQuery(query, controller.signal);
      semanticCandidates = await deps.semanticIndex.search(
        { vector },
        semanticCandidateLimit,
        { project: request.project, target: request.target, category: request.category },
      );
    }
  } catch {
    fallback = true;
    fallbackDiagnostic = 'semantic retrieval unavailable; returning lexical results';
  } finally {
    semanticElapsedMs = Date.now() - semanticStartedAt;
    clearTimeout(timeoutHandle);
  }

  const rrfScores = new Map<string, number>();
  const ranksLexical = new Map<string, number>();
  lexicalResults.forEach((entry, index) => {
    ranksLexical.set(entry.memoryId, index + 1);
    rrfScores.set(entry.memoryId, (rrfScores.get(entry.memoryId) ?? 0) + 1 / (K + index + 1));
  });

  const seenIds = new Set<string>();
  const authorityById = new Map<string, AuthorityRecord>();
  const semanticValid: SemanticCandidate[] = [];
  for (let i = 0; i < semanticCandidates.length; i++) {
    const candidate = semanticCandidates[i];
    if (seenIds.has(candidate.memoryId)) {
      exclusions.duplicate = (exclusions.duplicate ?? 0) + 1;
      continue;
    }
    seenIds.add(candidate.memoryId);
    const authority = deps.authority(candidate.memoryId);
    if (!authority) {
      exclusions.missing = (exclusions.missing ?? 0) + 1;
      continue;
    }
    if (authority.contentHash !== candidate.contentHash) {
      exclusions.stale = (exclusions.stale ?? 0) + 1;
      continue;
    }
    if (request.project !== undefined && authority.project !== (request.project ?? null)) {
      exclusions.scope = (exclusions.scope ?? 0) + 1;
      continue;
    }
    if (request.target && authority.target !== request.target) {
      exclusions.scope = (exclusions.scope ?? 0) + 1;
      continue;
    }
    if (request.category && authority.category !== request.category) {
      exclusions.scope = (exclusions.scope ?? 0) + 1;
      continue;
    }
    authorityById.set(candidate.memoryId, authority);
    semanticValid.push(candidate);
  }

  semanticValid.forEach((candidate, index) => {
    rrfScores.set(candidate.memoryId, (rrfScores.get(candidate.memoryId) ?? 0) + 1 / (K + index + 1));
  });

  const allIds = new Set<string>([...lexicalById.keys(), ...authorityById.keys()]);
  const ranked: MemoryRetrievalEntry[] = [];
  for (const memoryId of allIds) {
    const lexical = lexicalById.get(memoryId);
    const authority = authorityById.get(memoryId);
    const contentSource = authority ?? lexical;
    if (!contentSource) continue;
    const scanError = deps.scan(contentSource.content);
    if (scanError) {
      exclusions.unsafe = (exclusions.unsafe ?? 0) + 1;
      continue;
    }
    const source = lexical && authority ? 'hybrid' : authority ? 'semantic' : 'lexical';
    ranked.push({
      memoryId,
      content: contentSource.content,
      project: authority?.project ?? lexical?.project ?? null,
      target: (authority?.target ?? lexical?.target) as 'memory' | 'user' | 'failure',
      category: authority?.category ?? lexical?.category ?? null,
      created: authority?.created ?? lexical?.created ?? '',
      lastReferenced: authority?.lastReferenced ?? lexical?.lastReferenced ?? '',
      rank: rrfScores.get(memoryId) ?? 0,
      source,
    });
  }

  ranked.sort((left, right) => {
    if (right.rank !== left.rank) return right.rank - left.rank;
    return (right.lastReferenced).localeCompare(left.lastReferenced);
  });

  const entries = ranked.slice(0, limit);
  return {
    entries,
    fallback,
    fallbackDiagnostic,
    exclusionsReasons: exclusions,
    diagnostics: {
      lexicalCandidates: lexicalResults.length,
      semanticCandidates: semanticCandidates.length,
      returned: entries.length,
      elapsedMs: Date.now() - startedAt,
      semanticElapsedMs,
      exclusions,
      fusion: semanticCandidates.length > 0 ? 'rrf-equal' : 'lexical-only',
      fallback,
    },
  };
}

export type { MemoryCategory };