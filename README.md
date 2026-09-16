# HospitalityOS

AI-powered hotel operating system for small/independent hotels. Modular NestJS monolith + Prisma/PostgreSQL + React PWA, with a Claude orchestration layer that **communicates and reasons** while deterministic services **decide and commit**.

> Build spec: [plan.md](./plan.md). This repo is built phase-by-phase per §18. **Currently: Phase 0 — Foundation & reservation spine.**

## Architecture (golden rule)

Deterministic core owns all state transitions; the AI only calls those services as tools. Every mutation is audited. See [plan.md](./plan.md) §3–§7.

## Monorepo layout

```
/apps/api      NestJS backend (modular monolith, one Postgres DB)
/apps/web      React + Vite PWA (owner/manager + staff, offline-tolerant)
/packages/shared   shared TS types, zod schemas, enums
```

## Prerequisites

- Node.js 20+ (tested on 24)
- Docker (for Postgres + Redis)

## Quick start

```bash
# 1. install deps
npm install

# 2. configure env
cp .env.example .env        # fill in secrets as needed

# 3. start infra (postgres + redis)
npm run infra:up

# 4. migrate + bootstrap (seeds plans + the master/platform-admin login; NO hotel
#    is created — hotels self-register at /register). Set PLATFORM_ADMIN_* in .env.
npm run db:migrate
npm run db:bootstrap        # seeds plans + master login (sign in at /master)

# 5. run the API (http://localhost:3000/api/v1)
npm run dev:api

# 6. (separate terminal) run the web PWA
npm run dev:web
```

## Useful scripts

| Command | What it does |
|---|---|
| `npm run infra:up` / `infra:down` | start/stop Postgres + Redis |
| `npm run db:migrate` | apply Prisma migrations |
| `npm run db:seed` | seed demo hotel + data (§20) |
| `npm run db:generate` | regenerate the Prisma client |
| `npm run dev:api` | NestJS in watch mode |
| `npm run dev:web` | Vite dev server |
| `npm test` | run all workspace tests |

## Phase 0 demo (acceptance)

- Take a booking that **cannot double-book** (enforced by a Postgres exclusion constraint + app check).
- Check a guest in and out; checkout auto-creates a housekeeping cleaning task.
- Offline write-queue replays idempotently on reconnect.

See `apps/api/test` for the proving tests.
