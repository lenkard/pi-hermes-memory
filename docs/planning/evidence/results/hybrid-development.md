# Hybrid Retrieval Activation Evidence (development)

Generated: 2026-07-17T02:11:03.405Z

## Contract

- Embedding Contract: `qwen3-embedding-0.6b-q8_0-v1`
- Model: `Qwen/Qwen3-Embedding-0.6B` (Q8_0, 1024 dimensions, last pooling)
- Semantic cosine-distance cutoff: 0.55
- Warm repetitions per case: 5
- Pre-existing Derived Index rows: 0

## Quality

| Metric | Lexical | Hybrid |
|---|---:|---:|
| Overall Recall@5 | 84.6% | 84.6% |
| Paraphrase Recall@5 | 100.0% | 100.0% |
| Exact Recall@5 | 100.0% | 100.0% |
| No-match false-positive rate | 0.0% | 0.0% |
| Forbidden-result cases | 0 | 0 |

## Latency and outage fallback

- Warm p50: 166.1 ms
- Warm p95: 233.8 ms
- Maximum warm latency: 589.9 ms
- Embedding outage: 13/13 valid lexical fallbacks; maximum 0.6 ms
- PostgreSQL outage: 13/13 valid lexical fallbacks; maximum 248.6 ms

## Ranked cases

| Case | Returned IDs | Elapsed | Fallback |
|---|---|---:|---:|
| dev-paraphrase-package-manager | failure-lockfile, global-package-manager, analytics-package-manager | 589.9 ms | no |
| dev-paraphrase-response-style | global-response-style, project-network, global-derived-index, user-languages, analytics-package-manager | 193.1 ms | no |
| dev-paraphrase-source-authority | project-network, project-embedding, failure-lockfile, failure-module, project-source-authority | 187.3 ms | no |
| dev-paraphrase-outage | global-outage-fallback, user-languages | 202.9 ms | no |
| dev-paraphrase-language | user-languages | 166.1 ms | no |
| dev-paraphrase-test-isolation | project-test-runner, failure-module | 188.4 ms | no |
| dev-paraphrase-network | project-network | 168.2 ms | no |
| dev-paraphrase-embedding-size | project-embedding, failure-module, project-network, failure-lockfile, project-source-authority | 169.6 ms | no |
| dev-exact-test-command | project-test-runner, failure-module | 146.1 ms | no |
| dev-exact-pnpm-install | failure-lockfile, global-package-manager, analytics-package-manager, failure-module | 139.3 ms | no |
| dev-scope-analytics-installer | analytics-package-manager | 136.8 ms | no |
| dev-adversarial-secret | — | 105.3 ms | no |
| dev-no-match-unrelated | — | 107.2 ms | no |

Semantic retrieval remained disabled in Agent configuration during evidence collection.
