# Pi Hermes Memory

Shared language for persistent knowledge used by the Pi coding agent.

## Language

**Agent**:
The single Pi assistant whose durable knowledge persists across sessions.
_Avoid_: Tenant, client, worker

**Semantic Recall**:
Retrieval of relevant durable knowledge when the query and stored text express the same meaning with different words.
_Avoid_: Vector lookup, fuzzy search

**Curated Memory**:
Durable knowledge deliberately retained for the Agent, including user, global, project, and categorized lesson entries; raw session transcripts are excluded.
_Avoid_: Session history, chat archive, corpus

**Derived Index**:
A rebuildable retrieval representation of Curated Memory that improves discovery but never owns the authoritative record.
_Avoid_: Source of truth, primary memory, remote memory

**Retrieval Evaluation**:
A versioned set of memory queries with independently expected results used to compare lexical, semantic, and hybrid retrieval behavior.
_Avoid_: Demo queries, benchmark anecdotes

**Embedding Contract**:
The versioned combination of model, quantization, dimensions, pooling, and query instruction that maps Curated Memory and searches into comparable vectors.
_Avoid_: Model name, embedding endpoint

**Hybrid Recall**:
Retrieval that combines lexical and semantic rankings while preserving scope, provenance, and a lexical fallback.
_Avoid_: Semantic search, vector search

**Index Reconciliation**:
Comparison of authoritative Curated Memory with the Derived Index to repair missing, changed, or deleted representations.
_Avoid_: Database synchronization, replication

**Memory ID**:
A stable opaque identifier that follows one Curated Memory entry through replacement, indexing, retrieval, and deletion.
_Avoid_: Content hash, database row ID

**Active Project**:
The project associated with the Agent's current working context and therefore eligible for default project-scoped recall.
_Avoid_: Tenant, workspace
