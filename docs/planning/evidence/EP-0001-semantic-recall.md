---
document_type: evidence-plan
id: EP-0001
title: Semantic Recall for Curated Memory
status: approved-experiment
owner: lenkard
business_case: BC-0001
foundation_version: 43f8ed1581a86f718889ab60ce449f8eacbdec5f
last_updated: 2026-07-16
---

# Evidence Plan: Semantic Recall for Curated Memory

## 1. Decision this evidence must support

- **Decision owner:** lenkard
- **Decision date:** Activation review after implementation; usage review after two enabled weeks or 100 semantic searches, whichever is later.
- **Options:** continue / change / pivot / rollback / stop
- **Current uncertainty:** Whether semantic candidates create material recall value over improved FTS5 for a one-Agent Curated Memory corpus without unacceptable false positives, latency, unsafe recall, scope leakage, or operational burden.

## 2. Goals, signals, and metrics

| Goal ID | Goal | Observable signal | Metric definition | Baseline | Target | Guardrails |
|---|---|---|---|---:|---:|---|
| BG-01 | Improve paraphrase recall | Expected memory appears near the top | Recall@5 = eligible paraphrase cases with an independently expected Memory ID in top 5 / all eligible paraphrase cases, measured once on holdout | UNKNOWN | ≥90% and ≥15 percentage points above FTS5 | No exact-query regression |
| BG-02 | Preserve precise lookup | Exact commands, paths, package names, and errors remain retrievable | Exact Recall@5 on exact/identifier holdout cases | UNKNOWN | Hybrid ≥ FTS5 | No semantic substitution of a wrong exact result |
| BG-03 | Preserve scope and safety | Returned context is eligible and safe | Count of wrong-project or unsafe entries returned across scope/adversarial cases | 0 expected | 0 | Any occurrence blocks activation |
| BG-04 | Avoid irrelevant recall | No-match queries return no memory | False-positive rate = no-match cases returning any result / all no-match cases | UNKNOWN | ≤5% | Threshold tuned only on development set |
| BG-05 | Keep interaction responsive | Hybrid search completes promptly | p95 wall-clock time over warm eligible evaluation searches on deployed infrastructure | UNKNOWN | ≤750 ms | Hard semantic timeout 2 s |
| BG-06 | Preserve local availability | Search remains useful during remote failure | Forced-outage cases returning valid SQLite results within 2 s / all forced-outage cases | UNKNOWN | 100% | No interactive retry |
| BG-07 | Keep the index repairable | Drift is removed deterministically | Seeded missing, stale, and deleted rows repaired / all seeded drift rows | UNKNOWN | 100% | No canonical Markdown loss |

Latency population excludes initial model download and process startup but includes query embedding, PostgreSQL search, fusion, resolution, and safety scanning. Report p50 and p95; do not hide cold-start behavior—record it separately.

## 3. Hypotheses

| ID | Falsifiable hypothesis | Evidence that supports | Evidence that contradicts | Threshold | Time horizon |
|---|---|---|---|---|---|
| H-01 | Hybrid Recall materially improves paraphrase retrieval | Holdout Recall@5 meets both absolute and relative targets | Improvement <15 points or Recall@5 <90% | BG-01 | Activation review |
| H-02 | Hybrid Recall preserves exact lookup | Exact Recall@5 is no lower than FTS5 | Any statistically/materially lower exact result set | BG-02 | Activation review |
| H-03 | Deterministic gates prevent scope and unsafe recall | Zero blocked-class returns | Any wrong-project or unsafe returned context | BG-03 | Activation and usage reviews |
| H-04 | The deployed CPU embedding path is fast enough | Warm p95 ≤750 ms and fallback ≤2 s | Repeated threshold miss under representative load | BG-05/BG-06 | Activation review |
| H-05 | Derived indexing can remain non-blocking and convergent | Writes succeed during outage; reconciliation repairs all drift | Writes fail because of remote state or reconciliation leaves drift | BG-07 | Activation review |
| H-06 | The feature creates practical user value | Owner reports fewer missed relevant memories after sufficient usage | Searches are rarely used, often irrelevant, or add maintenance without benefit | Qualitative review plus operational counts | Usage review |

## 4. Evidence sources

