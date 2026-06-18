# ClinicBook AI — Production Deployment (Railway)

This guide deploys the **backend** (`/backend`) to [Railway](https://railway.app) as a
permanent, always-on service with a stable HTTPS URL. Once deployed, the Meta WhatsApp
webhook points at the Railway URL and the temporary `cloudflared` / `trycloudflare`
tunnel is **no longer needed**.

The flow being put into production:

```
WhatsApp user → Meta Cloud API → Railway backend (/api/whatsapp/webhook)
              → Deterministic booking FSM (WhatsAppSession, no AI) → Booking (Postgres/Supabase) → Dashboard
```

Deployment artifacts in this repo:

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Multi-stage build (TS → `dist/`, Prisma client generated) |
| `backend/.dockerignore` | Keeps secrets/build junk out of the image |
| `backend/railway.json` | Build, health check, restart policy, pre-deploy schema sync |
| `backend/.env.example` | Full list of required environment variables |

---

## 1. Prerequisites

- A Railway account.
- A PostgreSQL database — **Supabase** (existing) or a Railway Postgres plugin.
- Meta WhatsApp Cloud API app with a phone number, permanent access token, and App Secret.
- An OpenAI API key.
- Railway CLI (optional, for logs/local deploy): `npm i -g @railway/cli` then `railway login`.

---

## 2. Database (Supabase / PostgreSQL)

The app uses **two** connection strings (already supported by `prisma/schema.prisma`):

- `DATABASE_URL` — pooled connection (Supabase PgBouncer, **port 6543**), used at runtime.
- `DIRECT_URL` — direct connection (**port 5432**), used by `prisma db push` for schema sync.

In Supabase: **Project Settings → Database → Connection string**.

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres?sslmode=require
```

> Schema is synced with **`prisma db push`** (this project's convention — do **not** use
> `prisma migrate deploy`). `railway.json` runs `prisma db push --skip-generate` as a
> pre-deploy step on every deploy. It is idempotent; if it ever detects a destructive
> change it fails the deploy (no `--accept-data-loss`) so data is never silently dropped.

---

## 3. Create the Railway service

### Option A — Deploy from GitHub (recommended)

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo** → select the repo.
3. Open the service → **Settings → Source → Root Directory** → set to **`backend`**.
   Railway then finds `backend/Dockerfile` and `backend/railway.json` automatically.
4. Confirm **Settings → Build → Builder = Dockerfile**.

### Option B — Deploy via CLI

```bash
cd backend
railway init           # create/link a project
railway up             # builds the Dockerfile and deploys
```

---

## 4. Environment variables

Railway → service → **Variables** → add the following (see `backend/.env.example`).
**Do not set `PORT`** — Railway injects it and the server binds to it automatically.

| Variable | Required | Notes |
|----------|:--------:|-------|
| `NODE_ENV` | ✅ | `production` |
| `DATABASE_URL` | ✅ | Pooled Supabase URL (port 6543) |
| `DIRECT_URL` | ✅ | Direct Supabase URL (port 5432) — used by `db push` |
| `JWT_SECRET` | ✅ | ≥16 chars, unique. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | ◻️ | Default `7d` |
| `CORS_ORIGIN` | ✅ | Deployed frontend URL (comma-separated for multiple), or `*` |
| `WHATSAPP_TOKEN` | ✅ | Meta Cloud API permanent token |
| `PHONE_NUMBER_ID` | ✅ | WhatsApp phone number id |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ✅ | WABA id |
| `VERIFY_TOKEN` | ✅ | Any string; must match Meta webhook "Verify token" |
| `WHATSAPP_APP_SECRET` | ✅ | Meta App Secret — enforces inbound webhook HMAC verification |
| `WHATSAPP_CLINIC_ID` | ✅ | Clinic id that owns the WhatsApp number |
| `PUBLIC_BASE_URL` | ◻️ | Your Railway domain (e.g. `https://<app>.up.railway.app`). Makes the startup banner & `GET /api/whatsapp/debug` report the correct webhook URL. Recommended. |
| `OPENAI_API_KEY` | ◻️ | Only the dashboard staff AI assistant uses it now; the WhatsApp booking FSM is deterministic and needs no AI |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | ◻️ | Only if billing is used |

> The server refuses to boot if `JWT_SECRET` is missing/placeholder or if
> `DATABASE_URL` is unset — this is intentional fail-fast behavior.

After saving variables, trigger a redeploy (Railway → **Deployments → Redeploy**).

---

## 5. Get the permanent URL

Railway → service → **Settings → Networking → Generate Domain**. You get a stable URL like:

```
https://clinicbook-ai-backend-production.up.railway.app
```

(Optionally add a custom domain in the same panel.) This URL replaces the tunnel.

Verify it is live:

```bash
curl https://<your-railway-domain>/health
# {"success":true,"data":{"status":"ok","database":"connected",...}}
```

---

## 6. Point the Meta WhatsApp webhook at Railway

Meta App Dashboard → **WhatsApp → Configuration → Webhook → Edit**:

- **Callback URL:** `https://<your-railway-domain>/api/whatsapp/webhook`
- **Verify token:** the exact value of `VERIFY_TOKEN`
- Click **Verify and save** (Meta calls `GET /api/whatsapp/webhook` and expects the challenge echoed back).
- Under **Webhook fields**, subscribe to **`messages`**.

Send a WhatsApp message to the business number to confirm Railway logs show the inbound payload.

---

## 7. Remove the trycloudflare tunnel

The backend has **no code dependency** on the tunnel — it was only an external way to
expose `localhost` to Meta. Once Meta's webhook points at the Railway domain (step 6):

- Stop any running `cloudflared` / `trycloudflare` process.
- Remove tunnel startup from any local scripts / process managers.
- `tunnel.log` at the repo root is now obsolete and can be deleted.

No code change is required; the tunnel simply stops being referenced.

---

## 8. Health checks & restart protection

Configured in `backend/railway.json`:

- **Health check:** Railway probes `GET /health` (which runs `SELECT 1` against the DB)
  before routing traffic to a new deploy; `healthcheckTimeout` is 300s.
- **Restart policy:** `ON_FAILURE` with up to `10` retries — Railway automatically
  restarts the container if the process crashes.
- **Graceful shutdown:** the server handles `SIGTERM`/`SIGINT`, closes the HTTP server,
  and disconnects Prisma cleanly on redeploys (`src/server.ts`).

---

## 9. End-to-end verification

1. **Backend health:** `curl https://<railway-domain>/health` → `200`, `database:"connected"`.
2. **Webhook handshake:** Meta "Verify and save" succeeds (step 6).
3. **Inbound → FSM → booking:** From a WhatsApp client, message the business number
   (e.g. *"Book appointment"* or *"hi"*). Expect:
   - Railway logs: `WhatsApp webhook received` + `[FSM] ◀ transition` lines for your message.
   - A deterministic numbered reply arrives in WhatsApp (main menu / speciality list).
   - Reply with numbers (`1 → 1 → 1 → 1 → YES`) to complete a PENDING booking. No `AiConversation`/`AiMessage` rows are created.
4. **Dashboard:** Log into the clinic dashboard (frontend) for `WHATSAPP_CLINIC_ID` and
   confirm the new patient + appointment appear.
5. **Delivery tracking:** Railway logs show inbound `statuses` (delivered/read) being persisted.

---

## 10. Operations

- **Logs:** Railway → service → **Deployments → View Logs**, or CLI `railway logs`.
- **Redeploy:** push to the connected branch, or Railway → **Redeploy**.
- **Rollback:** Railway → **Deployments** → pick a previous successful deploy → **Redeploy**.
- **Schema changes:** edit `prisma/schema.prisma`, commit, deploy — the pre-deploy
  `prisma db push` syncs the database. If it reports potential data loss, the deploy
  fails by design; review and apply the change manually before retrying.
