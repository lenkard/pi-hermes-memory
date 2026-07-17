#!/usr/bin/env bash
set -euo pipefail

app_password="$(cat /run/secrets/pi_memory_password)"

psql --set=ON_ERROR_STOP=1 --username postgres --dbname postgres \
  --set=app_password="$app_password" <<'SQL'
CREATE ROLE pi_memory LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE DATABASE pi_memory OWNER pi_memory;
REVOKE ALL ON DATABASE pi_memory FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE pi_memory TO pi_memory;
SQL

psql --set=ON_ERROR_STOP=1 --username postgres --dbname pi_memory <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO pi_memory;
SQL
