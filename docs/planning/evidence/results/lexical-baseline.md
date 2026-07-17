
> pi-hermes-memory@0.8.1 evaluate:retrieval
> tsx scripts/evaluate-retrieval.ts --format=markdown

# Lexical Retrieval Evaluation (all)

The legacy section reproduces the pre-change recency-first ordering. The relevance-ranked section is the current FTS5 baseline used before semantic retrieval.

## Legacy recency-first comparator

| Metric | Value |
|---|---:|
| Cases | 22 |
| Top-5 hits | 15 |
| No-match cases | 2 |
| No-match false positives | 1 |
| Forbidden-result cases | 2 |

### By split

| Split | Cases | Recall@5 | No-match false-positive rate | Forbidden-result cases |
|---|---:|---:|---:|---:|
| development | 13 | 76.9% | 0.0% | 1 |
| holdout | 9 | 55.6% | 100.0% | 1 |

### By kind

| Kind | Cases | Recall@5 | No-match false-positive rate | Forbidden-result cases |
|---|---:|---:|---:|---:|
| paraphrase | 12 | 75.0% | 0.0% | 0 |
| exact | 3 | 100.0% | 0.0% | 0 |
| scope | 3 | 100.0% | 0.0% | 0 |
| adversarial | 2 | 0.0% | 0.0% | 2 |
| no-match | 2 | 0.0% | 50.0% | 0 |

## Relevance-ranked FTS5 baseline

| Metric | Value |
|---|---:|
| Cases | 22 |
| Top-5 hits | 17 |
| No-match cases | 2 |
| No-match false positives | 1 |
| Forbidden-result cases | 2 |

### By split

| Split | Cases | Recall@5 | No-match false-positive rate | Forbidden-result cases |
|---|---:|---:|---:|---:|
| development | 13 | 84.6% | 0.0% | 1 |
| holdout | 9 | 66.7% | 100.0% | 1 |

### By kind

| Kind | Cases | Recall@5 | No-match false-positive rate | Forbidden-result cases |
|---|---:|---:|---:|---:|
| paraphrase | 12 | 91.7% | 0.0% | 0 |
| exact | 3 | 100.0% | 0.0% | 0 |
| scope | 3 | 100.0% | 0.0% | 0 |
| adversarial | 2 | 0.0% | 0.0% | 2 |
| no-match | 2 | 0.0% | 50.0% | 0 |
