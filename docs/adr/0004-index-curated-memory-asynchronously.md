# Index Curated Memory asynchronously

A successful Curated Memory write will not wait for embedding generation or PostgreSQL. Semantic indexing is eventually consistent and recoverable through durable pending work plus Index Reconciliation, so remote latency or outages cannot break authoritative writes. This accepts a temporary window where Hybrid Recall uses stale or lexical-only results in exchange for preserving local-first availability; retries must be bounded and observable.
