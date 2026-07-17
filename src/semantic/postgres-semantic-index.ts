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

  async listAll(): Promise<Array<{ memoryId: string; contentHash: string; contractVersion: string }>> {
    const result = await this.client.query(`
      SELECT memory_id, content_hash, contract_version
      FROM ${SEMANTIC_INDEX_TABLE}
      ORDER BY memory_id ASC
    `);
    return (result.rows as Array<{ memory_id: string; content_hash: string; contract_version: string }>).map((row) => ({
      memoryId: row.memory_id,
      contentHash: row.content_hash,
      contractVersion: row.contract_version,
    }));
  }

  async count(): Promise<number> {
    const result = await this.client.query(`SELECT COUNT(*)::int AS count FROM ${SEMANTIC_INDEX_TABLE}`);
    return Number((result.rows[0] as { count?: unknown } | undefined)?.count ?? 0);
  }

  async health(): Promise<boolean> {
    await this.client.query('SELECT 1');
    return true;
  }

  async deleteAll(): Promise<void> {
    await this.client.query(`DELETE FROM ${SEMANTIC_INDEX_TABLE}`);
  }

  async search(
    embedded: { vector: readonly number[] },
    limit: number,
    filters: { project?: string | null; activeProject?: string; target?: string; category?: string | null } = {},
  ): Promise<Array<{ memoryId: string; contentHash: string; distance: number }>> {
    if (!validateEmbeddingVector(embedded.vector, this.contract)) {
      throw new Error('Semantic search vector does not satisfy the active contract.');
    }
    const conditions: string[] = [];
    const values: unknown[] = [`[${embedded.vector.join(',')}]`, limit];
    let paramIndex = 3;
    if (filters.project !== undefined) {
      conditions.push(`project ${filters.project === null ? 'IS NULL' : `= $${paramIndex++}`}`);
      if (filters.project !== null) values.push(filters.project);
    } else if (filters.activeProject) {
      conditions.push(`(project IS NULL OR project = $${paramIndex++})`);
      values.push(filters.activeProject);
    }
    if (filters.target) {
      conditions.push(`target = $${paramIndex++}`);
      values.push(filters.target);
    }
    if (filters.category !== undefined) {
      conditions.push(`category ${filters.category === null ? 'IS NULL' : `= $${paramIndex++}`}`);
      if (filters.category !== null) values.push(filters.category);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.client.query(
      `SELECT memory_id, content_hash, embedding <=> $1::vector AS distance
       FROM ${SEMANTIC_INDEX_TABLE}
       ${whereClause}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      values,
    );
    return (result.rows as Array<{ memory_id: string; content_hash: string; distance: number | string }>).map((row) => ({
      memoryId: row.memory_id,
      contentHash: row.content_hash,
      distance: Number(row.distance),
    }));
  }

  async close(): Promise<void> {
    const pool = this.client as Partial<Pick<Pool, 'end'>>;
    await pool.end?.();
  }
}
