import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBEDDING_CONTRACT,
  encodeEmbeddingDocument,
  encodeEmbeddingQuery,
  validateEmbeddingVector,
} from '../../src/semantic/embedding-contract.js';

describe('Qwen3 Embedding Contract', () => {
  it('pins the approved model, dimensions, pooling, and query instruction', () => {
    assert.deepStrictEqual(EMBEDDING_CONTRACT, {
      version: 'qwen3-embedding-0.6b-q8_0-v1',
      model: 'Qwen/Qwen3-Embedding-0.6B',
      quantization: 'Q8_0',
      dimensions: 1024,
      pooling: 'last',
      queryInstruction: 'Instruct: Given a query about prior agent knowledge, retrieve the Curated Memory entries most relevant to the current task',
    });
  });

  it('keeps document text un-instructed and applies the instruction only to queries', () => {
    assert.strictEqual(encodeEmbeddingDocument('  durable fact  '), 'durable fact');
    assert.strictEqual(
      encodeEmbeddingQuery('  how do we deploy?  '),
      'Instruct: Given a query about prior agent knowledge, retrieve the Curated Memory entries most relevant to the current task\nQuery: how do we deploy?',
    );
  });

  it('accepts only finite normalized vectors with the contract dimension', () => {
    const vector = Array.from({ length: EMBEDDING_CONTRACT.dimensions }, () => 1 / Math.sqrt(EMBEDDING_CONTRACT.dimensions));
    assert.equal(validateEmbeddingVector(vector), true);
    assert.equal(validateEmbeddingVector(vector.slice(1)), false);
    assert.equal(validateEmbeddingVector([...vector.slice(0, -1), Number.NaN]), false);
    assert.equal(validateEmbeddingVector(vector.map((value) => value * 2)), false);
  });
});
