# ClinicBook AI v2 — Enterprise Multi-Tenant Architecture

> **Status: PROPOSAL — awaiting approval. No code has been changed.**
> Goal: one backend, one database, unlimited clinics, with hard tenant isolation.
> Target scale: 1,000 clinics · 10,000 doctors · 500,000 patients · millions of WhatsApp messages.

This document is grounded in an audit of the *current* codebase (see §11). It separates
"what already works" from "what blocks 1000 clinics" so we refactor only what's necessary.

---

## 0. Executive Summary — where we actually stand

The good news: **the database is already multi-tenant by design.** Every business table
carries `clinicId`, the JWT already carries `clinicId`, and the dashboard/REST layer almost
universally scopes queries by `req.user.clinicId`. The AI tool layer already delegates booking
to the deterministic services rather than free-handing writes.

The blockers to 1000 clinics are **four structural gaps**, not a missing data model:

| # | Blocker | Why it stops 1000 clinics |
|---|---------|---------------------------|
| **B1** | **WhatsApp is single-tenant.** One global token + `PHONE_NUMBER_ID` in env; `WHATSAPP_CLINIC_ID` env binds *every* inbound message to *one* clinic. | A second clinic literally cannot receive bookings. Onboarding a clinic requires editing env + redeploying = manual work per clinic. |
| **B2** | **Phone-keyed session tables.** `WhatsAppSession` and `WhatsAppConversation` are `@unique` on `phone` alone. | One patient phone messaging two clinics collides — FSM state and the 24h send-window leak across tenants. |
| **B3** | **No tenant engine.** `clinicId` is hand-threaded through every function; writes use `where:{ id }` after a separate ownership read (TOCTOU + fragile). | Every new query is a chance to forget `clinicId`. Unscalable to audit by hand across 1000 tenants. |
| **B4** | **No automated onboarding.** A clinic going live needs an admin to set `WHATSAPP_CLINIC_ID`, register templates, and redeploy. | Self-serve signup is impossible; growth is gated on manual ops. |

Everything else (RBAC, indexes, AI guardrails, billing) is incremental hardening on top of a
sound model. The roadmap in §12 sequences these so the live booking line is never broken.

---

## 1. Complete Architecture Diagram (target state)

