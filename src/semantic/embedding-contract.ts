export interface EmbeddingContract {
  version: string;
  model: string;
  quantization: string;
  dimensions: number;
  pooling: 'last';
  queryInstruction: string;
}

export const EMBEDDING_CONTRACT: Readonly<EmbeddingContract> = Object.freeze({
  version: 'qwen3-embedding-0.6b-q8_0-v1',
  model: 'Qwen/Qwen3-Embedding-0.6B',
  quantization: 'Q8_0',
  dimensions: 1024,
  pooling: 'last',
  queryInstruction: 'Instruct: Given a query about prior agent knowledge, retrieve the Curated Memory entries most relevant to the current task',
});

export function encodeEmbeddingDocument(content: string): string {
  return content.trim();
}

export function encodeEmbeddingQuery(query: string): string {
  return `${EMBEDDING_CONTRACT.queryInstruction}\nQuery: ${query.trim()}`;
}

export function validateEmbeddingVector(vector: readonly number[], contract = EMBEDDING_CONTRACT): boolean {
  if (vector.length !== contract.dimensions || vector.some((value) => !Number.isFinite(value))) {
    return false;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return Math.abs(norm - 1) <= 1e-3;
}
