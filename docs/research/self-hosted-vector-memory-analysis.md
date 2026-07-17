# Self-hosted vector memory: repository and architecture analysis

**Reviewed:** 2026-07-16  
**Upstream revision:** `bbd3217d7c98d2a81772a2505f7918c68be8978c`  
**Lenkard foundation revision:** `43f8ed1581a86f718889ab60ce449f8eacbdec5f`

## Decision update — 2026-07-16

The owner selected PostgreSQL with pgvector for the MVP Derived Index because the available infrastructure can operate it and a reusable PostgreSQL platform has value beyond vector search. The deployment decision is recorded in [`docs/adr/0002-use-postgresql-pgvector-for-derived-index.md`](../adr/0002-use-postgresql-pgvector-for-derived-index.md). The candidate comparison below is retained as research context.

## Question

How should a fork of `pi-hermes-memory` add semantic retrieval backed by self-hosted infrastructure without weakening its local-first behavior, security posture, or testability?

## Executive finding

Do not replace Markdown or SQLite with a remote vector database.

The strongest first direction is an **optional, rebuildable semantic index** behind the existing `memory_search` tool:

1. Markdown remains the human-readable source of truth.
2. Local SQLite remains the durable local mirror, session index, lexical fallback, and offline path.
3. A self-hosted vector database is a derived index.
4. Retrieval combines lexical and semantic candidates, then applies scope, freshness, security, and deduplication rules.
5. Remote failure degrades to SQLite search instead of breaking memory writes or Pi startup.

Qdrant is the leading prototype candidate because it is a standalone vector database with an official TypeScript client, payload filtering, dense/sparse hybrid queries, on-disk storage, snapshots, and a simple container deployment. This is a candidate to evaluate, not a final technology decision. PostgreSQL with pgvector is a credible alternative when PostgreSQL is already an operated platform; introducing PostgreSQL only for this extension would add a larger operational surface than the current need justifies.

## Current repository

### Product shape

The extension already has three distinct knowledge forms:

- bounded Markdown memory (`MEMORY.md`, `USER.md`, project memory, and failures);
- SQLite-backed memory and session search;
- Pi-native procedural skills.

The default runtime is policy-only: the model is told when to search rather than receiving the complete memory corpus in every prompt. This is the right prerequisite for retrieval work.

### Existing storage and search path

The current write path treats Markdown as authoritative and SQLite as a best-effort search mirror. The implementation warns when Markdown succeeds but SQLite synchronization fails. See:

- [`src/tools/memory-tool.ts`](../../src/tools/memory-tool.ts)
- [`src/store/memory-store.ts`](../../src/store/memory-store.ts)
- [`src/store/sqlite-memory-store.ts`](../../src/store/sqlite-memory-store.ts)

The current `memory_search` path is lexical:

- natural-language terms are normalized into SQLite FTS5 expressions;
- strict AND matching falls back to OR matching;
- matching rows are ordered by `last_referenced`, not by an FTS relevance score;
- there is no embedding generation, semantic candidate set, reranker, or retrieval evaluation set.

See:

- [`src/store/fts-query.ts`](../../src/store/fts-query.ts)
- [`src/store/sqlite-memory-store.ts`](../../src/store/sqlite-memory-store.ts)
- [`src/tools/memory-search-tool.ts`](../../src/tools/memory-search-tool.ts)

This creates a real opportunity for semantic retrieval, but it also means a vector database should be justified by measured misses rather than assumed to be better for every query.

### Architecture friction relevant to the change

The Pi-facing `memory_search` tool directly imports SQLite functions and `DatabaseManager`. Background review, correction capture, flush, synchronization, indexing, and commands also depend directly on concrete storage modules. There is no current retrieval seam where lexical-only and hybrid retrieval can vary cleanly.

The safest deepening opportunity is a **Memory Retrieval module** whose interface remains small while its implementation hides:

