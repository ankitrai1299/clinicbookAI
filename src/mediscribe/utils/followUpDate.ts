// Turn the follow-up line the AI wrote into a real calendar date.
//
// `followUp.date` is free text because that is how doctors say it — "after 3
// days", "in 1 week", "15/08/2026", "next month". None of that could be booked,
// so the follow-up printed on the PDF and was then re-entered by hand. This
// parser only PRE-FILLS the booking form: the doctor always sees and confirms
// the date, so a wrong guess costs a correction, never a wrong appointment.

/** Local YYYY-MM-DD (not UTC — a 10 PM visit must not book for tomorrow). */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const addDays = (base: Date, days: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (base: Date, months: number): Date => {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * Best-effort date from a free-text follow-up line, or null when we can't tell.
 * Returns YYYY-MM-DD. Never throws.
 */
export function parseFollowUpDate(text: string | undefined, today = new Date()): string | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const s = raw.toLowerCase();

  // Explicit ISO — 2026-08-15
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  // Day/month/year — 15/08/2026 or 15-08-26. Day-first, which is how dates are
  // written in India; a US-style month-first string would parse wrong, so we only
  // accept it when the first number can't be a month.
  const dmy = s.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (dmy) {
    let [, dd, mm, yy] = dmy;
    let day = Number(dd);
    let month = Number(mm);
    if (day <= 12 && month > 12) [day, month] = [month, day]; // clearly month-first
    const year = Number(yy.length === 2 ? `20${yy}` : yy);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, day);
      if (!Number.isNaN(d.getTime())) return toISODate(d);
    }
  }

  // Relative — "after 3 days", "in 2 weeks", "1 month", "6 weeks"
  const rel = s.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    if (n > 0 && n < 400) {
      if (unit.startsWith('day')) return toISODate(addDays(today, n));
      if (unit.startsWith('week')) return toISODate(addDays(today, n * 7));
      if (unit.startsWith('month')) return toISODate(addMonths(today, n));
      if (unit.startsWith('year')) return toISODate(addMonths(today, n * 12));
    }
  }

  // Bare words
  if (/\btomorrow\b/.test(s)) return toISODate(addDays(today, 1));
  if (/\bnext week\b/.test(s)) return toISODate(addDays(today, 7));
  if (/\bnext month\b/.test(s)) return toISODate(addMonths(today, 1));
  if (/\bfortnight\b/.test(s)) return toISODate(addDays(today, 14));

  return null;
}

// Slot labels in the format the appointment API expects. Kept deliberately short
// — the doctor is picking a rough return time, not fine-tuning a schedule.
export const FOLLOW_UP_TIMES: string[] = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM', '07:00 PM',
];
