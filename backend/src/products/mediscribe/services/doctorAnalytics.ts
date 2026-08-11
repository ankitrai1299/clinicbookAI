// The dashboard's summary figures for ONE doctor over a date range.
//
// Separate from services/analytics.ts, which answers clinic-wide questions for
// the admin console. This answers "how did MY practice do this week", so every
// figure is scoped to the signed-in doctor's own consultations.
//
// The counting rules are pure and live below, so they can be tested without a
// database — the part worth getting wrong is which consultation falls in the
// range, not how the rows are fetched.

export interface DoctorAnalytics {
  startDate: string | null;
  endDate: string | null;
  days: number;
  totalConsultations: number;
  completedReports: number;
  draftReports: number;
  pendingFollowUps: number;
  /** Completed as a percentage of total, 0 when there is nothing to divide. */
  completionRate: number;
  averagePerDay: number;
}

export interface CountableConsultation {
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  date?: string;
  report?: { followUp?: { date?: string } | null } | null;
}

/** YYYY-MM-DD → a timestamp, or null when it is not a date we can read. */
export const parseDay = (value?: string | null): number | null => {
  const s = (value || '').trim();
  if (!s) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return Number.isNaN(t) ? null : t;
};

/**
 * When this consultation happened. updatedAt → createdAt → its display date,
 * the same order the rest of the app uses, so a figure here can never disagree
 * with the list it summarises.
 */
export const consultationTime = (c: CountableConsultation): number | null => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? null : t;
};

/**
 * Is this consultation inside [start, end]? An end date is treated as the END
 * of that day — a doctor asking for "1st to 7th" means through the 7th, and
 * midnight would silently drop the closing day's work.
 *
 * A consultation whose time cannot be read is EXCLUDED from a bounded range
 * (we cannot claim it belongs) but INCLUDED when no range is given.
 */
export const withinRange = (c: CountableConsultation, start: number | null, end: number | null): boolean => {
  if (start === null && end === null) return true;
  const t = consultationTime(c);
  if (t === null) return false;
  if (start !== null && t < start) return false;
  if (end !== null && t > end + 86_399_999) return false;
  return true;
};

/** A follow-up still ahead of `now` — or one with no readable date, which is
 *  still an open commitment the doctor made. */
export const isFollowUpPending = (c: CountableConsultation, now: number): boolean => {
  const raw = c?.report?.followUp?.date?.trim();
  if (!raw) return false;
  const t = parseDay(raw);
  return t === null ? true : t >= now;
};

const startOfToday = (now: Date): number => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Build the summary. `startDate`/`endDate` are YYYY-MM-DD; either may be absent,
 * which simply removes that bound.
 */
export const buildDoctorAnalytics = (
  consultations: CountableConsultation[],
  opts: { startDate?: string; endDate?: string; now?: Date } = {}
): DoctorAnalytics => {
  const now = opts.now ?? new Date();
  const start = parseDay(opts.startDate);
  const end = parseDay(opts.endDate);

  const inWindow = consultations.filter((c) => withinRange(c, start, end));
  const total = inWindow.length;
  const completed = inWindow.filter((c) => c.status === 'Completed').length;
  const drafts = total - completed;
  const pending = inWindow.filter((c) => isFollowUpPending(c, startOfToday(now))).length;

  // Inclusive day count: the 1st to the 1st is one day, not zero. Without a
  // bounded range there is no meaningful denominator, so averagePerDay reports
  // 0 rather than dividing by a made-up number.
  const days = start !== null && end !== null ? Math.max(1, Math.round((end - start) / 86_400_000) + 1) : 0;

  return {
    startDate: opts.startDate?.trim() || null,
    endDate: opts.endDate?.trim() || null,
    days,
    totalConsultations: total,
    completedReports: completed,
    draftReports: drafts,
    pendingFollowUps: pending,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
    averagePerDay: days ? Math.round((total / days) * 10) / 10 : 0
  };
};