- query normalization;
- embedding generation;
- lexical and semantic candidate retrieval;
- project/target/category filtering;
- fusion and reranking;
- stale, conflicting, or unsafe-memory exclusion;
- timeout, cancellation, and fallback;
- bounded result formatting and diagnostics.

The existing `memory_search` tool should call this module instead of knowing which databases participate. Tests should exercise retrieval behavior through this same interface. A SQLite-only adapter and a self-hosted hybrid adapter make the seam real; an in-memory adapter can support deterministic contract tests.

### Documentation drift

Planning documents are not all authoritative for the current release:

- root `AGENTS.md` still describes v0.2 work and says there is no SQLite;
- root `PLAN.md` is the completed v0.1 plan;
- `docs/ROADMAP.md` contains milestones already implemented and labels earlier work as next;
- the package is currently v0.8.1.

Planning the fork should first distinguish historical plans from current product and architecture documentation. Otherwise an agent may make decisions from obsolete constraints.

### Verification baseline

At the reviewed revision:

- `npm install` completed without audit findings;
- `npm run check` passed;
- `npm test` passed.

This is a useful baseline, but the repository has no retrieval-quality benchmark that compares FTS, semantic, and hybrid search.

## Infrastructure fit

The private inventory contains two viable roles:

- a small always-on public ARM server suitable for lightweight ingress or a modest vector index;
- a substantially larger private x86 host with an NVIDIA GPU, suitable for local embedding generation and a vector-database prototype.

Exact addresses and access details are intentionally excluded from this repository artifact.

The private GPU host is the strongest prototype location because embedding generation benefits more from that hardware than Qdrant itself. The public server should not expose an unauthenticated Qdrant port. If access from multiple locations is required, prefer a private overlay network or a TLS-authenticated proxy with network allowlisting. Deployment topology remains a decision because the inventory does not establish availability targets, backup ownership, client locations, or whether the private host is expected to be always on.

## Candidate technologies

### Qdrant — strongest standalone prototype candidate

Qdrant stores vectors with JSON payloads and supports payload filters, dense and sparse vectors, hybrid fusion, write-ahead logging, on-disk vector/index storage, snapshots, REST, gRPC, and an official TypeScript client. Its own quick start warns that the default container command starts an insecure service open on all interfaces. That warning makes network and authentication design mandatory, not optional.

Relevant primary sources:

