import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HttpEmbeddingClient,
  EmbeddingClientError,
} from '../../src/semantic/embedding-client.js';
import { EMBEDDING_CONTRACT } from '../../src/semantic/embedding-contract.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function normalizedVector(): number[] {
  return Array.from({ length: EMBEDDING_CONTRACT.dimensions }, () => 1 / Math.sqrt(EMBEDDING_CONTRACT.dimensions));
}

describe('HttpEmbeddingClient', () => {
  it('sends the approved model and query instruction with bearer auth', async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = (async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ data: [{ embedding: normalizedVector() }] }), { status: 200 });
    }) as typeof fetch;

    const client = new HttpEmbeddingClient('http://embedding.test', 'test-secret');
    const vector = await client.embedQuery('how do we deploy?');
    const body = JSON.parse(String(request?.init?.body));

    assert.equal(request?.url, 'http://embedding.test/v1/embeddings');
    assert.equal((request?.init?.headers as Record<string, string>).authorization, 'Bearer test-secret');
    assert.deepStrictEqual(body, {
      model: EMBEDDING_CONTRACT.model,
      input: `${EMBEDDING_CONTRACT.queryInstruction}\nQuery: how do we deploy?`,
    });
    assert.equal(vector.length, EMBEDDING_CONTRACT.dimensions);
  });

  it('sends document content without query instruction', async () => {
    let body = '';
    globalThis.fetch = (async (_url, init) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ data: [{ embedding: normalizedVector() }] }), { status: 200 });
    }) as typeof fetch;

    await new HttpEmbeddingClient('http://embedding.test', 'test-secret').embedDocument(' durable fact ');

    assert.deepStrictEqual(JSON.parse(body), {
      model: EMBEDDING_CONTRACT.model,
      input: 'durable fact',
    });
  });

  it('rejects malformed responses without exposing the bearer key', async () => {
    globalThis.fetch = (async () => new Response('upstream failure', { status: 503 })) as typeof fetch;
    const client = new HttpEmbeddingClient('http://embedding.test', 'super-secret-key');

    await assert.rejects(
      () => client.embedDocument('fact'),
      (error: unknown) => error instanceof EmbeddingClientError
        && error.message.includes('status 503')
        && !error.message.includes('super-secret-key'),
    );
  });
});
