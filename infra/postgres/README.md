# Pi Memory PostgreSQL

PostgreSQL 17 with pgvector for the optional semantic Derived Index.

## Security model

- The published database port must bind only to a local or private host address.
- The supplied `pg_hba.conf` permits the `pi_memory` role only from Docker's local bridge and rejects all other TCP clients.
- Passwords are generated on the server and mounted as Docker secrets.
- The application role is not a superuser and cannot create roles or databases.
- Add VPN clients only through explicit reviewed `pg_hba.conf` rules; never publish PostgreSQL on a public interface.

## Server deployment

Create `secrets/postgres_superuser_password`, `secrets/pi_memory_password`, and `.env` beside `compose.yaml`:

```text
PG_BIND_ADDRESS=<local Docker bridge address>
```

Each secret must be a random value stored with mode `0600`. Then run:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

## Backups

Install `backup.sh` under `/opt/pi-memory-postgres/` and the supplied systemd service and timer under `/etc/systemd/system/`. Backups are verified with `pg_restore --list` and retained for seven days by default.

Because the semantic index is derived, canonical Curated Memory must remain independently rebuildable. If this PostgreSQL installation later owns authoritative data, add off-host backups and a scheduled restore drill before relying on it.
