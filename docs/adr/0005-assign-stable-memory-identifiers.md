# Assign stable identifiers to Curated Memory

Every Curated Memory entry will receive a stable UUID in its hidden Markdown metadata, and that Memory ID will be preserved through replacements and shared by SQLite and PostgreSQL. Content-derived or database-local identifiers cannot reliably distinguish replacement from deletion and reinsertion across stores; a separate content hash will detect stale representations. Existing entries will receive IDs through a backward-compatible migration while visible Markdown remains readable.
