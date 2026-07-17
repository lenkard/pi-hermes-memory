# Semantic Recall operations

Semantic Recall is optional and disabled by default. Markdown remains authoritative; PostgreSQL is a rebuildable Derived Index.

## Opt-in configuration

`hermes-memory-config.json` stores environment-variable **names**, never secret values:

```json
{
  "semanticIndex": {
    "enabled": true,
    "postgresUrlEnv": "PI_HERMES_MEMORY_POSTGRES_URL",
    "embeddingEndpointEnv": "PI_HERMES_MEMORY_EMBEDDING_ENDPOINT",
    "embeddingApiKeyEnv": "PI_HERMES_MEMORY_EMBEDDING_API_KEY"
  }
}
```

Inject those variables into the Pi Agent process. Do not place connection URLs, passwords, API keys, or authorization headers in the JSON file, Markdown memory, repository, or command output.

If configuration or either remote service is absent, `memory_search` returns bounded SQLite lexical results.

## Commands

- `/memory-semantic-status` — reports enabled mode, database and embedding health, Embedding Contract, indexed/pending/failed/leased counts, and last successful reconciliation.
- `/memory-semantic-reconcile` — previews missing, stale, changed-contract, and orphaned derived rows.
- `/memory-semantic-reconcile repair` — queues bounded upsert/delete repairs through the durable SQLite work queue.
- `/memory-semantic-rebuild` — previews authoritative and derived row counts without changing state.
- `/memory-semantic-rebuild confirm` — deletes only derived PostgreSQL rows and queues all current authoritative memories for reindexing.
- `/memory-semantic-cancel` — cancels background work for the current Agent process while preserving pending work for restart.

Diagnostics expose counts, timings, exclusions, fusion/fallback state, and redacted availability reasons. They do not expose raw vectors, memory text, credentials, connection URLs, or authorization headers.

## Recovery

SQLite queue entries survive Agent restart. Startup processes at most 20 entries in batches no larger than 16. Cancellation releases leases without consuming a retry attempt. PostgreSQL can be deleted and rebuilt from current Curated Memory.
