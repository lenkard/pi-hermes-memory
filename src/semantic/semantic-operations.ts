import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../store/db.js';
import { getMemories } from '../store/sqlite-memory-store.js';
import {
  enqueueSemanticDelete,
  enqueueSemanticUpsert,
  MAX_SEMANTIC_ATTEMPTS,
} from './semantic-index-queue.js';
import type { MemoryCategory } from '../types.js';

const LAST_RECONCILIATION_KEY = 'semantic.last_successful_reconciliation';

export interface AuthoritativeMemory {
  memoryId: string;
  content: string;
  contentHash: string;
  project: string | null;
  target: 'memory' | 'user' | 'failure';
  category: MemoryCategory | null;
}

export interface DerivedIndexRow {
  memoryId: string;
  contentHash: string;
  contractVersion: string;
}

export interface SemanticIndexOperations {
  listAll(): Promise<DerivedIndexRow[]>;
  count(): Promise<number>;
  health(): Promise<boolean>;
  deleteAll(): Promise<void>;
}

export interface SemanticStatus {
  enabled: boolean;
  contractVersion: string;
  pending: number;
  failed: number;
  leased: number;
  indexed: number | null;
  databaseHealthy: boolean | null;
  embeddingHealthy: boolean | null;
  lastReconciliationAt: string | null;
}

export interface ReconcileResult {
  missing: number;
  stale: number;
  changedContract: number;
  orphaned: number;
  queued: number;
}

export interface RebuildResult {
  authoritative: number;
  derived: number;
  confirmed: boolean;
  queued: number;
}

export function authoritativeMemorySnapshot(dbManager: DatabaseManager): AuthoritativeMemory[] {
  return getMemories(dbManager).map((entry) => ({
    memoryId: entry.memoryId,
    content: entry.content,
    contentHash: createHash('sha256').update(entry.content).digest('hex'),
    project: entry.project,
    target: entry.target,
    category: entry.category,
  }));
}

export async function getSemanticStatus(
  dbManager: DatabaseManager,
  input: {
    enabled: boolean;
    contractVersion: string;
    index?: SemanticIndexOperations | null;
    embeddingHealth?: (() => Promise<boolean>) | null;
  },
): Promise<SemanticStatus> {
  const db = dbManager.getDb();
  const now = new Date().toISOString();
  const pending = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM semantic_index_queue
    WHERE attempts < ? AND (lease_until IS NULL OR lease_until <= ?)
  `).get(MAX_SEMANTIC_ATTEMPTS, now) as { count: number }).count;
  const failed = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM semantic_index_queue
    WHERE attempts >= ?
  `).get(MAX_SEMANTIC_ATTEMPTS) as { count: number }).count;
  const leased = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM semantic_index_queue
    WHERE lease_until IS NOT NULL AND lease_until > ?
  `).get(now) as { count: number }).count;
  const metadata = db.prepare(`
    SELECT value FROM extension_metadata WHERE key = ?
  `).get(LAST_RECONCILIATION_KEY) as { value: string } | undefined;

  let indexed: number | null = null;
  let databaseHealthy: boolean | null = null;
  let embeddingHealthy: boolean | null = null;
  if (input.enabled && input.index) {
    try {
      databaseHealthy = await input.index.health();
      indexed = databaseHealthy ? await input.index.count() : null;
    } catch {
      databaseHealthy = false;
    }
  }
  if (input.enabled && input.embeddingHealth) {
    try {
      embeddingHealthy = await input.embeddingHealth();
    } catch {
      embeddingHealthy = false;
    }
  }

  return {
    enabled: input.enabled,
    contractVersion: input.contractVersion,
    pending,
    failed,
    leased,
    indexed,
    databaseHealthy,
    embeddingHealthy,
    lastReconciliationAt: metadata?.value ?? null,
  };
}

export async function reconcileSemanticIndex(
  dbManager: DatabaseManager,
  authoritative: readonly AuthoritativeMemory[],
  index: SemanticIndexOperations,
  options: { repair: boolean; contractVersion: string; now?: string },
): Promise<ReconcileResult> {
  const existing = await index.listAll();
  const authorityById = new Map(authoritative.map((entry) => [entry.memoryId, entry]));
  const remoteById = new Map(existing.map((entry) => [entry.memoryId, entry]));
  let missing = 0;
  let stale = 0;
  let changedContract = 0;
  let orphaned = 0;
  let queued = 0;
  const now = options.now ?? new Date().toISOString();

  for (const authority of authoritative) {
    const remote = remoteById.get(authority.memoryId);
    if (!remote) {
      missing++;
    } else if (remote.contractVersion !== options.contractVersion) {
      changedContract++;
    } else if (remote.contentHash !== authority.contentHash) {
      stale++;
    } else {
      continue;
    }

    if (options.repair) {
      enqueueSemanticUpsert(dbManager, authority, options.contractVersion, now);
      queued++;
    }
  }

  for (const remote of existing) {
    if (authorityById.has(remote.memoryId)) continue;
    orphaned++;
    if (options.repair) {
      enqueueSemanticDelete(dbManager, remote.memoryId, options.contractVersion, now);
      queued++;
    }
  }

  if (options.repair) {
    dbManager.getDb().prepare(`
      INSERT INTO extension_metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(LAST_RECONCILIATION_KEY, now);
  }

  return { missing, stale, changedContract, orphaned, queued };
}

export async function rebuildSemanticIndex(
  dbManager: DatabaseManager,
  authoritative: readonly AuthoritativeMemory[],
  index: SemanticIndexOperations,
  options: { confirm: boolean; contractVersion: string; now?: string },
): Promise<RebuildResult> {
  const derived = await index.count();
  if (!options.confirm) {
    return { authoritative: authoritative.length, derived, confirmed: false, queued: 0 };
  }

  await index.deleteAll();
  const db = dbManager.getDb();
  db.prepare('DELETE FROM semantic_index_queue').run();
  const now = options.now ?? new Date().toISOString();
  for (const memory of authoritative) {
    enqueueSemanticUpsert(dbManager, memory, options.contractVersion, now);
  }

  return {
    authoritative: authoritative.length,
    derived,
    confirmed: true,
    queued: authoritative.length,
  };
}
