# Migration: WhatsApp multi-tenant re-key (2026-06-26)

Production-safe migration for the multi-tenant WhatsApp engine. Replaces an
**unsafe** `prisma db push`, which would try to run:

```sql
ALTER TABLE "WhatsAppConversation" ADD COLUMN "clinicId" TEXT NOT NULL;  -- ❌ fails on existing rows
```

and would `DROP INDEX` the old unique keys with `--accept-data-loss`. Instead we
apply an **idempotent, transactional** raw-SQL script that adds the column
nullable, backfills it, then enforces `NOT NULL` and rebuilds the unique indexes.

Run everything from `backend/`:

```bash
npx tsx scripts/migrateWhatsAppMultiTenant.ts --check      # dry-run, read-only
npx tsx scripts/migrateWhatsAppMultiTenant.ts              # apply (transactional)
npx tsx scripts/migrateWhatsAppMultiTenant.ts --rollback   # reverse (guarded)
```

---

## 1. What changes

| Object | Before | After |
| --- | --- | --- |
| `WhatsAppChannel` | — (new) | new table: per-clinic number + encrypted token, FK → `Clinic` (cascade) |
| `WhatsAppConversation.clinicId` | absent | `TEXT NOT NULL` (backfilled) |
| `WhatsAppConversation` unique | `…_phone_key` on `(phone)` | `…_clinicId_phone_key` on `(clinicId, phone)` |
| `WhatsAppConversation` index | `…_phone_idx` on `(phone)` | `…_clinicId_phone_idx` on `(clinicId, phone)` |
| `WhatsAppSession` unique | `…_phone_key` on `(phone)` | `…_clinicId_phone_key` on `(clinicId, phone)` |
| `WhatsAppSession` indexes | `…_phone_idx`, `…_clinicId_idx` | unchanged (both kept) |

`WhatsAppSession.clinicId` **already exists and is NOT NULL** — only its unique
key swaps. No backfill needed there. All real risk is in `WhatsAppConversation`.

Prisma implements every `@unique`/`@@unique` as a `UNIQUE INDEX` (not a table
constraint), so each can be dropped/created with `DROP INDEX` / `CREATE UNIQUE
INDEX` — no `ALTER TABLE … DROP CONSTRAINT` needed.

---

## 2. Backfill rule (and why it is correct)

> **Every existing `WhatsAppConversation` row is backfilled to the env default
> clinic (`WHATSAPP_CLINIC_ID`).**

`WhatsAppConversation` records the 24-hour WhatsApp session window: "did this
number message **our** number within 24h". Until this release the platform had a
**single** WhatsApp number (the env default channel), so *every* historical
window belongs to the clinic that owns that number — `WHATSAPP_CLINIC_ID`.

We deliberately do **not** map by the patient's clinic. A `Patient` row under
clinic B does not mean the window was opened on clinic B's number — there was
only one number. Mapping by patient would mis-attribute windows. Env clinic is
the only correct source.

- If `WHATSAPP_CLINIC_ID` is unset **and** rows exist → the script **blocks**
  (it will not guess). Pass `--clinic-id=<id>` to override explicitly.
- If there are **zero** rows → no backfill; the column flips to `NOT NULL`
  trivially.

