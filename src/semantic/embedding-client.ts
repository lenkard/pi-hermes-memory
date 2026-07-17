import {
  EMBEDDING_CONTRACT,
  encodeEmbeddingDocument,
  encodeEmbeddingQuery,
  validateEmbeddingVector,
  type EmbeddingContract,
} from './embedding-contract.js';

export class EmbeddingClientError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'invalid-response' | 'contract-mismatch',
  ) {
    super(message);
    this.name = 'EmbeddingClientError';
  }
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: unknown }>;
};

export class HttpEmbeddingClient {
  private readonly embeddingsUrl: string;

  constructor(
    endpointBase: string,
    private readonly apiKey: string,
    private readonly contract: EmbeddingContract = EMBEDDING_CONTRACT,
  ) {
    this.embeddingsUrl = `${endpointBase.replace(/\/+$/, '')}/v1/embeddings`;
  }

  embedDocument(content: string, signal?: AbortSignal): Promise<readonly number[]> {
    return this.embed(encodeEmbeddingDocument(content), signal);
  }

  embedQuery(query: string, signal?: AbortSignal): Promise<readonly number[]> {
    return this.embed(encodeEmbeddingQuery(query), signal);
  }

  private async embed(input: string, signal?: AbortSignal): Promise<readonly number[]> {
    let response: Response;
    try {
      response = await fetch(this.embeddingsUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.contract.model, input }),
        signal,
      });
    } catch {
      throw new EmbeddingClientError('Embedding endpoint request failed.', 'unavailable');
    }

    if (!response.ok) {
      throw new EmbeddingClientError(`Embedding endpoint returned status ${response.status}.`, 'unavailable');
    }

    let payload: EmbeddingResponse;
    try {
      payload = await response.json() as EmbeddingResponse;
    } catch {
      throw new EmbeddingClientError('Embedding endpoint returned invalid JSON.', 'invalid-response');
    }

    const vector = payload.data?.[0]?.embedding;
    if (!Array.isArray(vector) || !vector.every((value): value is number => typeof value === 'number')) {
      throw new EmbeddingClientError('Embedding endpoint returned no numeric vector.', 'invalid-response');
    }
    if (!validateEmbeddingVector(vector, this.contract)) {
      throw new EmbeddingClientError('Embedding vector does not satisfy the active contract.', 'contract-mismatch');
    }

    return vector;
  }
}
