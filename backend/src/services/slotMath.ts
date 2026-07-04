// Pure slot / clinic-time math — NO database, NO imports from the app graph.
// Extracted from scheduling.service so both the service (which now dispatches DB
// work to the data-source seam) AND the native slot adapter can share this logic
// without a circular import. scheduling.service re-exports everything here, so
// existing importers (`canonicalizeTime`, `isPastSlot`, `clinicNow`,
// `clinicLocalInstant`, …) are unaffected.

export const parseHHMM = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// minutes-from-midnight → "HH:MM AM/PM" (2-digit 12h hour).
export const formatSlot = (mins: number): string => {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

export const parseDateUTC = (dateStr: string): Date => new Date(`${dateStr}T00:00:00.000Z`);

// ---------------------------------------------------------------------------
// Clinic timezone. Schedules ("09:00"–"17:00") and slot labels are wall-clock
// times in the clinic's local zone, so "is this slot in the past?" MUST be
// judged against the current time in that SAME zone — never UTC. Comparing a
// slot's local minutes against a UTC "now" silently lets past slots through
// (e.g. at 15:23 IST = 09:53 UTC, a 14:00 slot looked "future"). India has no
// DST, but we resolve via Intl so this stays correct regardless.
// ---------------------------------------------------------------------------
export const CLINIC_TIMEZONE = 'Asia/Kolkata';

// Current clinic-local date (YYYY-MM-DD) and minutes-from-midnight. `at` is
// injectable so the past-slot logic is unit-testable with a fixed clock.
export const clinicNow = (at: Date = new Date()): { dateStr: string; minutes: number } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  let hh = parseInt(get('hour'), 10);
  if (hh === 24) hh = 0; // some runtimes emit "24" for midnight under hour12:false
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, minutes: hh * 60 + parseInt(get('minute'), 10) };
};

// Minimum lead time before a slot can be offered/booked. A patient can't book a
// slot that starts in the next 30 minutes (no walk-up bookings; gives reception
// + the patient travel time). e.g. at 15:23 the 15:30 slot is hidden, 16:00 is
// the first bookable one.
export const BOOKING_BUFFER_MIN = 30;

// PURE: is a slot (its minutes-from-midnight, on slotDateStr) bookable relative
// to `now`, honouring the booking buffer? A past calendar day → false; a future
// day → true; today → only times at least BOOKING_BUFFER_MIN ahead of now. This
// is the single source of truth for "never show/book a past or near-past slot"
// and is exercised directly by tests.
export const slotIsFuture = (
  slotMinutes: number,
  slotDateStr: string,
  now: { dateStr: string; minutes: number }
): boolean => {
  if (slotDateStr < now.dateStr) return false;
  if (slotDateStr > now.dateStr) return true;
  return slotMinutes >= now.minutes + BOOKING_BUFFER_MIN;
};

// Parse a stored slot label ("HH:MM AM/PM") back to minutes-from-midnight.
export const labelToMinutes = (label: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
};

// Asia/Kolkata is a FIXED offset (UTC+5:30, no DST) — kept in sync with
// CLINIC_TIMEZONE above. Used to turn a stored appointment (UTC-midnight date +
// clinic-local "HH:MM AM/PM") into its true UTC instant, so reminder timing math
// compares against Date.now() correctly (the old code treated the local time as
// UTC and fired reminders ~5.5h off).
const CLINIC_UTC_OFFSET_MIN = 330;

// Real UTC instant of an appointment. `date` is the UTC-midnight calendar day;
// `timeLabel` is the clinic-local time. instant = local wall-clock − offset.
export const clinicLocalInstant = (date: Date, timeLabel: string): Date => {
  const local = labelToMinutes(timeLabel) ?? 0;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, local - CLINIC_UTC_OFFSET_MIN, 0, 0)
  );
};

// Defense-in-depth guard used by the booking write path: true when (dateStr,
// timeLabel) is at or before the current clinic-local moment. Unparseable times
// return false (other validation handles those) so we never block a valid book.
export const isPastSlot = (dateStr: string, timeLabel: string, at: Date = new Date()): boolean => {
  const mins = labelToMinutes(timeLabel);
  if (mins === null) return false;
  return !slotIsFuture(mins, dateStr, clinicNow(at));
};

/**
 * Normalise any reasonable time string the AI (or staff UI) might supply —
 * "9", "9:30", "9 AM", "2:30pm", "14:30", "09:00 AM" — into the canonical
 * "HH:MM AM/PM" label this system stores and that slot generation produces.
 * Returns null if the input can't be understood as a time of day.
 */
export const canonicalizeTime = (input: string): string | null => {
  const s = input.trim().toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];

  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }

  if (h > 23 || min > 59) return null;
  return formatSlot(h * 60 + min);
};