The 24h window is soft state (re-opened by the patient's next inbound), so even
a mis-backfilled row self-heals on the next message — but env clinic is exact, so
there is nothing to heal.

---

## 3. Migration steps (what the script does, in one transaction)

PostgreSQL DDL is transactional — any failure rolls the **whole** migration back.

1. **`WhatsAppChannel`** (purely additive, zero risk): `CREATE TABLE IF NOT
   EXISTS`, its unique + two indexes, and the `Clinic` FK (cascade).
2. **`WhatsAppConversation.clinicId`**:
   1. `ADD COLUMN clinicId TEXT` — **nullable** (succeeds on existing rows).
   2. `UPDATE … SET clinicId = <backfill> WHERE clinicId IS NULL`.
   3. **Guard**: `COUNT(*) WHERE clinicId IS NULL` must be `0`, else abort.
   4. **Guard**: no duplicate `(clinicId, phone)` (cannot happen — `phone` was
      globally unique — but verified before creating the unique index).
   5. `ALTER COLUMN clinicId SET NOT NULL`.
   6. `DROP INDEX` old `…_phone_key` + `…_phone_idx`; `CREATE` new
      `…_clinicId_phone_key` (unique) + `…_clinicId_phone_idx`.
3. **`WhatsAppSession`**: duplicate guard on `(clinicId, phone)`, then `DROP
   INDEX …_phone_key`, `CREATE UNIQUE INDEX …_clinicId_phone_key`. The `phone`
   and `clinicId` plain indexes are kept.

Every statement is `IF EXISTS` / `IF NOT EXISTS` guarded, so the script is
**idempotent** — re-running after a partial run (or after success) is a no-op.

---

## 4. Dry-run validation (`--check`)

Read-only. Connects, inspects, reports, writes **nothing**. Verifies:

- Current state of every index/column (what is already done vs pending).
- `WhatsAppConversation` total rows and rows with `NULL` clinicId.
- `WHATSAPP_CLINIC_ID` is set and resolves to a real clinic.
- Backfill preview: N rows → `<clinicId>`.
- No `(clinicId, phone)` duplicates would result, for both tables.
- Final verdict: **SAFE TO APPLY** or **BLOCKED** (with reasons).

Run `--check` against production first. Only apply when it prints SAFE.

---

## 5. Rollback (`--rollback`)

Reverses to the pre-migration shape, **guarded**:

1. `WhatsAppConversation`: drop the `(clinicId, phone)` unique + index. Before
   restoring the old `(phone)` unique, **check for duplicate phones** — if
   multi-tenant data has accumulated two clinics sharing a phone, rollback
   **aborts** (the single-tenant unique can no longer hold). Then drop the
   `clinicId` column (removes only derived data).
2. `WhatsAppSession`: same guard, swap the unique back to `(phone)`.
3. `WhatsAppChannel`: dropped **only if empty**; if channels were onboarded,
   the script refuses unless `--force` (prevents silent loss of real channels).

Rollback is safe **immediately** after migration. Once secondary clinics start
messaging (duplicate phones) or channels are onboarded, rollback is intentionally
blocked to prevent data loss — restore from backup instead.

---

## 6. Production migration checklist

**Before**
- [ ] Take a fresh database backup / snapshot (Railway/Neon point-in-time).
- [ ] Confirm `WHATSAPP_CLINIC_ID` is set in the production env and matches the
      live clinic (memory: `cmqkubvis…`, not the dead `cmqg6wc79…`).
- [ ] Confirm `WA_CHANNEL_ENC_KEY` is set in production (so onboarded tokens are
      encrypted at rest). Optional but strongly recommended before onboarding.
- [ ] Deploy the new application code **but** keep it compatible: the running
      build already tolerates the absence of channel rows (env-default fallback),
      so code can ship before/with the migration.
- [ ] `npx tsx scripts/migrateWhatsAppMultiTenant.ts --check` → prints **SAFE**.

**Apply**
- [ ] `npx tsx scripts/migrateWhatsAppMultiTenant.ts` → completes, prints the
      post-migration index inventory.
- [ ] `npx prisma db push` → prints **"already in sync"** (proves the DB now
      exactly matches `schema.prisma`; this is a no-op verification, not a change).
- [ ] `npx prisma generate` (if not already current).

**Verify**
- [ ] Send a WhatsApp message to the env number → booking FSM replies (session +
      window now keyed on `(clinicId, phone)`).
- [ ] Send a voice note → transcribes and replies (per-clinic token path).
- [ ] `SELECT count(*) FROM "WhatsAppConversation" WHERE "clinicId" IS NULL;` → `0`.

**Rollback trigger**
- [ ] If verification fails and no secondary clinic has messaged yet:
      `npx tsx scripts/migrateWhatsAppMultiTenant.ts --rollback`, redeploy prior
      build. Otherwise restore from the pre-migration backup.

---

## 7. Zero-data-loss guarantees

- The `WhatsAppConversation` table is **never dropped or recreated** — only a
  column is added and indexes are swapped. Existing rows are preserved verbatim.
- `clinicId` is added **nullable then backfilled** — no row is rejected.
- `NOT NULL` is only enforced **after** the null-count guard passes (== 0).
- The whole apply runs in **one transaction**: partial failure leaves the DB
  exactly as before.
- `WhatsAppSession` data is untouched (only an index swap).
- `WhatsAppChannel` is additive.

---

## 8. After migration: onboarding `WhatsAppChannel` rows

The migration creates the **empty** `WhatsAppChannel` table. Rows are created by
the self-serve onboarding endpoint (staff-auth, bound to the caller's clinic):

```
POST /api/whatsapp/channel
  { phoneNumberId, wabaId, accessToken, appSecret?, verifyToken?, subscribeWebhook? }
GET  /api/whatsapp/channel        # current clinic's channel status (no token)
```

`POST` validates the credentials against Meta (the `phoneNumberId` + token must
resolve), validates/auto-subscribes the WABA webhook, **encrypts** the token
(`WA_CHANNEL_ENC_KEY`), and rejects a number already claimed by another clinic.
Until a clinic onboards a channel it keeps using the env default channel
(`PHONE_NUMBER_ID` / `WHATSAPP_TOKEN` → `WHATSAPP_CLINIC_ID`), so nothing breaks
pre-onboarding. See `whatsapp.onboarding.ts`.
