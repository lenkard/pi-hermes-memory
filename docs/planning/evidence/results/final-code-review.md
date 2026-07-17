# Final code review: Hybrid Semantic Recall

**Review range:** `bbd4b472b06efd69cec14c3fb6bc25f5e9358f62...HEAD`

**Axes:** repository Standards and RFC/issue Spec
**Decision:** code is safe to retain disabled; activation is blocked by failed evidence gates.

## Standards review

### Findings fixed during review

#### S-01 — Direct-write semantic propagation guessed one changed entry (high)

The tool previously selected one added/replaced/removed Markdown row by array position or content substring. A replacement/removal affecting identical memories in multiple scopes, or an add causing FIFO eviction, could leave other stable IDs stale in the Derived Index until reconciliation.

**Resolution:** semantic propagation now diffs authoritative Markdown rows before and after a successful mutation by stable Memory ID. Every changed row queues an upsert and every removed/evicted row queues a delete. Queue ingestion also preserves project metadata and failure category. A regression test covers two identically worded corrections in different project scopes.

**Status:** fixed.

### Verification

- TypeScript check passes.
- All 49 repository test files pass.
- Production dependency audit reports zero vulnerabilities at high severity or above.
- The opt-in real-service integration passes against PostgreSQL/pgvector and llama.cpp, including reconciliation and pre-ranking Active Project filtering.
- `git diff --check` passes.
- Generated evidence and diagnostics contain bounded IDs/counts/timings, not credentials, plaintext remote payloads, vectors, or exception details.
- Changes follow existing module boundaries: authoritative Markdown/SQLite storage, a durable local queue, a PostgreSQL adapter, a retrieval module, and thin tool/command registration.

**Unresolved Standards findings:** none.

## Spec review

### Findings fixed during review

#### P-01 — Active Project was not supplied to default `memory_search` (critical)

Although explicit project filters were enforced, default tool calls did not pass the Agent's Active Project. That made other-project SQLite and PostgreSQL candidates eligible.

**Resolution:** the tool now defaults to global plus Active Project rows; with no Active Project it defaults to global rows only. An explicit project remains an intentional override, including explicit `null` for global-only search. SQLite and PostgreSQL apply scope before ranking, and the deep retrieval module repeats the authority check before return. Unit and real-service tests cover the behavior.

**Status:** fixed.

### Blocking unresolved finding

#### P-02 — Activation quality thresholds were not met (critical)

The frozen holdout observed:

- Paraphrase Recall@5: 75.0% hybrid vs 75.0% lexical; required ≥90% and ≥15-point improvement.
- No-match false-positive rate: 100.0%; required ≤5%.
- Exact recall, scope/unsafe exclusions, latency, outage fallback, drift repair, compatibility, and dependency audit passed.

The cutoff was not retuned and the holdout was not rerun. P-01 and S-01 were fixed after holdout, so the existing holdout also cannot certify the final reviewed code even if its failed quality values were otherwise acceptable.

**Required action:** keep Semantic Recall disabled. Any renewed attempt needs a revised Evidence Plan, a newly frozen development procedure, and a new untouched holdout. Do not proceed to activation Issue #8 on this evidence.

**Status:** unresolved activation blocker by design.

## Spec conformance summary

The reviewed implementation otherwise conforms to RFC-0001:

- Markdown remains authoritative and human-readable.
- PostgreSQL stores only stable IDs, scope/category metadata, hashes, contract versions, timestamps, and 1024-dimensional vectors.
- Authoritative writes do not wait for remote services.
- Queue work is durable, coalesced, leased, bounded, retried, cancellable, and recoverable by reconciliation/rebuild.
- Retrieval is explicit through `memory_search`, combines FTS5 and exact cosine candidates with equal-weight RRF, and falls back to SQLite within the hard timeout.
- Read-time checks enforce scope, authority existence, content hash, safety scanning, provenance, and stable-ID deduplication.
- Operations expose redacted status/reconcile/rebuild controls and require rebuild confirmation.
- Configuration is opt-in, environment-injected, and disabled by default.
- No session transcript indexing, automatic per-turn retrieval, ANN index, reranker, or multi-Agent authority was added.

## Review disposition

**Retain and publish the disabled implementation/evidence. Do not activate.**