```
                                  ┌─────────────────────────────────────────────┐
                                  │              CLIENTS / CHANNELS              │
                                  └─────────────────────────────────────────────┘
   Clinic Admin (browser)     Patient (WhatsApp)        Patient (voice note)      Stripe / Meta
        │                          │                          │                      │
        │ HTTPS + JWT              │ Cloud API webhook         │ audio → Whisper      │ signed webhooks
        ▼                          ▼                          ▼                      ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │                              EDGE  (Vercel frontend · Cloudflare)                          │
 │   - SPA dashboard (clinic admin)          - TLS, WAF, rate limit, DDoS                     │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
        │                          │                          │                      │
        ▼                          ▼                          ▼                      ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │                          BACKEND  (Express / Railway, stateless, N replicas)               │
 │                                                                                            │
 │  ┌──────────────────────────────────────────────────────────────────────────────────┐    │
 │  │                            TENANT ENGINE (new — §3)                                │    │
 │  │   resolveTenant(source) ──► req.clinic = { id, plan, settings, waChannel, … }      │    │
 │  │   sources:  JWT │ WhatsApp phone_number_id │ API key │ Stripe metadata │ subdomain  │    │
 │  └──────────────────────────────────────────────────────────────────────────────────┘    │
 │            │                          │                          │                         │
 │  ┌─────────▼─────────┐   ┌────────────▼───────────┐   ┌──────────▼──────────────────┐     │
 │  │  REST / Dashboard │   │  WhatsApp Ingress (§5)  │   │  Webhooks (Stripe / Meta)   │     │
 │  │  appts patients   │   │  webhook → resolve by   │   │  signature-verified         │     │
 │  │  doctors waitlist │   │  phone_number_id → FSM  │   │                             │     │
 │  │  analytics billing│   └────────────┬───────────┘   └──────────┬──────────────────┘     │
 │  └─────────┬─────────┘                │                          │                         │
 │            │            ┌─────────────▼─────────────┐            │                         │
 │            │            │  AI UNDERSTANDING (§6)     │  (advisory only — never writes)     │
 │            │            │  intent·speciality·doctor  │            │                         │
 │            │            │  ·date·time·lang·confidence │            │                         │
 │            │            └─────────────┬─────────────┘            │                         │
 │            │                          │ structured intent                                  │
 │            ▼                          ▼                          ▼                         │
 │  ┌──────────────────────────────────────────────────────────────────────────────────┐    │
 │  │              DOMAIN SERVICES  (the ONLY writers — FSM + service layer, §7)         │    │
 │  │   appointment · waitlist · scheduling · reminder · notification · patient · doctor  │    │
 │  │   EVERY query auto-scoped to req.clinic.id via the tenant-scoped Prisma client      │    │
 │  └──────────────────────────────────────────────────────────────────────────────────┘    │
 │            │                          │                          │                         │
 │  ┌─────────▼──────────┐   ┌───────────▼──────────┐   ┌───────────▼─────────────────┐      │
 │  │  Outbound WhatsApp  │   │  Background workers  │   │  Realtime (SSE) per-clinic   │      │
 │  │  per-clinic creds   │   │  reminder · waitlist │   │  notification stream         │      │
 │  └─────────┬──────────┘   │  cron (all-clinic    │   └─────────────────────────────┘      │
 │            │              │  scan, per-row scope) │                                        │
 └────────────┼──────────────┼───────────────────────────────────────────────────────────────┘
              │              │
              ▼              ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │                       DATA  (Supabase / Postgres — single DB, row-level tenancy)           │
 │   Clinic ─┬─ User ─┬─ Patient ─┬─ Doctor ─┬─ Appointment ─┬─ Waitlist ─┬─ WhatsAppChannel  │
 │           └─ Settings  Audit   Notification  Schedule/Leave  Reminder    Subscription       │
 │   + (optional, §10) Postgres RLS as a hard backstop on clinic_id                            │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key principles**
1. **One tenant resolution point.** Nothing downstream reads `clinicId` from anywhere but `req.clinic`.
2. **AI advises, FSM/services act.** The understanding layer returns structured intent; only the domain services mutate data.
3. **Stateless backend.** All per-conversation state lives in the DB (already true), so the backend scales horizontally behind a load balancer.
4. **Per-clinic WhatsApp identity.** Credentials and inbound routing are looked up per clinic, never global env.

---

## 2. Database Diagram (target state)

Existing tables are kept; **bold** = new or changed. Cascade rules and indexes in §6-equivalent below.

```
Clinic (id, name, email⊙, phone⊙, plan, stripeCustomerId⊙, status, createdAt)
  │
  ├─1:N─ User (id, clinicId→, email⊙, passwordHash, role, …)
  │
  ├─1:N─ Patient (id, clinicId→, phone, name, …)            ⊕ @@unique(clinicId, phone)
  │        └─1:N─ Appointment, 1:1 Waitlist, 1:N AiConversation
  │
  ├─1:N─ Doctor (id, clinicId→, name, speciality, …)        ⊕ @@unique(clinicId, name)
  │        ├─1:N─ DoctorSchedule (clinicId→, doctorId→)
  │        └─1:N─ DoctorLeave   (clinicId→, doctorId→)
  │
  ├─1:N─ Appointment (id, clinicId→, doctorId→, patientId→, date, time, status, …)
  │        └─1:N─ Reminder (appointmentId→, type)           ⊕ ADD clinicId→ (denormalized, §6)
  │
  ├─1:N─ Waitlist (id, clinicId→, patientId⊙, status, desired*/offered*, …)
  │                                                          ⊕ CHANGE patientId unique → @@unique(clinicId, patientId)
  │
  ├─1:N─ Notification (id, clinicId→, type, …)
  ├─1:N─ AiConversation (id, clinicId→, userId?, patientId?, channel) ─1:N─ AiMessage
  ├─1:N─ WhatsAppLog (id, clinicId?→, to, status, …)
  │
  ├─1:N─ **WhatsAppChannel**  ⊕ NEW — per-clinic WhatsApp identity (replaces global env)
  │        (id, clinicId→, phoneNumberId⊙, wabaId, displayPhone,
  │         accessTokenEnc, appSecretEnc, verifyToken, status, createdAt)
  │
  ├─1:1─ **ClinicSettings**   ⊕ NEW — timezone, booking buffer, slot length, locale,
  │        business hours, branding, feature flags (per-clinic, replaces global env flags)
  │
  ├─1:1─ **Subscription**     ⊕ NEW — plan, status, stripeSubscriptionId, limits, renewsAt
  │
  └─1:N─ **AuditLog**         ⊕ NEW — (id, clinicId→, actorType, actorId, action, entity,
           entityId, meta, createdAt)  — who-did-what, per tenant

  **WhatsAppSession**     ⊕ CHANGE — add clinicId→; @@unique(clinicId, phone) (was: phone⊙)
  **WhatsAppConversation**⊕ CHANGE — add clinicId→; @@unique(clinicId, phone) (was: phone⊙)
  WhatsAppAudit (already clinicId?) — make clinicId required once channel routing lands
