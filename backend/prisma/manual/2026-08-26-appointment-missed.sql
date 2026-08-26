-- Adds the APPOINTMENT_MISSED notification type, used when a patient does not
-- attend (distinct from APPOINTMENT_CANCELLED, which means the visit was called
-- off). Additive: nothing reads it until the code that writes it is deployed.
--
-- `prisma db push` normally applies this on its own. This file exists for the
-- case where it does not, because ALTER TYPE ... ADD VALUE cannot be USED in
-- the same transaction that adds it -- so a push that wraps both the enum
-- change and a dependent write can fail. Run this by hand first, then push.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_MISSED';
