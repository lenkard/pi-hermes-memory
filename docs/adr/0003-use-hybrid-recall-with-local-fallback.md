# Use Hybrid Recall with a local lexical fallback

Memory retrieval will fuse local SQLite FTS5 candidates with semantic candidates from the PostgreSQL Derived Index rather than replacing lexical retrieval. This protects exact commands, paths, package names, and error identifiers while adding paraphrase recall; if PostgreSQL or the embedding server is unavailable, the Agent continues with bounded SQLite results. The Memory Retrieval module owns filtering, fusion, fallback, and diagnostics so the existing `memory_search` interface does not expose infrastructure choices.
