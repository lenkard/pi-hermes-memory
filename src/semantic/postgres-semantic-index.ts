import { Pool, type PoolConfig } from 'pg';
import {
  EMBEDDING_CONTRACT,
  validateEmbeddingVector,
  type EmbeddingContract,
} from './embedding-contract.js';
import type { SemanticQueueWork } from './semantic-index-queue.js';

export const SEMANTIC_INDEX_TABLE = 'pi_memory_semantic_index';

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export const SEMANTIC_INDEX_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS ${SEMANTIC_INDEX_TABLE} (
    memory_id UUID PRIMARY KEY,
    project TEXT,
    target TEXT NOT NULL,
    category TEXT,
    contract_version TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
`;

export class PostgresSemanticIndex {
  constructor(
    private readonly client: Queryable,
    private readonly contract: EmbeddingContract = EMBEDDING_CONTRACT,
  ) {}

  static fromConnectionString(connectionString: string, config: Omit<PoolConfig, 'connectionString'> = {}): PostgresSemanticIndex {
    return new PostgresSemanticIndex(new Pool({ ...config, connectionString }));
  }

  async ensureSchema(): Promise<void> {
    await this.client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.client.query(SEMANTIC_INDEX_SCHEMA_SQL);
  }

  async upsert(work: SemanticQueueWork, vector: readonly number[]): Promise<void> {
    if (work.operation !== 'upsert' || !work.contentHash || !validateEmbeddingVector(vector, this.contract)) {
      throw new Error('Semantic upsert does not satisfy the active embedding contract.');
    }

    await this.client.query(`
      INSERT INTO ${SEMANTIC_INDEX_TABLE} (
        memory_id, project, target, category, contract_version,
        content_hash, embedding, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, NOW())
      ON CONFLICT (memory_id) DO UPDATE SET
        project = EXCLUDED.project,
        target = EXCLUDED.target,
        category = EXCLUDED.category,
        contract_version = EXCLUDED.contract_version,
        content_hash = EXCLUDED.content_hash,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `, [
      work.memoryId,
      work.project,
      work.target,
      work.category,
      work.contractVersion,
      work.contentHash,
      `[${vector.join(',')}]`,
      work.createdAt,
    ]);
  }

  async delete(memoryId: string): Promise<void> {
    await this.client.query(
      `DELETE FROM ${SEMANTIC_INDEX_TABLE} WHERE memory_id = $1`,
      [memoryId],
    );
  }

  async close(): Promise<void> {
    const pool = this.client as Partial<Pick<Pool, 'end'>>;
    await pool.end?.();
  }
}
