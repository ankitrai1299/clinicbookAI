// Per-clinic DAILY outbound-message cap — a runaway-cost and abuse backstop for
// public self-serve. Without it, any clinic that signs up (or an abuser who gets
// through signup) could trigger unbounded WhatsApp sends, each of which costs
// money at Meta, and run up the platform's bill.
//
// This is NOT a billing meter. It is an in-memory, per-process counter that resets
// on restart and at each date change. It is enough to stop a runaway loop or an
// abuser from spending unbounded money within a day. A precise, restart-proof,
// multi-instance quota would live in the DB or Redis — revisit if we ever run more
// than one backend instance. Kept in memory on purpose so it adds NO schema (a
// prod schema push is a separate, careful step) and no hot-path DB query.
//
// Configuration (env, read live so ops can tune without a redeploy of logic):
//   WA_DAILY_SEND_CAP            messages per clinic per day (default 1000; <= 0 disables the cap)
//   WA_SEND_CAP_EXEMPT_CLINICS   comma-separated clinicIds never capped
//                                (e.g. the established production clinic)

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

type Bucket = { day: string; count: number };
const buckets = new Map<string, Bucket>();

const dayKey = (): string => new Date().toISOString().slice(0, 10);

export interface QuotaResult {
  allowed: boolean;
  count: number;
  cap: number;
}

// Reserve one send from the clinic's daily budget. Increments the count when
// allowed; once the cap is reached it returns allowed:false WITHOUT incrementing
// further, so a clinic sitting at the cap keeps being blocked (not overflowing).
export const consumeDailySendQuota = (clinicId?: string | null): QuotaResult => {
  const limit = capLimit();
  const key = clinicId ?? 'env-default';

  // Cap disabled, or an explicitly trusted clinic → always allow, don't track.
  if (limit <= 0 || exemptClinics().has(key)) return { allowed: true, count: 0, cap: limit };

  const day = dayKey();
  let bucket = buckets.get(key);
  if (!bucket || bucket.day !== day) {
    bucket = { day, count: 0 };
    buckets.set(key, bucket);
  }

  if (bucket.count >= limit) return { allowed: false, count: bucket.count, cap: limit };
  bucket.count += 1;
  return { allowed: true, count: bucket.count, cap: limit };
};

// Test/ops helper — drop all counters (e.g. between tests).
export const resetSendCaps = (): void => buckets.clear();
