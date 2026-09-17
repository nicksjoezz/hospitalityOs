#!/bin/sh
set -e

echo "=== [HospitalityOS] Starting Boot Sequence ==="

# 1. Resolve External Database URL from any known provider variable (Railway, Supabase, Render)
if [ -n "$DATABASE_PUBLIC_URL" ] && [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="$DATABASE_PUBLIC_URL"
elif [ -n "$DATABASE_PRIVATE_URL" ] && [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="$DATABASE_PRIVATE_URL"
elif [ -n "$POSTGRES_URL" ] && [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="$POSTGRES_URL"
elif [ -n "$POSTGRESQL_URL" ] && [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="$POSTGRESQL_URL"
fi

# 2. If no external PostgreSQL is configured, initialize and boot internal PostgreSQL
if [ -z "$DATABASE_URL" ]; then
  echo "--> No external DATABASE_URL detected. Starting embedded PostgreSQL..."
  mkdir -p /run/postgresql /var/lib/postgresql/data
  chown -R postgres:postgres /run/postgresql /var/lib/postgresql/data

  if [ ! -f "/var/lib/postgresql/data/PG_VERSION" ]; then
    echo "--> Initializing internal database cluster..."
    su postgres -c "initdb -D /var/lib/postgresql/data -E UTF8"
  fi

  echo "--> Starting internal PostgreSQL daemon..."
  su postgres -c "pg_ctl -D /var/lib/postgresql/data -o '-c listen_addresses=127.0.0.1' -w start"
  
  # Create database if not exists
  su postgres -c "psql -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname = 'hospitalityos'\" | grep -q 1 || psql -d postgres -c 'CREATE DATABASE hospitalityos;'"
  
  export DATABASE_URL="postgresql://postgres@127.0.0.1:5432/hospitalityos?schema=public"
  echo "--> Embedded PostgreSQL ready on 127.0.0.1:5432."
else
  echo "--> External DATABASE_URL detected. Connecting to managed database..."
fi

# 3. If no external REDIS_URL or default localhost, start embedded Redis
if [ -n "$REDIS_PUBLIC_URL" ] && [ -z "$REDIS_URL" ]; then
  export REDIS_URL="$REDIS_PUBLIC_URL"
elif [ -n "$REDIS_PRIVATE_URL" ] && [ -z "$REDIS_URL" ]; then
  export REDIS_URL="$REDIS_PRIVATE_URL"
fi

if [ -z "$REDIS_URL" ] || echo "$REDIS_URL" | grep -q "localhost\|127.0.0.1"; then
  echo "--> Starting embedded Redis daemon..."
  redis-server --daemonize yes
  export REDIS_URL="redis://127.0.0.1:6379"
fi

# 4. Run Prisma database schema migrations
echo "--> Applying database migrations..."
cd /repo/apps/api
npx prisma migrate deploy

# 5. Automatically seed platform admin and plans if first boot
echo "--> Verifying platform bootstrap (master admin & subscription plans)..."
npx ts-node prisma/bootstrap.ts || true

# 6. Start the unified API & Web SPA server
echo "=== [HospitalityOS] Ready! Starting NestJS & SPA server on port ${PORT:-3000} ==="
exec node dist/main.js
