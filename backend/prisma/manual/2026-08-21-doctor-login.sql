-- Doctor login: DOCTOR role + the login↔record link.
--
-- Applied by hand, not by the deploy. `prisma db push` refuses ANY new unique
-- constraint with "there might be data loss" — it warns statically and never
-- looks at the data. `Doctor.userId` is a brand-new, entirely NULL column, so a
-- duplicate is impossible; the warning is wrong here but the flag that silences
-- it (--accept-data-loss) would also silence a real dropped column on some
-- future deploy. So: apply this once, and the deploy's db push becomes a no-op.
--
-- Idempotent — safe to run twice, or to re-run if it half-succeeded.

-- 1. Run this ON ITS OWN, first.
--    Postgres allows ALTER TYPE ... ADD VALUE inside a transaction, but the new
--    value cannot be USED in that same transaction. Keeping it separate removes
--    the question entirely.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DOCTOR';


-- 2. Then run the rest together.
ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Doctor_userId_key" ON "Doctor"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Doctor_userId_fkey'
  ) THEN
    ALTER TABLE "Doctor"
      ADD CONSTRAINT "Doctor_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