| ID | Source | Owner | Quantitative/qualitative | Provenance | Freshness | Quality limits | Approved purpose |
|---|---|---|---|---|---|---|---|
| D-01 | Versioned synthetic retrieval cases and lexical baseline | Project | Quantitative | Reviewed repository fixture; [`lexical-baseline.md`](results/lexical-baseline.md) | Per change | Synthetic cases may not represent personal usage | Development and holdout retrieval evaluation |
| D-02 | Sanitized real Curated Memory cases | lenkard | Mixed | Owner-reviewed examples | Added during use | Initially unavailable; selection bias | Expand evaluation realism |
| D-03 | Retrieval diagnostic records | Project | Quantitative | Deterministic tool details, secrets/text minimized | Per search | Tool invocation depends on Agent behavior | Latency, fallback, candidate/exclusion counts |
| D-04 | Indexing and reconciliation status | Project | Quantitative | Local durable queue and PostgreSQL state | Current | Derived state can be stale during outages | Reliability and repair evidence |
| D-05 | Owner usage review | lenkard | Qualitative | Direct operator assessment | Review date | Subjective, single user | Decide practical value and maintenance burden |

## 5. Experiment or observation design

- **Population and eligibility:** Versioned cases covering semantic paraphrases, English/Spanish queries, code identifiers, all Curated Memory scopes, project distractors, stale/conflicting entries, suspicious text, and no-match queries.
- **Intervention:** Hybrid Recall using improved FTS5 ranking plus Qwen3-Embedding-0.6B Q8_0 exact cosine search in pgvector and equal-weight Reciprocal Rank Fusion.
- **Comparison/baseline:** Current behavior and improved lexical-only behavior, both measured before semantic activation.
- **Instrumentation:** Per-case ranked Memory IDs and exclusion reasons; aggregate retrieval metrics; p50/p95 timing by stage; fallback reason; queue/reconciliation counts. Never record credentials, raw vectors, or unsanitized memory in telemetry.
- **Data-quality checks:** Unique case IDs and Memory IDs; independently declared expected results; no overlap between development and holdout query variants; deterministic scope labels; fixture hash/version; repeated-run consistency checks.
- **Duration/stopping rule:** Tune only on development cases. Run holdout once for activation. Stop immediately for wrong-project or unsafe returned context. Usage observation ends after two enabled weeks and at least 100 semantic searches; extend rather than infer if usage is lower.
- **Analysis method and interpretation limits:** Report per-class and aggregate metrics. A synthetic pass does not prove real user value. One operator and one corpus do not establish general product performance.
- **Privacy/ethical risks and approvals:** Initial fixtures are synthetic. Real cases require owner review and sanitization. Stored content and queries remain on owned infrastructure, but privacy is not claimed as the reason for self-hosting.

## 6. Decision rules

- **Continue when:** Every activation guardrail passes and practical usage shows fewer meaningful misses at acceptable operating cost.
- **Change when:** Semantic benefit is material but a non-safety quality, latency, or reliability threshold misses; revise instruction, cutoff, fusion, or implementation and rerun a fresh holdout.
- **Rollback when:** Post-activation behavior breaches latency/reliability expectations or returns irrelevant context often enough to impede work; use the SQLite-only kill switch.
- **Stop when:** Semantic improvement is below 15 percentage points, unsafe/wrong-project context is returned, or maintenance burden exceeds demonstrated value.
- **Inconclusive when:** The corpus lacks representative real cases, fewer than 100 semantic searches occur, or data-quality checks fail.

## 7. Anti-gaming review

- Recall@5 can be inflated with easy or near-duplicate paraphrases; keep a reviewed holdout and report classes separately.
- Returning more results can increase recall while harming precision; no-match false positives and qualitative relevance balance recall.
- Dropping difficult cases is prohibited; fixture changes require review and version history.
- Aggregate metrics can hide project leakage, unsafe content, multilingual failures, and identifier regressions; these remain separate guardrails.
- Latency can be gamed by excluding failures or cold starts; report fallback, error, and cold-start results separately.
- Evidence collection is bounded and contains no raw vectors or unnecessary personal content.

## 8. Outcome review

- **Scheduled date:** Activation review after deterministic gates; usage review two enabled weeks or 100 semantic searches after activation, whichever is later.
- **Reviewer(s):** lenkard
- **Required artifacts:** versioned evaluation set and results; exact commands; latency report; outage and reconciliation evidence; security/scope results; operational status; qualitative owner assessment.
- **Outcome Review path:** `docs/planning/outcomes/OR-0001-semantic-recall.md`
