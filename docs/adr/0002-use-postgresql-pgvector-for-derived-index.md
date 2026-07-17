# Use PostgreSQL with pgvector for the Derived Index

The semantic Derived Index will use a dedicated PostgreSQL server with pgvector rather than Qdrant. The owner values PostgreSQL as reusable infrastructure and has capacity to operate it; pgvector also keeps memory metadata, filtering, lexical search, vector search, and transactional index updates in one system. This accepts greater database operations work in exchange for a broadly useful platform, while ADR-0001 still requires the index to remain rebuildable and non-authoritative.

## Considered options

- **Qdrant:** smaller vector-specific operational surface and strong built-in hybrid retrieval.
- **PostgreSQL with pgvector:** broader operational surface, but reusable beyond this feature and able to combine relational constraints, PostgreSQL full-text search, and vector search.
