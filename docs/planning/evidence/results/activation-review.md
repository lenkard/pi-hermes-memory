# Hybrid Recall activation review

**Decision:** **Do not activate. Stop for owner review.**

The holdout was executed once after freezing the development-tuned cosine-distance cutoff at `0.55`. The holdout failed the required paraphrase-improvement and no-match precision gates. Per EP-0001, the implementation was not retuned against holdout and Semantic Recall remains disabled by default.

## Gate results

| Gate | Required | Observed | Result |
|---|---:|---:|---|
| Holdout paraphrase Recall@5 | ≥90% | 75.0% | **Fail** |
| Improvement over FTS5 | ≥15 percentage points | 0 points (75.0% vs 75.0%) | **Fail** |
| Exact Recall@5 | Hybrid ≥ FTS5 | 100.0% vs 100.0% | Pass |
| Wrong-project / unsafe forbidden results | 0 | 0 | Pass |
| No-match false-positive rate | ≤5% | 100.0% | **Fail** |
| Warm end-to-end p95 | ≤750 ms | 273.3 ms | Pass |
| PostgreSQL outage fallback | 100% valid within 2 s | 9/9; max 208.4 ms | Pass |
| Embedding outage fallback | 100% valid within 2 s | 9/9; max 1.0 ms | Pass |
| Seeded drift repair | 100% | Missing, stale, changed-contract, and orphaned: 4/4 | Pass |
| Type checks and repository tests | Pass | 49 test files passed | Pass |
| Dependency high-severity audit | 0 | 0 | Pass |

## Development-only tuning

The cutoff was selected before holdout:

- Relevant development semantic distances included `0.2090`, `0.2776`, `0.2860`, `0.2926`, `0.4042`, `0.4730`, `0.4853`, and `0.4934`.
- The nearest development no-match candidate was `0.6239`.
- Cutoff `0.55` preserved all development paraphrase/exact/scope hits while returning no development no-match result.
- Development p95 was 233.8 ms; both outage populations returned 13/13 valid safe lexical fallbacks.

No cutoff or ranking parameter was changed after viewing holdout.

## Evidence artifacts

- [Development report](hybrid-development.md) ([JSON](hybrid-development.json))
- [Holdout report](hybrid-holdout.md) ([JSON](hybrid-holdout.json))
- [Lexical baseline](lexical-baseline.md) ([JSON](lexical-baseline.json))
- [Operational controls](../../../semantic-recall-operations.md)
- [Final Standards and Spec review](final-code-review.md)

## Exact verification commands

```bash
npm run check
npm test
npm audit --omit=dev --audit-level=high

# Requires environment-injected values; never store them in the repository.
npm run evaluate:hybrid -- \
  --split=development --warm-runs=5 \
  --output-json=docs/planning/evidence/results/hybrid-development.json \
  --output-markdown=docs/planning/evidence/results/hybrid-development.md

# Executed once after cutoff freeze.
npm run evaluate:hybrid -- \
  --split=holdout --warm-runs=5 \
  --output-json=docs/planning/evidence/results/hybrid-holdout.json \
  --output-markdown=docs/planning/evidence/results/hybrid-holdout.md

PI_HERMES_MEMORY_POSTGRES_URL=... \
PI_HERMES_MEMORY_EMBEDDING_ENDPOINT=... \
PI_HERMES_MEMORY_EMBEDDING_API_KEY=... \
npx tsx --test tests/integration/semantic-services.test.ts
```

The real-service integration was run through SSH port forwarding with shell-only secret injection. It passed 1/1 and cleaned its temporary Derived Index rows afterward. No secret value was printed or committed.

## Versions and contract

- PostgreSQL: `17.10 (Debian 17.10-1.pgdg12+1)`
- pgvector: `0.8.5`
- Embedding container image: `sha256:7ea3fcd078948e7cf2e8c07405c83430e66a811f5b7b3350c2c2e9f1f93a42bc`
- llama.cpp pinned build: `10015 (12127defd)`
- Model: `Qwen/Qwen3-Embedding-0.6B`, Q8_0
- Model artifact SHA-256: `06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439`
- Dimensions/pooling: 1024 / last
- Embedding Contract: `qwen3-embedding-0.6b-q8_0-v1`
- Retrieval: exact cosine, equal-weight RRF, semantic maximum distance `0.55`

## Compatibility, recovery, and safety evidence

Automated tests cover legacy stable-ID migration, replacement/deletion identity, repeated startup, durable queue replay, bounded batches, eight-attempt retry limits, cancellation lease release, restart persistence, SQLite fallback, redacted errors, read-time unsafe exclusion, project filtering, and confirmed Derived Index rebuild. The feature flag remains disabled unless explicitly configured and environment variables are present.

## Limitations and interpretation

- The fixture is synthetic and small; owner-reviewed real Curated Memory remains limited.
- The lexical development split was already strong, leaving little measurable development gain.
- The holdout shows the evaluated fusion/cutoff does not improve paraphrase Recall@5 and still returns irrelevant memories for the no-match case.
- Final review subsequently fixed direct-write multi-ID propagation and default Active Project filtering. The holdout was intentionally not rerun, so it does not certify that post-review code either.
- Outage evidence uses deterministic fault injection; real protocol integration and reconciliation were separately exercised against the deployed services.
- One Agent and one CPU embedding service do not establish general product performance.

Activation Issue #8 must remain blocked/closed without activation unless a fresh Evidence Plan authorizes a new experiment with a new untouched holdout.
