---
document_type: business-case
id: BC-0001
title: Semantic Recall for Curated Memory
status: approved-experiment
owner: lenkard
foundation_version: 43f8ed1581a86f718889ab60ce449f8eacbdec5f
last_updated: 2026-07-16
---

# Business Case: Semantic Recall for Curated Memory

## 1. Business intent

- **Accountable owner:** lenkard
- **Strategic intent:** Improve the Agent's ability to recover relevant durable knowledge when a later query uses different wording.
- **Target users/customers:** One Agent operated by one owner in the MVP.
- **Problem and current workflow:** `memory_search` uses SQLite FTS5. It can retrieve exact terms and identifiers but has no semantic representation for paraphrases or cross-lingual meaning.
- **Evidence the problem exists:** Source inspection confirms lexical-only retrieval and recency-first result ordering. The repository previously fixed multi-word lexical behavior, showing search quality is material. No representative personal Curated Memory corpus currently exists, so the frequency and cost of semantic misses remain assumptions to test.
- **Baseline and cost of inaction:** Retrieval quality is UNKNOWN until the Retrieval Evaluation runs. The expected cost is repeated explanations, missed corrections, and reduced value from durable memory.
- **Desired observable outcome:** Hybrid Recall finds expected Curated Memory for paraphrased and multilingual queries materially more often than FTS5 without regressing exact lookup, scope safety, latency, or local availability.

## 2. Value mechanism

- **User/public value:** The owner repeats less context and the Agent applies relevant prior knowledge more consistently.
- **Business value:** Capability improvement and reduced interaction/rework cost; no direct revenue claim is made.
- **How value is created and captured:** Relevant memory is surfaced through the existing `memory_search` tool at the point it can affect Agent behavior.
- **Expected costs and investment ceiling:** One bounded implementation effort plus operation of already-provisioned PostgreSQL and embedding containers. Do not add multi-Agent authority, HNSW, automatic per-turn retrieval, or external orchestration in this experiment.
- **Time horizon:** Activation after holdout, safety, failure, and reconciliation gates pass; outcome review after two enabled weeks or 100 semantic searches, whichever is later.

## 3. Scope

- **Smallest useful intervention:** Add optional Hybrid Recall for Curated Memory behind the unchanged `memory_search` interface.
- **In scope:** stable Memory IDs; Qwen3 embeddings; PostgreSQL/pgvector Derived Index; local lexical ranking; ranking fusion; asynchronous indexing; reconciliation; retrieval safety; diagnostics; opt-in rollout and kill switch.
- **Non-goals:** raw session history; automatic per-turn retrieval; multi-Agent sharing or tenancy; PostgreSQL authority; HNSW; reranking models; replacing Markdown or SQLite; external embedding providers.
- **Hard constraints:** Markdown remains authoritative; successful memory writes cannot depend on remote infrastructure; PostgreSQL stores no plaintext memory; no public database or embedding endpoint; existing users retain SQLite-only behavior by default.
- **Guardrails:** no wrong-project recall; no unsafe memory enters model context; secrets remain outside repository/configuration/logs; remote failure degrades to lexical retrieval; output remains bounded.

## 4. Facts and assumptions

### Known facts

- Curated Memory is currently persisted in human-readable Markdown and mirrored to SQLite.
- `memory_search` is lexical and has no embedding path.
- The MVP infrastructure is provisioned and verified: PostgreSQL 17.10 with pgvector 0.8.5 and llama.cpp serving Qwen3-Embedding-0.6B Q8_0.
- The embedding endpoint returns normalized 1024-dimensional vectors; a warm probe measured approximately 142 ms.
- PostgreSQL and embedding ports bind only to the same-host Docker bridge and are not publicly exposed.
- No existing Curated Memory files were found for a representative personal baseline.

### Assumptions

| ID | Assumption | Existing evidence | Confidence | Consequence if false |
|---|---|---|---|---|
| A-01 | Semantic misses occur often enough to justify the feature | Lexical-only implementation; no usage corpus | Low | Stop or retain SQLite-only behavior |
| A-02 | Hybrid retrieval outperforms lexical retrieval on paraphrases | Established retrieval pattern; not yet measured here | Medium | Revise model/instruction/fusion or stop |
| A-03 | Exact vector search meets latency needs for one Agent | Small expected corpus and 142 ms embedding probe | Medium | Tune implementation; add ANN only with evidence |
| A-04 | The Agent calls `memory_search` when policy guidance makes memory useful | Existing policy-only design | Medium | Improve guidance or later evaluate routing |
| A-05 | Asynchronous reconciliation keeps the Derived Index acceptably fresh | Design decision, not yet exercised | Medium | Improve queue/reconciliation or disable semantic path |

## 5. Prioritized hypotheses

| ID | If we... | for... | then... | because... | Evidence needed |
|---|---|---|---|---|---|
| H-01 | combine FTS5 and Qwen3/pgvector candidates | paraphrased Curated Memory queries | Recall@5 will materially exceed FTS5 | semantic vectors represent meaning beyond shared terms | Holdout Retrieval Evaluation |
| H-02 | preserve lexical candidates and fuse rankings | identifier-heavy queries | exact lookup will not regress | FTS remains strong for commands, paths, names, and errors | Exact-query holdout cases |
| H-03 | index asynchronously with reconciliation | authoritative memory writes | outages will not break writes and drift will be repaired | the Derived Index is non-authoritative | Forced outage and seeded drift tests |
| H-04 | enforce scope and read-time safety before returning text | all searches | no wrong-project or unsafe memory will enter context | deterministic gates precede model use | Scope/adversarial evaluation cases |

H-01 is tested first because failure removes the reason to build the semantic path.

## 6. Alternatives

| Alternative | Expected value | Cost/risk | Evidence | Decision |
|---|---|---|---|---|
| Do nothing | No implementation or operations cost | Semantic misses remain | Baseline pending | Baseline comparator |
| Improve FTS5 ranking only | Better lexical relevance at low complexity | Cannot solve meaning-only paraphrases | Must be measured | Include in baseline work |
| Semantic-only retrieval | Better paraphrase recall | Regresses exact identifiers and loses local fallback | Known retrieval trade-off | Rejected |
| Qdrant Derived Index | Purpose-built vector features | Additional specialized platform | Initial research | Rejected in favor of reusable PostgreSQL |
| PostgreSQL as authority | Future shared-memory path | Breaks local-first MVP and adds distributed-write concerns | No multi-Agent requirement | Out of scope |
| Automatic retrieval each turn | Memory without an explicit tool call | Permanent latency and context pollution | No measured need | Out of scope |

## 7. Investment decision

- **Next smallest investment:** Build the Retrieval Evaluation and lexical baseline, then implement thin slices only while the evidence gate remains viable.
- **Approval required from:** lenkard.
- **Decision date:** Activation review after implementation evidence is complete.
- **Continue threshold:** All thresholds in EP-0001 pass.
- **Pivot/change threshold:** Semantic benefit exists but quality, latency, synchronization, or operations miss a non-safety threshold.
- **Stop condition:** Less than 15 percentage-point paraphrase Recall@5 improvement, unsafe/wrong-project retrieval, repeated operational instability, or maintenance cost exceeding observed value.
- **Current decision:** Approve bounded experiment; implementation remains subject to RFC approval and deterministic gates.
