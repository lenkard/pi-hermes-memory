# Pi Hermes Memory Extension

## Project Overview

This is a Pi coding agent extension that brings Hermes-style persistent memory, session search, procedural skills, and a learning loop to Pi. The current package version is **v0.8.1**.

The `lenkard` fork is planning optional Hybrid Recall for Curated Memory. Before working on that effort, read `CONTEXT.md`, the ADRs in `docs/adr/`, and `docs/planning/README.md`. Historical version plans under `docs/0.*` and root `PLAN.md` describe earlier releases and are not the current work queue.

## Architecture

- **Language:** TypeScript loaded through Pi's extension runtime
- **Runtime:** `@earendil-works/pi-coding-agent`
- **Authoritative memory:** human-readable Markdown under `~/.pi/agent/pi-hermes-memory/` and project memory roots
- **Local search/index:** SQLite with FTS5 for memories and session history
- **Procedural memory:** Pi-native `SKILL.md` files
- **Entry point:** `src/index.ts` wires tools, lifecycle handlers, persistence, migration, and commands

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Extension composition root |
| `src/config.ts` | Backward-compatible configuration loading and defaults |
| `src/types.ts` | Shared TypeScript contracts |
| `src/store/memory-store.ts` | Markdown memory lifecycle, limits, locking, and mutations |
| `src/store/db.ts` | SQLite lifecycle, migration, WAL, and corruption recovery |
| `src/store/sqlite-memory-store.ts` | SQLite memory mirror and FTS5 retrieval |
| `src/store/session-indexer.ts` | Session indexing and incremental backfill |
| `src/store/content-scanner.ts` | Injection, exfiltration, secret, and suspicious-content scanning |
| `src/tools/memory-tool.ts` | Curated Memory mutations and SQLite reconciliation |
| `src/tools/memory-search-tool.ts` | Current lexical `memory_search` interface |
| `src/tools/session-search-tool.ts` | Indexed session-history search |
| `src/tools/skill-tool.ts` | Procedural skill management |
| `docs/planning/` | Current Business Case, Evidence Plan, RFC, and Outcome Review |
| `infra/` | Versioned PostgreSQL/pgvector and embedding-server deployment definitions |

## Design Decisions

1. **Policy-only prompt by default:** durable context is searched on demand rather than fully injected.
2. **Markdown authority:** human-readable Curated Memory remains authoritative; indexes are rebuildable.
3. **SQLite local index:** FTS5 supports memory/session search and local fallback.
4. **Atomic and serialized mutations:** memory writes coordinate concurrent editors/processes and recover conservatively.
5. **Direct review transport with subprocess fallback:** background learning avoids disturbing the main Agent context while degrading safely.
6. **Stored content is untrusted:** writes and retrieved context require deterministic scanning and current evidence overrides memory.
7. **Hermes-compatible delimiter and migration:** legacy data is normalized without silent loss.

## Current Planning and Work Tracking

- Start at `docs/planning/README.md`.
- The current proposal is `RFC-0001`, published as GitHub issue #1.
- Do not implement the proposal until its implementation approval is checked.
- After approval, implementation work is split into tracer-bullet GitHub issues carrying `ready-for-agent` and explicit blocking edges.
- `docs/ROADMAP.md`, root `PLAN.md`, and `docs/0.*` remain useful historical context but may contain completed milestones or obsolete future language.

## Agent skills

### Issue tracker

Issues and planning artifacts are tracked in GitHub Issues on `lenkard/pi-hermes-memory`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default Matt Pocock triage roles. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Development

```bash
# Type check
npm run check

# Automated tests
npm test

# Manual extension test
pi -e ./src/index.ts
```

## Installation (for users)

```bash
pi install github:chandra447/pi-hermes-memory
```
