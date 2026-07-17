import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../store/db.js';
import { parseMemoryMetadata } from '../store/memory-metadata.js';
import type { MemoryCategory } from '../types.js';

export const MAX_SEMANTIC_ATTEMPTS = 8;
export const MAX_SEMANTIC_BATCH_SIZE = 16;

export interface SemanticQueueMemory {
  memoryId: string;
  content: string;
  project: string | null;
  target: 'memory' | 'user' | 'failure';
  category: MemoryCategory | null;
}

export interface SemanticQueueWork extends Omit<SemanticQueueMemory, 'content'> {
  operation: 'upsert' | 'delete';
  content: string | null;
  contentHash: string | null;
  contractVersion: string;
  attempts: number;
  nextAttemptAt: string;
  leaseToken: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticBackoffOptions {
  baseMs?: number;
  jitterMs?: number;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function isoNow(): string {
  return new Date().toISOString();
}

function mapWork(row: Record<string, unknown>): SemanticQueueWork {
  return {
    memoryId: String(row.memory_id),
    operation: row.operation as 'upsert' | 'delete',
    content: typeof row.content === 'string' ? row.content : null,
    project: typeof row.project === 'string' ? row.project : null,
    target: row.target as 'memory' | 'user' | 'failure',
    category: (row.category as MemoryCategory | null) ?? null,
    contentHash: typeof row.content_hash === 'string' ? row.content_hash : null,
    contractVersion: String(row.contract_version),
    attempts: Number(row.attempts),
    nextAttemptAt: String(row.next_attempt_at),
    leaseToken: typeof row.lease_token === 'string' ? row.lease_token : null,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function enqueue(
  dbManager: DatabaseManager,
  memory: SemanticQueueMemory,
  operation: 'upsert' | 'delete',
  contractVersion: string,
  now = isoNow(),
): void {
  const db = dbManager.getDb();
  const content = operation === 'upsert' ? memory.content : null;
  const contentHash = content === null ? null : hashContent(content);
  db.prepare(`
    INSERT INTO semantic_index_queue (
      memory_id, operation, content, project, target, category, content_hash,
      contract_version, attempts, next_attempt_at, lease_until, lease_token,
      last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, ?, ?)
    ON CONFLICT(memory_id) DO UPDATE SET
      operation = excluded.operation,
      content = excluded.content,
      project = excluded.project,
      target = excluded.target,
      category = excluded.category,
      content_hash = excluded.content_hash,
      contract_version = excluded.contract_version,
      attempts = 0,
      next_attempt_at = excluded.next_attempt_at,
      lease_until = NULL,
      lease_token = NULL,
      last_error = NULL,
      updated_at = excluded.updated_at
  `).run(
    memory.memoryId,
    operation,
    content,
    memory.project,
    memory.target,
    memory.category,
    contentHash,
    contractVersion,
    now,
    now,
    now,
  );
}

export function enqueueSemanticUpsert(
  dbManager: DatabaseManager,
  memory: SemanticQueueMemory,
  contractVersion: string,
  now = isoNow(),
): void {
  enqueue(dbManager, memory, 'upsert', contractVersion, now);
}

export function enqueueSemanticDelete(
  dbManager: DatabaseManager,
  memoryId: string,
  contractVersion: string,
  now = isoNow(),
): void {
  enqueue(dbManager, {
    memoryId,
    content: '',
    project: null,
    target: 'memory',
    category: null,
  }, 'delete', contractVersion, now);
}

export function enqueueMarkdownUpsert(
  dbManager: DatabaseManager,
  rawEntry: string,
  target: 'memory' | 'user' | 'failure',
  project: string | null,
  contractVersion: string,
  now = isoNow(),
): void {
  const metadata = parseMemoryMetadata(rawEntry);
  if (!metadata.memoryId) return;
  enqueue(dbManager, {
    memoryId: metadata.memoryId,
    content: metadata.text,
    project,
    target,
    category: null,
  }, 'upsert', contractVersion, now);
}

export function enqueueMarkdownDelete(
  dbManager: DatabaseManager,
  rawEntry: string,
  contractVersion: string,
  now = isoNow(),
): void {
  const metadata = parseMemoryMetadata(rawEntry);
  if (!metadata.memoryId) return;
  enqueueSemanticDelete(dbManager, metadata.memoryId, contractVersion, now);
}

export function listSemanticWork(
  dbManager: DatabaseManager,
  now = isoNow(),
  limit = MAX_SEMANTIC_BATCH_SIZE,
): SemanticQueueWork[] {
  const db = dbManager.getDb();
  const rows = db.prepare(`
    SELECT *
    FROM semantic_index_queue
    WHERE attempts < ?
      AND next_attempt_at <= ?
      AND (lease_until IS NULL OR lease_until <= ?)
    ORDER BY next_attempt_at ASC, created_at ASC, memory_id ASC
    LIMIT ?
  `).all(MAX_SEMANTIC_ATTEMPTS, now, now, Math.min(MAX_SEMANTIC_BATCH_SIZE, Math.max(1, limit))) as Record<string, unknown>[];
  return rows.map(mapWork);
}

export function claimSemanticWork(
  dbManager: DatabaseManager,
  limit = MAX_SEMANTIC_BATCH_SIZE,
  now = new Date(),
  leaseMs = 120_000,
): SemanticQueueWork[] {
  const db = dbManager.getDb();
  const nowIsoValue = now.toISOString();
  const leaseUntil = new Date(now.getTime() + Math.max(1, leaseMs)).toISOString();
  const claim = () => {
    const rows = db.prepare(`
      SELECT *
      FROM semantic_index_queue
      WHERE attempts < ?
        AND next_attempt_at <= ?
        AND (lease_until IS NULL OR lease_until <= ?)
      ORDER BY next_attempt_at ASC, created_at ASC, memory_id ASC
      LIMIT ?
    `).all(MAX_SEMANTIC_ATTEMPTS, nowIsoValue, nowIsoValue, Math.min(MAX_SEMANTIC_BATCH_SIZE, Math.max(1, limit))) as Record<string, unknown>[];
    const update = db.prepare(`
      UPDATE semantic_index_queue
      SET lease_until = ?, lease_token = ?, updated_at = ?
      WHERE memory_id = ?
        AND (lease_until IS NULL OR lease_until <= ?)
    `);
    return rows.flatMap((row) => {
      const leaseToken = randomUUID();
      const result = update.run(leaseUntil, leaseToken, nowIsoValue, row.memory_id, nowIsoValue);
      if (Number(result.changes) !== 1) return [];
      return [mapWork({ ...row, lease_until: leaseUntil, lease_token: leaseToken, updated_at: nowIsoValue })];
    });
  };

  const transactional = db.transaction?.(claim);
  return transactional ? transactional() : claim();
}

export function completeSemanticWork(dbManager: DatabaseManager, work: SemanticQueueWork): void {
  if (!work.leaseToken) return;
  dbManager.getDb().prepare(`
    DELETE FROM semantic_index_queue
    WHERE memory_id = ? AND lease_token = ?
  `).run(work.memoryId, work.leaseToken);
}

export function releaseSemanticWork(
  dbManager: DatabaseManager,
  work: SemanticQueueWork,
  now = new Date(),
): void {
  if (!work.leaseToken) return;
  dbManager.getDb().prepare(`
    UPDATE semantic_index_queue
    SET lease_until = NULL, lease_token = NULL, updated_at = ?
    WHERE memory_id = ? AND lease_token = ?
  `).run(now.toISOString(), work.memoryId, work.leaseToken);
}

export function failSemanticWork(
  dbManager: DatabaseManager,
  work: SemanticQueueWork,
  now = new Date(),
  options: SemanticBackoffOptions = {},
): void {
  if (!work.leaseToken) return;
  const attempts = work.attempts + 1;
  const exhausted = attempts >= MAX_SEMANTIC_ATTEMPTS;
  const baseMs = Math.max(0, options.baseMs ?? 1_000);
  const jitterMs = Math.max(0, options.jitterMs ?? 250);
  const delay = exhausted
    ? 365 * 24 * 60 * 60 * 1000
    : baseMs * (2 ** Math.max(0, attempts - 1)) + Math.floor(Math.random() * jitterMs);
  const safeError = 'semantic indexing failed';
  dbManager.getDb().prepare(`
    UPDATE semantic_index_queue
    SET attempts = ?, next_attempt_at = ?, lease_until = NULL, lease_token = NULL,
        last_error = ?, updated_at = ?
    WHERE memory_id = ? AND lease_token = ?
  `).run(
    attempts,
    new Date(now.getTime() + delay).toISOString(),
    safeError,
    now.toISOString(),
    work.memoryId,
    work.leaseToken,
  );
}
