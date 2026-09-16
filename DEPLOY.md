# Deploying HospitalityOS to production

The whole platform ships as **one Docker image** (root `Dockerfile`) that builds the
web SPA + API and serves both from a single origin. You need a managed
**PostgreSQL** and **Redis** alongside it. Works on Railway, Render, Fly.io, or any
Docker host.

## 1. What's already production-hardened
- **Security headers** (helmet) + **gzip** (compression) on every response.
- **CORS** locked to `CORS_ORIGINS` (comma-separated allow-list; `*` only for dev).
- **Per-IP rate limiting** (`THROTTLE_TTL` / `THROTTLE_LIMIT`), global.
- **WebSockets require a valid JWT** (dashboard + kitchen/bar feeds); a client can
  only join its own hotel's room (derived from the token, not the query).
- **PII encrypted at rest** (AES-256-GCM) when `APP_ENCRYPTION_KEY` is set.
- **Payment webhooks** verify provider signatures and never crash on bad input;
  outbound provider calls have timeouts.
- **OTA webhook** can require a shared secret (`CHANNEL_WEBHOOK_SECRET`).
- Migrations run automatically on container start (`prisma migrate deploy`).

## 2. Railway (recommended path)
1. Push the repo to GitHub.
2. New Railway project → **add PostgreSQL** and **add Redis** plugins.
3. **New service → Deploy from repo**, builder = **Dockerfile** (root `Dockerfile`).
4. Set service **Variables** (see §4). At minimum:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `REDIS_URL=${{Redis.REDIS_URL}}`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_ENCRYPTION_KEY` (generate strong values)
   - `CORS_ORIGINS=https://your-app.up.railway.app`
   - `NODE_ENV=production`
   - (`SERVE_WEB=true` and `WEB_DIST=/repo/apps/web/dist` are baked into the image.)
5. Set `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`, then run once
   (Railway one-off command or shell): `npm --prefix apps/api run db:bootstrap`
   → seeds the subscription plans and the master (platform-admin) login. It does
   NOT create any hotel — hotels self-register.
6. Open the service URL — the SPA and API are on the same domain:
   - `/` landing (find-your-hotel + register), `/register` new hotel,
     `/h/<slug>` a hotel's staff login, `/master` the master controller.
   Point WhatsApp / Paystack / Flutterwave / OTA webhooks at
   `https://<your-domain>/api/v1/...`.

Generate secrets:
```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"          # APP_ENCRYPTION_KEY
```

## 3. Hosting the web separately (optional)
If you’d rather host the SPA on Vercel/Netlify and the API elsewhere:
- Build the web with `VITE_API_BASE=https://api.yourhotel.com`.
- Set the API’s `CORS_ORIGINS` to the web’s origin.
- Leave `SERVE_WEB=false`.

## 4. Environment variables
**Required (set real values in prod):**
`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`APP_ENCRYPTION_KEY`, `CORS_ORIGINS`, `NODE_ENV=production`, `DEFAULT_CURRENCY`.

**Optional (features degrade gracefully if blank):**
`ANTHROPIC_API_KEY` (AI), `WHATSAPP_*` (WhatsApp), `PAYSTACK_SECRET_KEY` /
`FLUTTERWAVE_SECRET_KEY` / `FLUTTERWAVE_SECRET_HASH` (online payments),
`SENDGRID_API_KEY` + `EMAIL_FROM` (email), `CHANNEL_WEBHOOK_SECRET` (OTA webhook),
`THROTTLE_TTL`/`THROTTLE_LIMIT`, `HOLD_TTL_MINUTES`, `LOYALTY_*`, `FX_*`,
`PUBLIC_BOOKING_ENABLED`.

**Multi-tenant platform:**
The platform is multi-tenant — **every hotel is a customer that self-registers**,
so there is no hotel/owner in env. The ONLY identity seeded from env is the master:
`PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` / `PLATFORM_ADMIN_NAME` (created
once by `db:bootstrap`, which also seeds the trial/starter/pro/enterprise plans).
Also `PUBLIC_SIGNUP_ENABLED` (default true) and `TRIAL_DAYS` (default 14). The master
console lives at `/master` (separate platform-admin session): approve trial hotels,
set plans, toggle per-hotel features, suspend/reactivate, subscription billing,
platform settings, and impersonate an owner for support.

See `.env.example` for the full annotated list.

## 5. Operational notes
- **Run a single API instance** (or split a worker) — the cron jobs (night audit,
  PM schedules, hold auto-release, loss sweep, SLA escalation) and the BullMQ
  WhatsApp worker run in-process; multiple instances would double-fire crons.
- **Backups**: enable automated Postgres backups on your provider.
- **First run** seeds plans + the master login via `db:bootstrap` (no hotel is
  created — hotels self-register at `/register`); everything else
  (rooms, rates, staff logins, menu, inventory) is configured in-app.
