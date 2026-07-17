import type { DatabaseManager } from '../store/db.js';
import {
  claimSemanticWork,
  completeSemanticWork,
  failSemanticWork,
  releaseSemanticWork,
  MAX_SEMANTIC_BATCH_SIZE,
  type SemanticQueueWork,
} from './semantic-index-queue.js';

export interface EmbeddingClientLike {
  embedDocument(content: string, signal?: AbortSignal): Promise<readonly number[]>;
}

export interface PostgresIndexLike {
  upsert(work: SemanticQueueWork, vector: readonly number[]): Promise<void>;
  delete(memoryId: string): Promise<void>;
}

export interface SemanticWorkerSummary {
  claimed: number;
  processed: number;
  failed: number;
  released: number;
}

export async function runSemanticIndexWorkerOnce(
  dbManager: DatabaseManager,
  embedding: EmbeddingClientLike,
  index: PostgresIndexLike,
  batchSize = MAX_SEMANTIC_BATCH_SIZE,
  now: Date = new Date(),
  signal?: AbortSignal,
): Promise<SemanticWorkerSummary> {
  const claimed = claimSemanticWork(
    dbManager,
    Math.min(MAX_SEMANTIC_BATCH_SIZE, Math.max(1, batchSize)),
    now,
  );
  let processed = 0;
  let failed = 0;
  let released = 0;

  const releaseRemaining = (start: number): void => {
    for (const pending of claimed.slice(start)) {
      releaseSemanticWork(dbManager, pending, now);
      released++;
    }
  };

  for (let indexPosition = 0; indexPosition < claimed.length; indexPosition++) {
    const work = claimed[indexPosition];
    if (signal?.aborted) {
      releaseRemaining(indexPosition);
      break;
    }

    try {
      if (work.operation === 'delete') {
        await index.delete(work.memoryId);
      } else if (work.content === null) {
        throw new Error('upsert work is missing content');
      } else {
        const vector = await embedding.embedDocument(work.content, signal);
        if (signal?.aborted) {
          releaseRemaining(indexPosition);
          break;
        }
        await index.upsert(work, vector);
      }
      completeSemanticWork(dbManager, work);
      processed++;
    } catch {
      if (signal?.aborted) {
        releaseRemaining(indexPosition);
        break;
      }
      failSemanticWork(dbManager, work, now);
      failed++;
    }
  }

  return { claimed: claimed.length, processed, failed, released };
}

export async function runSemanticStartupWork(
  dbManager: DatabaseManager,
  embedding: EmbeddingClientLike,
  index: PostgresIndexLike,
  options: { maxEntries?: number; signal?: AbortSignal; now?: Date } = {},
): Promise<SemanticWorkerSummary> {
  const maximum = Math.min(20, Math.max(0, options.maxEntries ?? 20));
  const total: SemanticWorkerSummary = { claimed: 0, processed: 0, failed: 0, released: 0 };

  while (total.claimed < maximum && !options.signal?.aborted) {
    const remaining = maximum - total.claimed;
    const summary = await runSemanticIndexWorkerOnce(
      dbManager,
      embedding,
      index,
      Math.min(MAX_SEMANTIC_BATCH_SIZE, remaining),
      options.now ?? new Date(),
      options.signal,
    );
    total.claimed += summary.claimed;
    total.processed += summary.processed;
    total.failed += summary.failed;
    total.released += summary.released;
    if (summary.claimed === 0 || summary.released > 0) break;
  }

  return total;
}
