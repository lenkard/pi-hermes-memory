# Pi Memory embedding server

A dedicated llama.cpp embedding server for `Qwen/Qwen3-Embedding-0.6B-GGUF` using the Q8_0 model.

## Pinned artifacts

- llama.cpp server build: `10015 (12127defd)`
- ARM64 image digest: `sha256:7ea3fcd078948e7cf2e8c07405c83430e66a811f5b7b3350c2c2e9f1f93a42bc`
- Qwen repository revision: `370f27d7550e0def9b39c1f16d3fbaa13aa67728`
- Model SHA-256 (Hugging Face LFS OID): `06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439`
- Maximum embedding dimensions: 1024

## Security model

- Bind port 8081 only to a local or private host address.
- Require a random bearer API key.
- Run as a non-root user with all Linux capabilities dropped and a read-only root filesystem.
- Do not expose the endpoint directly to the Internet.

## Deployment

Create `secrets/embedding_api_key` with mode `0600`, create `.env` from `.env.example`, then:

```bash
sudo ./download-model.sh
docker compose pull
docker compose up -d
docker compose ps
```

The OpenAI-compatible endpoint is `POST /v1/embeddings`. Qwen recommends `last` pooling for this model. Query-side retrieval instructions should be versioned in the application and evaluated because Qwen reports that instructions generally improve retrieval quality.

## Model changes

The embedding model, quantization, dimensions, pooling, and query instruction are part of the retrieval contract. Any change requires a new Derived Index or a full reindex before activation.
