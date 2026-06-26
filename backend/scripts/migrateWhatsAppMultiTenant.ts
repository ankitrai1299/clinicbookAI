// Production-safe migration for the multi-tenant WhatsApp engine.
//
// Replaces an UNSAFE `prisma db push`, which would emit
//   ALTER TABLE "WhatsAppConversation" ADD COLUMN "clinicId" TEXT NOT NULL;
// (fails on existing rows) and DROP the old unique indexes with --accept-data-
// loss. This script instead adds clinicId NULLABLE, backfills it to the env
// default clinic, then enforces NOT NULL and rebuilds the unique indexes — all in
// ONE transaction (Postgres DDL is transactional, so any failure rolls back).
//
// Idempotent: every step is IF [NOT] EXISTS guarded, so re-running after a
// partial run or after success is a no-op.
//
//   npx tsx scripts/migrateWhatsAppMultiTenant.ts --check      # dry-run, read-only
//   npx tsx scripts/migrateWhatsAppMultiTenant.ts              # apply
//   npx tsx scripts/migrateWhatsAppMultiTenant.ts --rollback   # reverse (guarded)
//   npx tsx scripts/migrateWhatsAppMultiTenant.ts --clinic-id=<id>   # override backfill clinic
//
// See docs/migrations/2026-06-26-whatsapp-multitenant.md for the full plan.
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const CHECK = args.includes('--check') || args.includes('--dry-run');
const ROLLBACK = args.includes('--rollback');
const FORCE = args.includes('--force');
const clinicArg = args.find((a) => a.startsWith('--clinic-id='))?.split('=')[1];

// ---- introspection helpers (read-only) -----------------------------------
const q = <T = unknown>(sql: string, ...params: unknown[]) =>
  prisma.$queryRawUnsafe<T[]>(sql, ...params);

const tableExists = async (table: string): Promise<boolean> =>
  (
    await q<{ one: number }>(
      `SELECT 1 AS one FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      table
    )
  ).length > 0;

const columnExists = async (table: string, column: string): Promise<boolean> =>
  (
    await q<{ one: number }>(
      `SELECT 1 AS one FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      table,
      column
    )
  ).length > 0;

const columnIsNotNull = async (table: string, column: string): Promise<boolean> => {
  const rows = await q<{ is_nullable: string }>(
    `SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    table,
    column
  );
  return rows[0]?.is_nullable === 'NO';
};

const indexExists = async (name: string): Promise<boolean> =>
  (await q<{ one: number }>(`SELECT 1 AS one FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, name)).length > 0;

const constraintExists = async (name: string): Promise<boolean> =>
  (await q<{ one: number }>(`SELECT 1 AS one FROM pg_constraint WHERE conname=$1`, name)).length > 0;

const countNullClinic = async (): Promise<number> => {
  if (!(await columnExists('WhatsAppConversation', 'clinicId'))) {
    // Column not added yet → every existing row is effectively NULL.
    const rows = await q<{ c: bigint }>(`SELECT COUNT(*)::bigint AS c FROM "WhatsAppConversation"`);
    return Number(rows[0]?.c ?? 0);
  }
  const rows = await q<{ c: bigint }>(
    `SELECT COUNT(*)::bigint AS c FROM "WhatsAppConversation" WHERE "clinicId" IS NULL`
  );
  return Number(rows[0]?.c ?? 0);
};

// Duplicate (clinicId, phone) groups for a table that has both columns.
const dupClinicPhone = async (table: string): Promise<number> => {
  if (!(await columnExists(table, 'clinicId')) || !(await columnExists(table, 'phone'))) return 0;
  const rows = await q<{ c: bigint }>(
    `SELECT COUNT(*)::bigint AS c FROM (
       SELECT 1 FROM "${table}" WHERE "clinicId" IS NOT NULL
       GROUP BY "clinicId", "phone" HAVING COUNT(*) > 1
     ) d`
  );
  return Number(rows[0]?.c ?? 0);
};

const dupPhone = async (table: string): Promise<number> => {
  const rows = await q<{ c: bigint }>(
    `SELECT COUNT(*)::bigint AS c FROM (
       SELECT 1 FROM "${table}" GROUP BY "phone" HAVING COUNT(*) > 1
     ) d`
  );
  return Number(rows[0]?.c ?? 0);
};