```

**Why the session-table change (B2) is the critical schema fix:** today
`WhatsAppSession.phone @unique` and `WhatsAppConversation.phone @unique` mean a phone number
can exist in exactly *one* row globally. The same patient messaging two clinics overwrites the
other's FSM state and shares the 24h send-window. Re-keying on `(clinicId, phone)` is what makes
the same human a distinct conversation per clinic.

---

## 3. Tenant Engine Design

A single module that turns *any* request into a resolved, cached `req.clinic` — and a Prisma
client that **cannot** emit a query without a `clinicId`.

```
┌────────────────────────────────────────────────────────────────────────┐
│  TenantResolver.resolve(req) : Tenant                                   │
│                                                                        │
│  switch (source) {                                                     │
│    JWT (dashboard/REST)      → tenant = clinics[ payload.clinicId ]     │
│    WhatsApp webhook          → tenant = byPhoneNumberId[ value.metadata │
│                                          .phone_number_id ]             │
│    API key (integrations)    → tenant = byApiKeyHash[ sha256(key) ]     │
│    Stripe webhook            → tenant = byStripeCustomerId[ cust ]      │
│    Subdomain (future)        → tenant = bySlug[ host.split('.')[0] ]    │
│  }                                                                      │
│  if (!tenant || tenant.status !== 'ACTIVE') → 401/402/403              │
│  req.clinic = tenant            // { id, plan, settings, waChannel }    │
│  req.db     = forClinic(tenant.id)   // tenant-scoped Prisma client     │
└────────────────────────────────────────────────────────────────────────┘
```

**Tenant object (cached in-process, short TTL + invalidation on settings change):**
```ts
type Tenant = {
  id: string;
  plan: ClinicPlan;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  settings: ClinicSettings;        // timezone, buffers, slot length, flags
  waChannel: WhatsAppChannel | null; // per-clinic phoneNumberId + decrypted token
};
```

**Tenant-scoped Prisma client (`forClinic`) — the core safety mechanism (kills B3).**
Implemented with Prisma Client Extensions (`$extends`) so the scoping is *structural*, not
a convention developers must remember:

```ts
// pseudo
function forClinic(clinicId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        // every read/write on a tenant model gets clinicId injected/enforced
        async findMany({ args, query, model }) {
          if (TENANT_MODELS.has(model)) args.where = { ...args.where, clinicId };
          return query(args);
        },
        async findFirst(...) { /* same */ },
        async update({ args, query, model }) {
          if (TENANT_MODELS.has(model)) args.where = { ...args.where, clinicId };
          return query(args);   // turns where:{id} into where:{id, clinicId}
        },
        async updateMany / delete / deleteMany / count / aggregate / groupBy (...) { /* same */ },
        async create({ args, query, model }) {
          if (TENANT_MODELS.has(model)) args.data = { clinicId, ...args.data };
          return query(args);
        },
      },
    },
  });
}
```

This single extension:
- **Eliminates the TOCTOU/IDOR class** — `req.db.appointment.update({ where: { id } })`
  becomes `where: { id, clinicId }` automatically; a wrong-tenant id updates 0 rows.
- **Makes "forgetting clinicId" impossible** for any service that uses `req.db`.
- **Leaves cross-tenant operations explicit** — background crons that must scan all clinics use
  the raw `prisma` client deliberately and per-row re-scope (see §7).

`TENANT_MODELS` = every model with a `clinicId` column. Non-tenant lookups (login by email,
registration, Stripe customer lookup) use the raw client by design.

---

## 4. Middleware Flow

```
Incoming request
   │
   ▼
[1] securityHeaders (helmet) · CORS allowlist · global rate-limit
   │
   ▼
