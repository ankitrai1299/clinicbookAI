// The dashboard's date filter: presets, custom ranges, and the wire format.
//
// Ranges are sent to the server as FULL ISO instants computed from the doctor's
// LOCAL midnight — not as bare "YYYY-MM-DD" dates. A bare date is parsed as UTC
// midnight, and in IST (+05:30) that shifts the window by five and a half hours:
// a consultation recorded at 02:00 on the 7th is 20:30 UTC on the 6th, so
// "Today" would quietly drop the morning's work. Sending instants makes the
// window mean the same thing on both sides regardless of timezone.

export type RangePreset = 'today' | 'week' | 'month' | 'custom';

export interface DateRange {
  preset: RangePreset;
  /** Inclusive start, ISO instant at local midnight. */
  start: string;
  /** Inclusive end, ISO instant at local 23:59:59.999. */
  end: string;
}

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

/** Build a range from two local dates, ordered so From/To cannot be inverted. */
export function rangeFromDates(from: Date, to: Date, preset: RangePreset = 'custom'): DateRange {
  const [a, b] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
  return { preset, start: startOfDay(a).toISOString(), end: endOfDay(b).toISOString() };
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const now = new Date();

  if (preset === 'today') return rangeFromDates(now, now, 'today');

  if (preset === 'week') {
    // Week starts Monday — the convention for a clinic's working week, and what
    // "this week" means to a doctor looking at Monday's list on a Wednesday.
    const day = (now.getDay() + 6) % 7; // Mon = 0 … Sun = 6
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    return rangeFromDates(monday, now, 'week');
  }

  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return rangeFromDates(first, now, 'month');
}

export const DEFAULT_RANGE = (): DateRange => presetRange('today');

/** Human label for the bar at the top of every filtered screen. */
export function rangeLabel(range: DateRange): string {
  const s = new Date(range.start);
  const e = new Date(range.end);
  const sameDay = s.toDateString() === e.toDateString();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString([], {
      day: '2-digit',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });

  if (sameDay) return fmt(s, true);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${fmt(s, !sameYear)} – ${fmt(e, true)}`;
}

/** Inclusive day count — the divisor behind "average per day". */
export function rangeDays(range: DateRange): number {
  const s = new Date(range.start).setHours(0, 0, 0, 0);
  const e = new Date(range.end).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

/** Query string for the API. Empty when the range is somehow unset. */
export function rangeQuery(range: DateRange): string {
  if (!range?.start || !range?.end) return '';
  return `startDate=${encodeURIComponent(range.start)}&endDate=${encodeURIComponent(range.end)}`;
}

// `labelKey` resolves through i18n at render, so the labels follow the app
// language. The resolved date range in `rangeLabel` stays as formatted dates.
export const PRESET_LABELS: { key: RangePreset; labelKey: string }[] = [
  { key: 'today', labelKey: 'dateRange.today' },
  { key: 'week', labelKey: 'dateRange.thisWeek' },
  { key: 'month', labelKey: 'dateRange.thisMonth' },
  { key: 'custom', labelKey: 'dateRange.customRange' },
];

/** The i18n key for the currently-selected preset — shown on the filter trigger. */
export function presetTriggerKey(range: DateRange): string {
  return PRESET_LABELS.find((p) => p.key === range.preset)?.labelKey ?? 'dateRange.custom';
}

/**
 * The period immediately before `range`, of equal length — the honest baseline
 * for a period-over-period trend. "This week" compares against last week, "today"
 * against yesterday, a 30-day window against the 30 days before it.
 *
 * Both bounds are day-aligned, exactly like the ranges the filter produces, so
 * the comparison covers the same number of days with no overlap.
 */
export function previousRange(range: DateRange): DateRange {
  const start = new Date(range.start).getTime();
  const days = rangeDays(range);
  return {
    preset: 'custom',
    start: new Date(start - days * 86_400_000).toISOString(),
    // 1ms before the current start = end of the day before it.
    end: new Date(start - 1).toISOString(),
  };
}