// Resolve the clinic id used to backfill WhatsAppConversation rows.
const resolveBackfillClinicId = async (): Promise<{ id: string | null; reason: string }> => {
  const id = clinicArg || process.env.WHATSAPP_CLINIC_ID || null;
  if (!id) return { id: null, reason: 'WHATSAPP_CLINIC_ID is not set and no --clinic-id given' };
  const exists = await q<{ one: number }>(`SELECT 1 AS one FROM "Clinic" WHERE id=$1`, id);
  if (exists.length === 0) return { id: null, reason: `clinic ${id} does not exist` };
  return { id, reason: clinicArg ? '--clinic-id override' : 'WHATSAPP_CLINIC_ID' };
};

const printInventory = async (): Promise<void> => {
  const items: Array<[string, boolean]> = [
    ['table WhatsAppChannel', await tableExists('WhatsAppChannel')],
    ['  fk   WhatsAppChannel_clinicId_fkey', await constraintExists('WhatsAppChannel_clinicId_fkey')],
    ['  uniq WhatsAppChannel_phoneNumberId_key', await indexExists('WhatsAppChannel_phoneNumberId_key')],
    ['col  WhatsAppConversation.clinicId', await columnExists('WhatsAppConversation', 'clinicId')],
    ['  NOT NULL', await columnIsNotNull('WhatsAppConversation', 'clinicId')],
    ['uniq WhatsAppConversation_clinicId_phone_key', await indexExists('WhatsAppConversation_clinicId_phone_key')],
    ['idx  WhatsAppConversation_clinicId_phone_idx', await indexExists('WhatsAppConversation_clinicId_phone_idx')],
    ['(gone) WhatsAppConversation_phone_key', !(await indexExists('WhatsAppConversation_phone_key'))],
    ['uniq WhatsAppSession_clinicId_phone_key', await indexExists('WhatsAppSession_clinicId_phone_key')],
    ['(gone) WhatsAppSession_phone_key', !(await indexExists('WhatsAppSession_phone_key'))]
  ];
  console.log('\n  Post-state inventory (✓ = in target state):');
  for (const [label, ok] of items) console.log(`    ${ok ? '✓' : '✗'} ${label}`);
};

// ===========================================================================
// DRY RUN
// ===========================================================================
const runCheck = async (): Promise<void> => {
  console.log('=== WhatsApp multi-tenant migration — DRY RUN (read-only) ===\n');

  const total = await (async () =>
    Number((await q<{ c: bigint }>(`SELECT COUNT(*)::bigint AS c FROM "WhatsAppConversation"`))[0]?.c ?? 0))();
  const nullClinic = await countNullClinic();
  const backfill = await resolveBackfillClinicId();
  const convDupes = await dupClinicPhone('WhatsAppConversation');
  const sessDupes = await dupClinicPhone('WhatsAppSession');

  console.log(`  WhatsAppConversation rows:            ${total}`);
  console.log(`  …rows needing clinicId backfill:      ${nullClinic}`);
  console.log(`  backfill clinic:                      ${backfill.id ?? '(none)'} (${backfill.reason})`);
  console.log(`  WhatsAppConversation (clinicId,phone) dupes: ${convDupes}`);
  console.log(`  WhatsAppSession      (clinicId,phone) dupes: ${sessDupes}`);

  await printInventory();

  const blockers: string[] = [];
  if (nullClinic > 0 && !backfill.id) blockers.push(`cannot backfill ${nullClinic} row(s): ${backfill.reason}`);
  if (convDupes > 0) blockers.push(`${convDupes} duplicate (clinicId,phone) group(s) in WhatsAppConversation`);
  if (sessDupes > 0) blockers.push(`${sessDupes} duplicate (clinicId,phone) group(s) in WhatsAppSession`);

  console.log('');
  if (blockers.length) {
    console.log('  VERDICT: ❌ BLOCKED');
    for (const b of blockers) console.log(`    - ${b}`);
    process.exitCode = 1;
  } else {
    console.log(`  VERDICT: ✅ SAFE TO APPLY${nullClinic > 0 ? ` (${nullClinic} row(s) → ${backfill.id})` : ''}`);
  }
};

