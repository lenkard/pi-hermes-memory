---
document_type: outcome-review
id: OR-0001
title: Semantic Recall for Curated Memory
status: scheduled
owner: lenkard
business_case: BC-0001
evidence_plan: EP-0001
rfc: RFC-0001
review_date: TBD_AFTER_ACTIVATION
---

# Outcome Review: Semantic Recall for Curated Memory

This review is scheduled for the later of two enabled weeks or 100 semantic searches. Do not complete it before the eligibility condition is met; extend observation rather than infer from insufficient use.

**Pre-activation status:** the holdout gates failed, so Semantic Recall was not enabled and no outcome observation window began. See the [activation review](../evidence/results/activation-review.md).

## 1. Decision

- **Decision owner:** lenkard
- **Decision:** PENDING — continue / change / pivot / rollback / stop
- **One-sentence rationale:** PENDING

## 2. What was delivered

PENDING. Record the actual intervention, activation dates, Agent population, Embedding Contract, PostgreSQL schema version, and deviations from RFC-0001. Shipping alone is not an outcome.

## 3. Evidence quality

- **Data versions and collection period:** PENDING
- **Coverage and missing populations:** PENDING
- **Quality/freshness incidents:** PENDING
- **Experiment or observation limitations:** One owner and Agent; synthetic-first evaluation.
- **Potential confounders or gaming:** Changes to corpus, query mix, Agent policy, model, instruction, fusion, or result limit.

## 4. Results

| Goal/hypothesis | Baseline | Expected threshold | Observed result | Guardrails/harms | Interpretation |
|---|---:|---:|---:|---|---|
| BG-01 paraphrase Recall@5 | PENDING | ≥90% and ≥15 points over FTS5 | PENDING | Exact retrieval preserved | PENDING |
| BG-02 exact Recall@5 | PENDING | Hybrid ≥ FTS5 | PENDING | No identifier regression | PENDING |
| BG-03 scope/safety | 0 expected | 0 wrong-project and unsafe returns | PENDING | Blocking guardrail | PENDING |
| BG-04 no-match false positives | PENDING | ≤5% | PENDING | Qualitative relevance | PENDING |
| BG-05 warm p95 latency | PENDING | ≤750 ms | PENDING | 2 s hard timeout | PENDING |
| BG-06 outage fallback | PENDING | 100% within 2 s | PENDING | No write dependence | PENDING |
| BG-07 reconciliation | PENDING | 100% seeded drift repair | PENDING | No canonical loss | PENDING |
| H-06 practical owner value | N/A | Fewer meaningful misses at acceptable burden | PENDING | Maintenance and false recall | PENDING |

Include qualitative examples of useful recall, missed recall, irrelevant recall, repeated corrections prevented, and operational friction. Sanitize content where appropriate.

## 5. Operational evidence

- **Reliability and incidents:** PENDING
- **Security/privacy/accessibility findings:** PENDING
- **Delivery and rework:** PENDING
- **Cost and capacity:** PENDING
- **Support and maintainability:** PENDING

## 6. What we learned

### Supported beliefs

- PENDING

### Contradicted beliefs

- PENDING

### Still unknown

- PENDING

## 7. Next action

- **Action:** PENDING
- **Owner:** lenkard
- **Deadline/decision date:** Set during review
- **Next smallest experiment or increment:** PENDING
- **Evidence required before adding complexity:** HNSW, automatic retrieval, reranking, plaintext remote payloads, or multi-Agent authority each require a named measured deficiency and a separate decision.

Update BC-0001, EP-0001, RFC-0001, relevant ADRs, and evaluation cases when observed evidence changes the design.