[2] channel detection ──► which resolver applies?
   │      /api/*              → authJwt
   │      /api/whatsapp/...   → whatsappWebhook (HMAC verify first)
   │      /api/billing/webhook→ stripeWebhook (signature verify first)
   │      /api/public/...     → publicClinicParam (clinicId from URL, validated)
   ▼
[3] verifyCredential (per channel): JWT verify / HMAC / Stripe sig / API-key hash
   │   └─ reject DOCTOR tokens on admin API (already implemented)
   ▼
[4] resolveTenant → req.clinic + req.db (tenant-scoped client)   ◄── NEW, single choke point
   │   └─ 401 no tenant · 402 unpaid/suspended · 403 wrong channel
   ▼
[5] requireRole / requirePlan (RBAC + plan gates)
   │
   ▼
[6] route handler  — uses ONLY req.db and req.clinic, never imports prisma directly
   │
   ▼
[7] errorHandler (no stack leak in prod — already implemented) · audit-log writer
```

**Rule enforced by lint/CI (§10):** application route handlers may not `import { prisma }`
directly — they must use `req.db`. Only the tenant engine, auth/registration, and background
workers may touch the raw client.

---

## 5. WhatsApp Routing Flow (multi-number, per-clinic)

This is the change that unblocks B1 + B4.

```
Patient sends WhatsApp message
        │
        ▼
Meta Cloud API → POST /api/whatsapp/webhook   (ONE webhook URL for the whole platform)
        │
        ▼
[1] Verify X-Hub-Signature-256 HMAC  (per-channel app secret)   ── already implemented, make per-clinic
        │
        ▼
[2] Extract value.metadata.phone_number_id   ◄── the routing key (today: IGNORED)
        │
        ▼
[3] channel = WhatsAppChannel.findUnique({ phoneNumberId })      ── replaces WHATSAPP_CLINIC_ID env
        │        └─ not found → log + 200 (never 500; Meta retries on non-200)
        ▼
[4] req.clinic = tenant(channel.clinicId)   → loads THIS clinic's doctors/settings/token
        │
        ▼
[5] dedup by message id · serialize per (clinicId, phone)        ── already implemented, add clinicId to key
        │
        ▼
[6] session = WhatsAppSession.findUnique({ clinicId_phone })     ── re-keyed (B2 fix)
        │
        ▼
[7] AI UNDERSTANDING (optional, advisory)  → { intent, speciality, doctor, date, time, lang, confidence }
        │
        ▼
[8] FSM (handleWhatsAppMessage)  — loads THIS clinic's doctors/slots ONLY (already clinic-scoped)
        │        owns booking / cancel / reschedule / waitlist / confirm
        ▼
[9] Outbound reply  → send via channel.accessToken + channel.phoneNumberId   ── per-clinic creds
        │        (24h window checked against THIS clinic's WhatsAppConversation row)
        ▼
   WhatsAppLog (clinicId) · WhatsAppAudit (clinicId)
```

**What stays the same (already correct):** the FSM already loads doctors/slots/appointments
scoped to the passed `clinicId`; the AI is already *not* in the control loop on the patient
path; the single-reply / idempotency / per-sender serialization guarantees are preserved (we
just widen the dedup/queue key to include `clinicId`).

**What changes:** clinic is resolved from `phone_number_id` (not env); credentials come from
`WhatsAppChannel` (not env); send path takes the channel's token; session/window tables are
re-keyed per clinic.

---

## 6. AI Architecture (advise-only)

The product rule: **AI never executes. AI only understands.** The codebase already honors this
on the *patient WhatsApp* path; the work is to make it a structural guarantee everywhere.

```
              ┌──────────────────────────────────────────────┐
   message →  │  AI Understanding Service                     │
              │  INPUT:  patient text/voice transcript, lang   │
              │  OUTPUT (structured, validated by schema):     │
              │    { intent: BOOK|CANCEL|RESCHEDULE|WAITLIST|  │
              │             FAQ|HANDOFF|CHITCHAT,              │
              │      speciality?, doctorName?, date?, time?,   │
              │      language, confidence: 0..1 }              │
              │  SIDE EFFECTS: none. No DB writes. No tools     │
              │  that mutate. FAQ answers + handoff only.       │
              └───────────────────────┬──────────────────────┘
                                      │ structured intent
                                      ▼
              ┌──────────────────────────────────────────────┐
   if confidence < settings.aiConfidenceMin → FSM asks to clarify / offers human.
   else → FSM consumes the slots as HINTS and drives the transition itself.
              └──────────────────────────────────────────────┘
```

**Responsibility split (enforced):**

| AI (understanding) | FSM / Services (action) |
|--------------------|-------------------------|
| Detect intent | Create / cancel / reschedule appointment |
| Extract speciality / doctor / date / time | Add to / roll waitlist |
| Detect language | Hold / offer / claim slots |
| Confidence score | Send confirmations & reminders |
| Answer FAQs | Mark completion / no-show |
| Decide human handoff | All DB writes |

**One required change for STEP 4 compliance:** the **dashboard staff AI** currently has
mutating tools (`create_appointment`, `create_doctor`, `create_patient`, `cancel_appointment`,
`add_to_waitlist`) that call the services directly. These are correctly *clinic-scoped*, but
they violate "AI must never execute." Decision for approval (see §11 / open questions): either
(a) keep staff-side write tools but route every one through the same FSM/validation entrypoints
with an explicit human-confirm step, or (b) downgrade the staff AI to advise-only + propose
actions the admin clicks to confirm. Recommended: **(a)** — staff is authenticated and the
writes are already validated; require a confirmation echo for destructive ops. The *patient*
path remains strictly advise-only (already the case).

---

## 7. FSM Architecture

Booking remains a deterministic finite state machine, one `WhatsAppSession` row per
`(clinicId, phone)`. The LLM is never in the control loop.

```
            IDLE
              │  (intent=BOOK)
              ▼
   SPECIALITY_SELECTION ──► DOCTOR_SELECTION ──► SLOT_SELECTION ──► CONFIRMATION ──► BOOKED
        ▲          │              │                    │                │
        │          │ (no slots)   │                    │ (decline)      │ (createAppointment, notify:false)
        │          ▼              ▼                    ▼                ▼
        └──── WAITLIST_JOIN   (paginate slots)     back/cancel       COMPLETION / REMINDERS
   parallel flows: CANCEL · RESCHEDULE · WAITLIST_OFFER→CLAIM/DECLINE/ROLL
```

**Tenancy guarantees inside the FSM (mostly already true):**
- Doctors, specialities, slots, appointments are loaded with `clinicId` in the where clause.
- Slot uniqueness is enforced by the partial unique index on `(clinicId, doctorId, date, time)`.
- Waitlist auto-offer candidate search is already scoped to the freed slot's `clinicId` (verified — a freed slot in clinic A can never be offered to clinic B).
- **Fix:** writes that currently use `where:{ id }` after an ownership read move to the
  tenant-scoped client so the `clinicId` is enforced at the write (closes the TOCTOU window).

---

## 8. Multi-Tenant Security Model

**Defense in depth — four layers:**

```
L1 Authentication   JWT (clinicId+userId+role) · WhatsApp HMAC · Stripe sig · API-key hash
                    └─ DOCTOR tokens already rejected on admin API
L2 Tenant binding   req.clinic resolved ONCE; handlers never read clinicId from body/params/env
L3 Query scoping    tenant-scoped Prisma client injects clinicId into EVERY tenant-model query
                    └─ write path: where:{id} → where:{id, clinicId} (0 rows on wrong tenant)
L4 Database (opt.)  Postgres RLS policy USING (clinic_id = current_setting('app.clinic_id'))
                    └─ hard backstop even if app code regresses
```

**RBAC matrix (per clinic):**

| Role | Patients | Doctors | Appointments | Waitlist | Billing | Settings | Users |
|------|----------|---------|--------------|----------|---------|----------|-------|
| CLINIC_ADMIN | RW | RW | RW | RW | RW | RW | RW |
| STAFF | RW | R | RW | RW | – | – | – |
| (ADMIN = platform) | platform-ops only, never a clinic data path |

**Cross-tenant test obligations (STEP 9):** for every endpoint, an automated test mints a JWT
for clinic A and asserts it gets 404/empty (never another clinic's row) for clinic B's ids —
dashboard, REST, search, export, update, delete, analytics, waitlist, reminders, WhatsApp,
voice, AI. This becomes a CI gate.

---

## 9. Deployment Architecture

```
   Vercel  ─ frontend SPA (clinic dashboard), per-clinic subdomain (future)
   Railway ─ backend (stateless, autoscale N replicas behind LB) + cron workers
   Supabase─ Postgres (pooled DATABASE_URL for app, DIRECT_URL for migrations) + storage
   Cloudflare ─ DNS, TLS, WAF, rate limit in front of both
   Meta Cloud API ─ ONE webhook URL → routed per clinic by phone_number_id
   Stripe ─ ONE webhook URL → routed per clinic by customer/metadata
```

**No code change when a clinic signs up.** New clinic = new rows (`Clinic`, `ClinicSettings`,
`WhatsAppChannel`, `Subscription`), never an env edit or redeploy. The single backend serves all
tenants; horizontal scale is adding replicas (state is already in the DB).

**Stateful caveat to fix for multi-replica:** the WhatsApp dedup `Set` and per-sender queue are
currently *in-process* (correct only for a single instance — the code says so). For >1 replica,
move dedup + per-`(clinicId,phone)` locking to Redis or a DB advisory lock.

---

## 10. Performance & Scale Plan

Target: 1,000 clinics · 10,000 doctors · 500,000 patients · millions of messages.

**Indexes (add to existing).** Existing per-clinic single-column indexes are fine for filtering
but composite indexes matching real query shapes matter at 500k patients:

| Table | Add index | Serves |
|-------|-----------|--------|
| Appointment | `(clinicId, doctorId, appointmentDate)` | slot generation, doctor day view |
| Appointment | `(clinicId, patientId, status)` | "my active appointments" |
| Appointment | `(clinicId, status, appointmentDate)` | dashboard lists, reminder scans |
| Patient | `(clinicId, phone)` ✓ exists · add `(clinicId, name)` | search |
| Waitlist | `(clinicId, status, priority)` ✓ exists | auto-offer ordering |
| **WhatsAppChannel** | `(phoneNumberId)` unique | **inbound routing — hottest lookup** |
| **WhatsAppSession** | `(clinicId, phone)` unique | session load |
| Reminder | add `clinicId` + `(clinicId, sent, type)` | per-tenant reminder scan |

**N+1 / hot paths:**
- Inbound WhatsApp resolution today does up to two `findMany` over *all* clinic patients for
  phone normalization — fine at small scale, but at 500k patients add a normalized
  `phoneNational` column with `(clinicId, phoneNational)` index and look up directly.
- Reminder cron scans all CONFIRMED appointments in a window (correct as an all-tenant job);
  ensure it's driven by the `(clinicId, status, appointmentDate)` index and batched.
- Tenant + channel objects are cached in-process with short TTL to avoid a DB hit per request.

**Connection pooling:** already on Supabase transaction-mode pooler (`pgbouncer=true`) — keep
Prisma connection limits modest per replica and rely on the pooler.

---

## 11. P0 / P1 Architecture Problems (audit findings)

Grounded in the code audit. Severity reflects *exploitability/impact for multi-tenant*, with
honest notes where a sub-finding is fragility rather than a live leak.

### P0 — block 1000 clinics or allow cross-tenant impact

| ID | Finding | Location | Impact |
|----|---------|----------|--------|
| **P0-1** | **WhatsApp single-tenant.** Global `WHATSAPP_TOKEN`/`PHONE_NUMBER_ID`; inbound bound to one clinic via `WHATSAPP_CLINIC_ID` env; `phone_number_id` ignored. | `config/env.ts:33-45`, `whatsapp.inbound.ts:67-135`, `config/whatsapp.ts:14-28` | A 2nd clinic cannot receive bookings. Onboarding needs env edit + redeploy. |
| **P0-2** | **Phone-keyed session tables collide across clinics.** `WhatsAppSession.phone @unique`, `WhatsAppConversation.phone @unique`. | `schema.prisma:353-382`, `whatsapp.booking.ts:384,397`, `whatsapp.service.ts:379,396` | Same patient phone → two clinics share/overwrite FSM state and the 24h send-window. |
| **P0-3** | **No tenant engine.** `clinicId` hand-threaded; writes use `where:{ id }` after a separate ownership read (TOCTOU; one missed scope = leak). | pervasive; e.g. `appointment.service.ts:368,443,530`, `patient.service.ts:297,320`, `doctor.service.ts:46,60,133`, `waitlist.service.ts` (many) | Live exploit risk is low *where* the read-check precedes the write, but it's a fragility/IDOR class that doesn't scale to audit by hand. |
| **P0-4** | **No automated onboarding.** Going live = manual env + template registration + redeploy. | ops / `env.ts` | Self-serve signup impossible; growth gated on manual ops. |

> **Honest note on P0-3:** the sub-audit flagged ~20 `update/delete where:{id}` sites as "P0
> leaks." Most are preceded by a `findFirst({ where:{ id, clinicId } })` that throws on a
> wrong tenant, so they are **not currently exploitable IDOR** — they are TOCTOU windows and a
> latent footgun. The tenant-scoped client (§3) closes the entire class in one change, which is
> why it's P0 as *architecture* even though individual sites are mostly guarded today.

### P1 — correctness / hardening

| ID | Finding | Location |
|----|---------|----------|
| P1-1 | Staff dashboard AI has mutating tools (violates "AI never executes"). Clinic-scoped, but should route through FSM + confirm. | `ai.service.ts` tool handlers |
| P1-2 | `WhatsAppLog` status update by `waMessageId` only (no clinicId). Low risk (wamid is globally unique) but unscoped. | `whatsapp.service.ts:410` |
| P1-3 | Per-clinic config lives in **global env flags** (`WA_AI_RECEPTIONIST`, `WA_INTERACTIVE`, `WA_VOICE_*`, confidence, timezone, buffers). Can't differ per clinic. | `env.ts:53-78` → move to `ClinicSettings` |
| P1-4 | In-process dedup `Set` + queue blocks horizontal scaling. | `whatsapp.inbound.ts:42-54` |

### P2 — defense-in-depth (not exploitable today)

| ID | Finding | Location |
|----|---------|----------|
| P2-1 | `DoctorLeave` queries omit `clinicId` (`{ doctorId, … }`). Safe because doctorId is per-clinic, but not defense-in-depth. | `scheduling.service.ts:152,203` |
| P2-2 | Stripe `customer.subscription.*` webhook looks up clinic by `stripeCustomerId` with `findFirst` (no clinicId). Safe *because* `stripeCustomerId` is `@unique`; keep the unique constraint. | `billing.service.ts:118` |
| P2-3 | Public endpoints take `clinicId` from URL and rely on FK constraints rather than an explicit existence/active check. | `patients/public.controller.ts` |

### Already correct (do not "fix")
- Schema is clinic-scoped on every business table; JWT carries `clinicId`.
- Dashboard/REST handlers consistently use `req.user.clinicId`.
- Analytics, notifications, clinics, auth queries are properly scoped.
- AI tool layer delegates to validated, clinic-scoped services (patient path is advise-only).
- Waitlist auto-offer is correctly clinic-scoped (no cross-tenant offer possible).
- Slot uniqueness partial index includes `clinicId`.
- Security baseline: JWT-placeholder boot refusal, prod CORS guard, webhook HMAC, no prod stack leak, doctor-token rejection on admin API.

---

## 12. Refactoring Roadmap (sequenced so the live booking line never breaks)

Each phase is shippable and independently valuable. WhatsApp changes are gated behind the
existing single-tenant path until per-clinic routing is proven.

**Phase 0 — Safety net** — 🟢 PARTIAL
- ✅ Vitest added (`backend` `npm test`) with a 19-case suite for the pure scoping rule (`config/tenantScope.test.ts`) — verifies clinicId injection on every op, non-mutation of caller args, cross-tenant isolation, and that non-tenant models (Clinic/Reminder/AiMessage/WhatsAppSession) are left unscoped.
- ⏭️ Still to add: DB-backed cross-tenant integration tests (clinic A token vs clinic B ids) — needs a disposable test DB. The `import { prisma }`-in-handlers lint rule needs ESLint.

**Phase 1 — Tenant Engine (kills P0-3)** — 🟢 COMPLETE (engine + all modules)
- ✅ `forClinic()` tenant-scoped Prisma extension. The scoping RULE lives in a pure, dependency-free `config/tenantScope.ts` (`scopeArgs`) wired into the extension by `config/tenantPrisma.ts`; `resolveTenant` middleware (`middleware/tenant.ts`) → `req.clinic`, `req.db`. Express types extended.
- ✅ **Every module migrated** to the tenant-scoped client (`req.db` / `forClinic(clinicId)`): doctors, patients, appointments, WhatsApp booking (FSM), AI receptionist (staff + patient agents), scheduling, waitlist, notifications, analytics, plus inbound patient onboarding. No application module issues an unscoped tenant-model query anymore.
- ✅ **Write-hole hardening:** every `update/delete` that used `where:{ id }` is compound `where:{ id, clinicId }` AND routed through the scoped client (defence in depth).
- ✅ **P2-1 fixed for free:** scheduling's `DoctorLeave` lookups are now clinic-scoped (a doctor's leave at clinic A can't affect clinic B availability).
- ✅ `tsc --noEmit` clean; `npm test` 19/19 green.

**Documented raw-prisma exceptions (by design — verified in the audit):**
- **Cross-tenant cron scans:** `reminder.service` (CONFIRMED appts across all clinics) and `waitlist.service.expireStaleOffers` (expired offers across all clinics) — each re-scopes per row via the row's own `clinicId`.
- **Non-tenant / pre-tenant ops:** `auth.service` (identity by globally-unique email/userId), `clinic.service` + registration, `billing.service` (the `Clinic` ROW + Stripe webhook keyed by the UNIQUE `stripeCustomerId`).
- **Non-tenant child tables:** `Reminder` and `AiMessage` (no `clinicId`; owned via a clinic-scoped parent), WhatsApp logging/audit/diagnostics.
- **`WhatsAppSession` / `WhatsAppConversation`:** still phone-keyed; left on raw prisma until the **Phase 2** `(clinicId, phone)` re-key (excluded from `TENANT_MODELS`).
- **`doctor-portal`:** parked/unmounted (not in the route table) — intentionally not migrated.

**Phase 2 — Schema for multi-tenant WhatsApp + settings (prep for P0-1/P0-2/P1-3)**
- Add `WhatsAppChannel`, `ClinicSettings`, `Subscription`, `AuditLog`.
- Re-key `WhatsAppSession` / `WhatsAppConversation` to `(clinicId, phone)`; add `clinicId` to `Reminder`.
- Add composite indexes (§10). Apply via `prisma db push` + the partial-index script (per project convention).
- Backfill: existing rows → the current single clinic; create its `WhatsAppChannel` from current env.

**Phase 3 — Per-clinic WhatsApp routing (kills P0-1/P0-2)**
- Webhook resolves clinic by `phone_number_id` → `WhatsAppChannel`; outbound uses per-clinic creds.
- Widen dedup/queue key to `(clinicId, phone)`; load session by `(clinicId, phone)`.
- Keep env fallback for the current clinic until a second clinic is live, then remove `WHATSAPP_CLINIC_ID`.

**Phase 4 — Move global flags to `ClinicSettings` (P1-3)** — timezone, buffers, slot length, AI flags, confidence, voice settings become per-clinic.

**Phase 5 — Automated onboarding (kills P0-4)**
- Signup → email verify → Stripe subscription → create Clinic + admin User + default ClinicSettings → setup wizard (add doctors, schedules) → "Connect WhatsApp."

**Phase 6 — Meta Embedded Signup (STEP 8)** — "Connect WhatsApp" runs Embedded Signup; store Business ID / WABA ID / phoneNumberId / permanent token into `WhatsAppChannel` automatically; auto-subscribe the webhook.

**Phase 7 — AI guardrail (P1-1)** — staff AI mutations routed through FSM/confirm; patient path stays advise-only. Formalize the understanding-service output schema.

**Phase 8 — Scale hardening** — Redis dedup/locks (P1-4), normalized `phoneNational` column, optional Postgres RLS backstop (L4), load test to target volumes.

---

## Approved decisions (2026-06-26)

1. **Staff AI writes (§6 / P1-1):** ✅ **Keep mutating tools, add an explicit confirm step.** Staff are authenticated and writes are already clinic-scoped; destructive ops require a confirmation echo. Patient path stays strictly advise-only.
2. **DB isolation (L3/L4):** ✅ **Tenant-scoped Prisma client now; Postgres RLS deferred to Phase 8** as a backstop.
3. **Next step:** ✅ **Begin Phase 0 (safety net) + Phase 1 (tenant engine).** No WhatsApp/schema changes until those land.

### Still open (decide before the phase that needs them)
- **Token storage (Phase 3):** encrypt per-clinic WhatsApp tokens at rest in `WhatsAppChannel` — confirm KMS/secret for the encryption key.
- **Onboarding gating (Phase 5):** Stripe subscription required before go-live, or trial-with-limits?
- **Subdomain-per-clinic:** in scope or deferred?
```
