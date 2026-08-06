// Per-clinic DAILY outbound-message cap — a runaway-cost and abuse backstop for
// public self-serve. Without it, any clinic that signs up (or an abuser who gets
// through signup) could trigger unbounded WhatsApp sends, each of which costs
// money at Meta, and run up the platform's bill.
//
// This is NOT a billing meter, but it IS now shared. It used to be an in-process
// counter, which meant two things: it reset on every restart, and with a second
// instance each one kept its own tally — so the effective cap was the configured
// number multiplied by however many instances happened to be running. The
// counter now lives in the database, incremented atomically, so the budget is
// the budget no matter who is serving the request.
//
// The increment is a single INSERT … ON CONFLICT DO UPDATE, so concurrent sends
// from different instances cannot both read "999" and both decide to send.
//
// Configuration (env, read live so ops can tune without a redeploy of logic):
//   WA_DAILY_SEND_CAP            messages per clinic per day (default 1000; <= 0 disables the cap)
//   WA_SEND_CAP_EXEMPT_CLINICS   comma-separated clinicIds never capped
//                                (e.g. the established production clinic)

import { prisma } from '../../config/prisma.js';

const DEFAULT_CAP = 1000;

const capLimit = (): number => {
  const raw = Number(process.env.WA_DAILY_SEND_CAP);
  return Number.isFinite(raw) ? raw : DEFAULT_CAP;
};

const exemptClinics = (): Set<string> => {
  const ids = (process.env.WA_SEND_CAP_EXEMPT_CLINICS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // The established production clinic (the env default channel) is trusted by
  // default, so shipping this cap can never silently throttle its real reminders.
  // Only brand-new self-serve clinics get the cap unless ops adds more exemptions.
  if (process.env.WHATSAPP_CLINIC_ID) ids.push(process.env.WHATSAPP_CLINIC_ID);
  return new Set(ids);
};

const dayKey = (at: Date = new Date()): string => at.toISOString().slice(0, 10);

export interface QuotaResult {
  allowed: boolean;
  count: number;
  cap: number;
}

// PURE: given the count AFTER incrementing, may this send proceed? Split out so
// the off-by-one is testable — with a cap of 1000 the thousandth send must be
// allowed and the thousand-and-first blocked.
export const decideQuota = (countAfterIncrement: number, cap: number): boolean =>
  countAfterIncrement <= cap;

/**
 * Reserve one send from the clinic's daily budget.
 *
 * FAILS OPEN. If the counter can't be reached, the send proceeds: this is a
 * cost backstop, and a database blip must not stop a clinic replying to its
 * patients. The cap protects against a runaway loop, which a brief outage is not.
 */
export const consumeDailySendQuota = async (
  clinicId?: string | null,
  at: Date = new Date()
): Promise<QuotaResult> => {
  const limit = capLimit();
  const key = clinicId ?? 'env-default';

  // Cap disabled, or an explicitly trusted clinic → always allow, don't track.
  if (limit <= 0 || exemptClinics().has(key)) return { allowed: true, count: 0, cap: limit };

  const day = dayKey(at);
  try {
    // One statement: insert the day's row or bump it, and return the new value.
    // Two instances racing both get their own distinct count back, so exactly one
    // of them can be the request that crosses the cap.
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "WhatsAppSendCounter" ("clinicKey", "day", "count", "updatedAt")
      VALUES (${key}, ${day}, 1, NOW())
      ON CONFLICT ("clinicKey", "day")
      DO UPDATE SET "count" = "WhatsAppSendCounter"."count" + 1, "updatedAt" = NOW()
      RETURNING "count"
    `;
    const count = rows[0]?.count ?? 0;
    return { allowed: decideQuota(count, limit), count, cap: limit };
  } catch (err) {
    console.error('[WhatsApp][cap] counter unavailable — allowing the send:', err);
    return { allowed: true, count: 0, cap: limit };
  }
};

// Test/ops helper — clear today's counters (or a specific day).
export const resetSendCaps = async (day?: string): Promise<void> => {
  try {
    await prisma.whatsAppSendCounter.deleteMany(day ? { where: { day } } : undefined);
  } catch {
    /* best-effort; only used by tests and ops */
  }
};
