import type { DatabaseManager } from '../store/db.js';
import {
  claimSemanticWork,
  completeSemanticWork,
  failSemanticWork,
  type SemanticQueueWork,
} from './semantic-index-queue.js';

export interface EmbeddingClientLike {
  embedDocument(content: string): Promise<readonly number[]>;
}

export interface PostgresIndexLike {
  upsert(work: SemanticQueueWork, vector: readonly number[]): Promise<void>;
  delete(memoryId: string): Promise<void>;
}

export interface SemanticWorkerSummary {
  processed: number;
  failed: number;
}

export async function runSemanticIndexWorkerOnce(
  dbManager: DatabaseManager,
  embedding: EmbeddingClientLike,
  index: PostgresIndexLike,
  batchSize = 16,
  now: Date = new Date(),
): Promise<SemanticWorkerSummary> {
  const claimed = claimSemanticWork(dbManager, batchSize, now);
  let processed = 0;
  let failed = 0;

  for (const work of claimed) {
    try {
      if (work.operation === 'delete') {
        await index.delete(work.memoryId);
      } else if (work.content === null) {
        throw new Error('upsert work is missing content');
      } else {
        const vector = await embedding.embedDocument(work.content);
        await index.upsert(work, vector);
      }
      completeSemanticWork(dbManager, work);
      processed++;
    } catch (error) {
      failSemanticWork(dbManager, work, now, {}, error instanceof Error ? error.message : 'unknown error');
      failed++;
    }
  }

  return { processed, failed };
}