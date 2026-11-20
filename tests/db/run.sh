#!/usr/bin/env bash
# Ejecuta las migraciones y los tests de base de datos en un PostgreSQL local temporal.
# Uso: tests/db/run.sh   (requiere binarios de PostgreSQL 16: initdb, pg_ctl, psql)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
trap '"$PGBIN/pg_ctl" -D "$TMP/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

if [ "$(id -u)" = "0" ]; then RUNAS=(su postgres -s /bin/bash -c); chown -R postgres "$TMP"; else RUNAS=(bash -c); fi
"${RUNAS[@]}" "'$PGBIN/initdb' -D '$TMP/data' -U postgres -A trust >/dev/null"
"${RUNAS[@]}" "'$PGBIN/pg_ctl' -D '$TMP/data' -o '-p $PORT -k $TMP -c listen_addresses=' -l '$TMP/log' start >/dev/null"

PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -t -o /dev/null)
"${PSQL[@]}" -f "$ROOT/tests/db/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "· migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
for f in "$ROOT"/tests/db/test_*.sql; do
  echo "· test $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "OK: todas las pruebas de base de datos han pasado"
