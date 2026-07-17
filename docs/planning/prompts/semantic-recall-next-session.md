# Semantic Recall next-session prompt

Open `/home/coder/pi-hermes-memory`, start a new Pi session with `/new`, and paste the prompt below.

```text
Work in /home/coder/pi-hermes-memory.

Goal: find the smallest evidence-backed fix for Hybrid Semantic Recall while keeping the installed Pi Agent in SQLite-only mode.

Token budget: approximately 50k tokens. Stop and report before expanding scope or deploying new infrastructure.

Read first:
- docs/research/low-cost-retrieval-quality-options.md
- docs/planning/evidence/results/activation-review.md
- docs/planning/evidence/results/final-code-review.md
- docs/planning/rfcs/RFC-0001-hybrid-semantic-recall.md
- docs/planning/evidence/EP-0001-semantic-recall.md

Current facts:
- Installed/reviewed commit: 1585d29.
- Semantic Recall is disabled in /root/.pi/agent/hermes-memory-config.json. Do not enable or modify that setting.
- Exact pgvector ranking works; do not add HNSW/IVFFlat or redesign PostgreSQL.
- CodeSearchNet diagnostic achieved 100% raw test Recall@5.
- At cosine cutoff 0.55, Recall@5 was 96.7%, but the no-match proxy accepted 96.7%.
- Tightening the cutoff to about 0.39 reduced Recall@5 to 76.7%.
- Query instruction changes and top-result margin did not solve the tradeoff.
- Existing raw datasets, scripts, cached vectors, and results are under ignored .scratch/coir-codesearchnet-eval/.
- Previously inspected holdouts are burned and must not be reused as activation evidence.

Proceed in this order:

1. Reproduce the saved results from cached vectors without rerunning expensive embeddings.
2. TDD a small lexical eligibility fix:
   - remove low-information natural-language terms before OR fallback;
   - ensure a match cannot be caused only by words such as “on”, “is”, or “what”;
   - preserve exact paths, commands, identifiers, quoted phrases, and explicit FTS operators.
3. Separate lexical and semantic no-match behavior in development evidence.
4. If semantic-only abstention still cannot meet ≥90% Recall@5 and ≤5% no-match false positives, build a disposable reranker prototype:
   - first verify primary-source model and llama.cpp compatibility;
   - rerank only the top 5–10 union candidates;
   - use an explicit relevance threshold;
   - do not productionize before development latency and quality pass.
5. Use only development data for thresholds.
6. Freeze all parameters before creating a new untouched holdout from unused labels.
7. Execute the new holdout once.
8. Public datasets are diagnostic only; they cannot replace a Curated Memory holdout.
9. If development or holdout fails, stop. Leave Semantic Recall disabled and document why.
10. If it passes, implement production changes test-first, then run:
    - npm run check
    - npm test
    - opt-in real-service integration tests

Constraints:
- Markdown remains authoritative.
- PostgreSQL remains a metadata/vector-only Derived Index.
- No session transcript embeddings.
- No automatic per-turn retrieval.
- No secrets in Git, logs, diagnostics, or Markdown.
- Do not install PostgreSQL or embedding/reranking services inside the Pi Agent environment.
- Preserve SQLite fallback, Active Project isolation, safety scanning, stable IDs, cancellation, and the two-second hard timeout.
- Do not activate Semantic Recall without explicit owner approval.

Deliver:
- development and fresh-holdout metrics;
- latency and outage results;
- exact commands and versions;
- a clear activate/do-not-activate recommendation;
- minimal production code only if evidence supports it.
```
