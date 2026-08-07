// Turn the follow-up line the model wrote into a real calendar date.
//
// `report.followUp.date` is free text, because that is how doctors say it —
// "after 3 days", "next month", "11th June". The model writes it back in the
// same register, sometimes adding a weekday of its own invention. Production has
// exactly that: "Monday, June 11th, 2026" — 11 June 2026 is a THURSDAY, and by
// the time it was on screen the date had already passed.
//
// That string was being sent to the patient on WhatsApp verbatim. A wrong
// weekday on a clinic instruction is not a cosmetic bug: the patient reads the
// day, not the number.
//
// So the day name is always DERIVED from the parsed date, never carried over
// from the text, and anything we cannot parse is passed through as the note it
// is rather than dressed up as a date.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n: number) => String(n).padStart(2, '0');
export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
 * Best-effort YYYY-MM-DD from a free-text follow-up line, or null.
 * `from` is the base for relative phrases — "after 3 days" is three days from
 * the CONSULTATION, not from whenever this happens to run.
 */
export const parseFollowUpDate = (text: string | undefined, from: Date = new Date()): string | null => {
  const raw = (text || '').trim();
  if (!raw) return null;
  const s = raw.toLowerCase();

  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  // Day-first, as dates are written in India. Only swapped when the first
  // number cannot be a month.
  const dmy = s.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    let day = Number(dd);
    let month = Number(mm);
    if (day <= 12 && month > 12) [day, month] = [month, day];
    const year = Number(yy.length === 2 ? `20${yy}` : yy);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, day);
      if (!Number.isNaN(d.getTime())) return toISODate(d);
    }
  }

  // Month by name — "11 June 2026", "June 11th, 2026", "Jun 11".
  const named =
    s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s*(\d{4})?\b/) ||
    s.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/);
  if (named) {
    const [, a, b, yy] = named;
    const dayFirst = /^\d/.test(a);
    const day = Number(dayFirst ? a : b);
    const month = MONTHS.indexOf((dayFirst ? b : a).slice(0, 3));
    if (month >= 0 && day >= 1 && day <= 31) {
      // No year written → the next occurrence at or after the base, so a bare
      // "11 June" said in August means next June, not one already gone.
      let year = yy ? Number(yy) : from.getFullYear();
      if (!yy && new Date(year, month, day) < from) year += 1;
      const d = new Date(year, month, day);
      if (!Number.isNaN(d.getTime())) return toISODate(d);
    }
  }

  const rel = s.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    if (n > 0 && n < 400) {
      if (unit.startsWith('day')) return toISODate(addDays(from, n));
      if (unit.startsWith('week')) return toISODate(addDays(from, n * 7));
      if (unit.startsWith('month')) return toISODate(addMonths(from, n));
      if (unit.startsWith('year')) return toISODate(addMonths(from, n * 12));
    }
  }

  if (/\btomorrow\b/.test(s)) return toISODate(addDays(from, 1));
  if (/\bnext week\b/.test(s)) return toISODate(addDays(from, 7));
  if (/\bnext month\b/.test(s)) return toISODate(addMonths(from, 1));
  if (/\bfortnight\b/.test(s)) return toISODate(addDays(from, 14));

  return null;
};

/**
 * The follow-up line to SHOW or SEND.
 *
 * A parsed date is rendered with its true weekday. Anything else is returned
 * unchanged — an instruction like "come with reports after the day" is useful
 * advice and must survive, it just must not be announced as a date.
 */
export const formatFollowUpLine = (
  text: string | undefined,
  from: Date = new Date()
): string | null => {
  const raw = (text || '').trim();
  if (!raw) return null;

  const iso = parseFollowUpDate(raw, from);
  if (!iso) return raw;

  const [y, m, d] = iso.split('-').map(Number);
  const when = new Date(y, m - 1, d);
  if (Number.isNaN(when.getTime())) return raw;

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(when);
};
