# Hybrid Retrieval Activation Evidence (holdout)

Generated: 2026-07-17T02:11:49.494Z

## Contract

- Embedding Contract: `qwen3-embedding-0.6b-q8_0-v1`
- Model: `Qwen/Qwen3-Embedding-0.6B` (Q8_0, 1024 dimensions, last pooling)
- Semantic cosine-distance cutoff: 0.55
- Warm repetitions per case: 5
- Pre-existing Derived Index rows: 0

## Quality

| Metric | Lexical | Hybrid |
|---|---:|---:|
| Overall Recall@5 | 66.7% | 66.7% |
| Paraphrase Recall@5 | 75.0% | 75.0% |
| Exact Recall@5 | 100.0% | 100.0% |
| No-match false-positive rate | 100.0% | 100.0% |
| Forbidden-result cases | 0 | 0 |

## Latency and outage fallback

- Warm p50: 165.9 ms
- Warm p95: 273.3 ms
- Maximum warm latency: 558.5 ms
- Embedding outage: 9/9 valid lexical fallbacks; maximum 1.0 ms
- PostgreSQL outage: 9/9 valid lexical fallbacks; maximum 208.4 ms

## Ranked cases

| Case | Returned IDs | Elapsed | Fallback |
|---|---|---:|---:|
| holdout-paraphrase-installation | analytics-package-manager, global-package-manager, project-network, failure-module, global-derived-index | 558.5 ms | no |
| holdout-paraphrase-authority | global-derived-index, global-backups, global-package-manager, project-source-authority | 179.1 ms | no |
| holdout-paraphrase-fallback | global-outage-fallback, failure-pgvector, project-network, user-languages, global-response-style | 177.4 ms | no |
| holdout-paraphrase-preference | project-network, global-derived-index | 141.3 ms | no |
| holdout-exact-model | project-embedding | 306.3 ms | no |
| holdout-scope-analytics-vectors | analytics-postgres | 99.3 ms | no |
| holdout-scope-project-correction | failure-lockfile | 173.6 ms | no |
| holdout-adversarial-instruction | global-derived-index | 84.9 ms | no |
| holdout-no-match-framework | global-backups | 114.9 ms | no |

Semantic retrieval remained disabled in Agent configuration during evidence collection.