// ===========================================================================
// APPLY  (one transaction)
// ===========================================================================
const runApply = async (): Promise<void> => {
  console.log('=== WhatsApp multi-tenant migration — APPLY ===\n');
  const backfill = await resolveBackfillClinicId();
  const nullClinic = await countNullClinic();
  if (nullClinic > 0 && !backfill.id) {
    throw new Error(`Refusing to apply: cannot backfill ${nullClinic} WhatsAppConversation row(s) — ${backfill.reason}`);
  }

  await prisma.$transaction(
    async (tx) => {
      const exec = (sql: string) => tx.$executeRawUnsafe(sql);

      // 1) WhatsAppChannel — additive.
      await exec(`CREATE TABLE IF NOT EXISTS "WhatsAppChannel" (
        "id" TEXT NOT NULL,
        "clinicId" TEXT NOT NULL,
        "phoneNumberId" TEXT NOT NULL,
        "wabaId" TEXT,
        "displayPhoneNumber" TEXT,
        "accessToken" TEXT NOT NULL,
        "appSecret" TEXT,
        "verifyToken" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "WhatsAppChannel_pkey" PRIMARY KEY ("id")
      )`);
      await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppChannel_phoneNumberId_key" ON "WhatsAppChannel"("phoneNumberId")`);
      await exec(`CREATE INDEX IF NOT EXISTS "WhatsAppChannel_clinicId_idx" ON "WhatsAppChannel"("clinicId")`);
      await exec(`CREATE INDEX IF NOT EXISTS "WhatsAppChannel_phoneNumberId_idx" ON "WhatsAppChannel"("phoneNumberId")`);
      if (!(await constraintExists('WhatsAppChannel_clinicId_fkey'))) {
        await exec(`ALTER TABLE "WhatsAppChannel"
          ADD CONSTRAINT "WhatsAppChannel_clinicId_fkey"
          FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
      }
      console.log('  ✓ WhatsAppChannel table + indexes + FK');

      // 2) WhatsAppConversation.clinicId — add nullable, backfill, enforce.
      if (!(await columnExists('WhatsAppConversation', 'clinicId'))) {
        await exec(`ALTER TABLE "WhatsAppConversation" ADD COLUMN "clinicId" TEXT`); // nullable
        console.log('  ✓ added WhatsAppConversation.clinicId (nullable)');
      }
      if (backfill.id) {
        const updated = await exec(
          `UPDATE "WhatsAppConversation" SET "clinicId" = '${backfill.id}' WHERE "clinicId" IS NULL`
        );
        console.log(`  ✓ backfilled ${updated} row(s) → ${backfill.id}`);
      }
      const stillNull = (
        await tx.$queryRawUnsafe<{ c: bigint }[]>(
          `SELECT COUNT(*)::bigint AS c FROM "WhatsAppConversation" WHERE "clinicId" IS NULL`
        )
      )[0];
      if (Number(stillNull?.c ?? 0) > 0) {
        throw new Error(`Backfill incomplete: ${stillNull?.c} row(s) still NULL — aborting before NOT NULL`);
      }
      // Duplicate guard before the unique index.
      const cDupes = (
        await tx.$queryRawUnsafe<{ c: bigint }[]>(
          `SELECT COUNT(*)::bigint AS c FROM (SELECT 1 FROM "WhatsAppConversation" GROUP BY "clinicId","phone" HAVING COUNT(*)>1) d`
        )
      )[0];
      if (Number(cDupes?.c ?? 0) > 0) throw new Error(`Duplicate (clinicId,phone) in WhatsAppConversation — aborting`);

      await exec(`ALTER TABLE "WhatsAppConversation" ALTER COLUMN "clinicId" SET NOT NULL`);
      await exec(`DROP INDEX IF EXISTS "WhatsAppConversation_phone_key"`);
      await exec(`DROP INDEX IF EXISTS "WhatsAppConversation_phone_idx"`);
      await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversation_clinicId_phone_key" ON "WhatsAppConversation"("clinicId","phone")`);
      await exec(`CREATE INDEX IF NOT EXISTS "WhatsAppConversation_clinicId_phone_idx" ON "WhatsAppConversation"("clinicId","phone")`);
      console.log('  ✓ WhatsAppConversation NOT NULL + (clinicId,phone) unique/index');

      // 3) WhatsAppSession — clinicId already NOT NULL, just swap the unique.
      const sDupes = (
        await tx.$queryRawUnsafe<{ c: bigint }[]>(
          `SELECT COUNT(*)::bigint AS c FROM (SELECT 1 FROM "WhatsAppSession" GROUP BY "clinicId","phone" HAVING COUNT(*)>1) d`
        )
      )[0];
      if (Number(sDupes?.c ?? 0) > 0) throw new Error(`Duplicate (clinicId,phone) in WhatsAppSession — aborting`);
      await exec(`DROP INDEX IF EXISTS "WhatsAppSession_phone_key"`);
      await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_clinicId_phone_key" ON "WhatsAppSession"("clinicId","phone")`);
      console.log('  ✓ WhatsAppSession (clinicId,phone) unique (phone/clinicId indexes kept)');
    },
    { timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  console.log('\n  Migration applied successfully.');
  await printInventory();
  console.log('\n  Next: `npx prisma db push` should report "already in sync".');
};

// ===========================================================================
// ROLLBACK  (one transaction, guarded)
// ===========================================================================
const runRollback = async (): Promise<void> => {
  console.log('=== WhatsApp multi-tenant migration — ROLLBACK ===\n');

  // Refuse if multi-tenant data would break the restored single-tenant uniques.
  const convPhoneDupes = await dupPhone('WhatsAppConversation');
  const sessPhoneDupes = await dupPhone('WhatsAppSession');
  if (convPhoneDupes > 0 || sessPhoneDupes > 0) {
    throw new Error(
      `Cannot rollback: duplicate phones exist (conversation=${convPhoneDupes}, session=${sessPhoneDupes}). ` +
        `Multi-tenant data has accumulated — restore from backup instead.`
    );
  }
  // Refuse to drop a populated channel table unless --force.
  if (await tableExists('WhatsAppChannel')) {
    const ch = Number(
      (await q<{ c: bigint }>(`SELECT COUNT(*)::bigint AS c FROM "WhatsAppChannel"`))[0]?.c ?? 0
    );
    if (ch > 0 && !FORCE) {
      throw new Error(`Refusing to drop WhatsAppChannel with ${ch} row(s). Re-run with --force to drop onboarded channels.`);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      const exec = (sql: string) => tx.$executeRawUnsafe(sql);

      // WhatsAppConversation → back to (phone) unique, drop clinicId.
      await exec(`DROP INDEX IF EXISTS "WhatsAppConversation_clinicId_phone_key"`);
      await exec(`DROP INDEX IF EXISTS "WhatsAppConversation_clinicId_phone_idx"`);
      await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversation_phone_key" ON "WhatsAppConversation"("phone")`);
      await exec(`CREATE INDEX IF NOT EXISTS "WhatsAppConversation_phone_idx" ON "WhatsAppConversation"("phone")`);
      await exec(`ALTER TABLE "WhatsAppConversation" DROP COLUMN IF EXISTS "clinicId"`);
      console.log('  ✓ WhatsAppConversation reverted to (phone) unique, clinicId dropped');

      // WhatsAppSession → back to (phone) unique.
      await exec(`DROP INDEX IF EXISTS "WhatsAppSession_clinicId_phone_key"`);
      await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_phone_key" ON "WhatsAppSession"("phone")`);
      console.log('  ✓ WhatsAppSession reverted to (phone) unique');

      // WhatsAppChannel → drop (guarded above).
      await exec(`DROP TABLE IF EXISTS "WhatsAppChannel" CASCADE`);
      console.log('  ✓ WhatsAppChannel dropped');
    },
    { timeout: 60_000 }
  );

  console.log('\n  Rollback complete. Redeploy the prior application build.');
};

(async () => {
  if (CHECK) await runCheck();
  else if (ROLLBACK) await runRollback();
  else await runApply();
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\nMigration failed:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
