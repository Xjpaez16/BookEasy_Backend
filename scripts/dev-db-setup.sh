#!/usr/bin/env bash
#
# dev-db-setup.sh — bring the local backend's data layer up and ready.
#
# Prereqs (install once, in YOUR interactive terminal — an agent sandbox cannot
# run Homebrew's installer):
#   brew install postgresql@16 redis
#   brew services start postgresql@16
#   brew services start redis
#
# Then run this from be-Backend/:
#   bash scripts/dev-db-setup.sh
#
# It is idempotent: safe to re-run. It reads DATABASE_URL from .env.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Load .env (DATABASE_URL / REDIS_URL) ---------------------------------
if [[ ! -f .env ]]; then
  echo "No .env found — copying from .env.example"
  cp .env.example .env
fi
# shellcheck disable=SC1091
set -a; source .env; set +a

: "${DATABASE_URL:?DATABASE_URL must be set in .env}"

# Expected defaults from .env.example:
#   postgres://bookeasy:bookeasy@localhost:5432/bookeasy
DB_USER="bookeasy"
DB_PASS="bookeasy"
DB_NAME="bookeasy"

echo "==> Checking PostgreSQL is reachable…"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install it first:  brew install postgresql@16"
  echo "and ensure it is on PATH (brew info postgresql@16 prints the export line)."
  exit 1
fi

if ! pg_isready -q 2>/dev/null; then
  echo "PostgreSQL is not accepting connections on localhost:5432."
  echo "Start it with:  brew services start postgresql@16"
  exit 1
fi

echo "==> Ensuring role '${DB_USER}' exists…"
psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  psql postgres -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' CREATEDB;"
psql postgres -c "ALTER ROLE ${DB_USER} PASSWORD '${DB_PASS}';" >/dev/null

echo "==> Ensuring database '${DB_NAME}' exists…"
psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  createdb -O "${DB_USER}" "${DB_NAME}"

echo "==> Checking Redis is reachable…"
if command -v redis-cli >/dev/null 2>&1; then
  redis-cli ping >/dev/null 2>&1 && echo "Redis OK" || \
    echo "WARNING: Redis not responding on localhost:6379 — start it: brew services start redis"
else
  echo "WARNING: redis-cli not found — install: brew install redis"
fi

echo "==> Applying Drizzle migrations…"
bun run db:migrate

echo ""
echo "✅ Data layer ready. Next:"
echo "   bun run dev          # API on :3000"
echo "   bun run worker:dev   # reminders worker"
echo "   curl localhost:3000/ready"