- [Qdrant repository and official clients](https://github.com/qdrant/qdrant)
- [Qdrant storage](https://qdrant.tech/documentation/manage-data/storage/)
- [Qdrant filtering](https://qdrant.tech/documentation/search/filtering/)
- [Qdrant hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/)
- [Qdrant snapshots](https://qdrant.tech/documentation/operations/snapshots/)
- [Qdrant security](https://qdrant.tech/documentation/operations/security/)

### PostgreSQL + pgvector — strongest consolidation candidate

pgvector supports exact search, HNSW, IVFFlat, several vector representations and distances, ordinary PostgreSQL filtering and transactions, full-text/vector hybrid retrieval, WAL, backup tooling, and established PostgreSQL operations. It is attractive if this project already needs PostgreSQL for authoritative shared state. The inspected infrastructure does not currently establish an operated PostgreSQL platform, so adopting it solely for vector search would also introduce database administration, migration, backup, connection, and patching work.

Primary source:

- [pgvector repository and documentation](https://github.com/pgvector/pgvector)

### Embedding generation is a separate decision

A vector database stores and searches embeddings; it does not decide how text is embedded. The embedding model, dimensionality, normalization, batching, versioning, privacy, latency, and migration strategy must be explicit.

Ollama can serve local embeddings through an HTTP interface and recommends using the same model for indexing and querying; its embedding endpoint returns normalized vectors. The private GPU host makes this a viable prototype option. It still requires evaluation against representative memory queries and a defined model-change reindex procedure.

Primary sources:

- [Ollama embedding capability](https://docs.ollama.com/capabilities/embeddings)
- [Ollama embedding-model examples](https://ollama.com/blog/embedding-models)

## Recommended thin vertical slice

The first slice should answer whether semantic retrieval creates measurable value, not build a complete distributed memory platform.

1. Create a small, reviewed retrieval evaluation set from sanitized memories and session snippets:
   - exact identifiers and commands;
   - paraphrases;
   - project-scoped queries;
   - corrections and failure recurrence;
   - stale/conflicting memories;
   - adversarial stored text;
   - no-relevant-memory cases.
2. Record the SQLite FTS baseline: Recall@k, MRR or nDCG, wrong-project retrieval, unsafe retrieval, p50/p95 latency, and result token size.
3. Add the Memory Retrieval module and preserve SQLite-only behavior as the default adapter.
4. Add an embedding adapter and Qdrant adapter behind the module.
5. Backfill the derived index from canonical Markdown/SQLite records using stable record IDs and an embedding-model version.
6. Evaluate semantic-only and hybrid retrieval against the unchanged holdout set.
7. Keep the feature disabled unless the hybrid adapter clears agreed quality, privacy, latency, reliability, and operational thresholds.
8. Prove fallback by stopping Qdrant and the embedding endpoint: Pi startup, writes, and lexical search must still work.

## Required decisions before implementation

1. **Outcome:** Which observed FTS failures should semantic retrieval solve?
2. **Scope:** Personal memory only, session history, project memory, skills, or all of them?
3. **Sharing:** Is the goal better retrieval on one Pi installation or shared memory across several clients/agents?
4. **Authority:** Is the remote system always derived, or is shared remote memory intended to become authoritative?
5. **Privacy:** Which content may leave a client machine and be sent to the private embedding/vector hosts?
6. **Topology:** Which clients need access, from which networks, and during which support hours?
7. **Embedding contract:** Model, dimensions, normalization, chunking, versioning, and reindex behavior.
8. **Retrieval contract:** Filters, fusion, freshness/conflict treatment, score semantics, limits, and provenance.
9. **Failure behavior:** Timeouts, circuit breaker, offline mode, write queue, retry, reconciliation, and user-visible diagnostics.
10. **Operations:** Owner, upgrades, backups, restore test, monitoring, capacity, retention, deletion propagation, and cost ceiling.
11. **Compatibility:** Behavior when configuration is absent and migration behavior for existing users.
12. **Contribution strategy:** Private fork feature, upstreamable optional adapter, or separate Pi package.

## Lenkard RFC applicability

Use these foundation profiles and knowledge documents when the decisions are ready to collapse into an RFC:

- `profile-core` v0.1.0;
- `profile-ai-enabled-product` v0.1.0;
- `profile-data-product` v0.1.0;
- `ai-system-planning-and-context` v0.1.0;
- `infrastructure-foundations` v0.1.0;
- `reliability-and-operations` v0.1.0.

The key foundation rules for this effort are:

- start with deterministic paths and lexical search, then add semantic retrieval only after measured misses;
- keep the vector index derived and rebuildable from canonical data;
- treat retrieved text as untrusted context and preserve provenance;
- use the least complex design that passes representative evals;
- require explicit production approval, bounded calls, fallback, rollback, restore evidence, and an accountable owner.

## Preliminary recommendation

Proceed with a decision-first planning flow, not implementation:

1. configure the fork for Matt Pocock's engineering skills;
2. use `wayfinder` because shared semantic memory plus self-hosted infrastructure contains several unresolved product, data, retrieval, security, and operations decisions;
3. resolve research tickets in parallel where possible;
4. collapse the resulting decisions into a Lenkard Engineering RFC;
5. convert the approved RFC into tracer-bullet implementation tickets;
6. implement each slice test-first and review it against both repository standards and the RFC.

The first decision should be the desired outcome and target user. “Add a vector database” is an implementation idea, not yet an outcome.
