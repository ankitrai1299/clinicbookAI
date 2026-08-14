// What each dashboard card counts — and what its screen lists.
//
// These live together deliberately. The dashboard used to compute its four
// numbers inline, so a card could say "3" and open a screen showing four rows
// the moment either side was edited. Every count and every list now comes from
// the same predicate.
//
// Nothing here fetches: the consultation set is already loaded once by
// AppDataProvider and every card is a view over it. That is why adding these
// screens needed no new read APIs.
import i18n from '../i18n';
import { Consultation, Patient } from '../types';

/** Millisecond timestamp for ordering. 0 when a record carries no usable date. */
export function sessionTime(c: Consultation): number {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Start of today, local time — the boundary every "is it due" check uses. */
export function startOfToday(): number {
  return new Date().setHours(0, 0, 0, 0);
}

export function parseDate(value?: string): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 Mar 2026" — used wherever a stored date is shown. */
export function formatDate(value?: string): string {
  const d = parseDate(value);
  return d ? d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

/** "09:30" — the consultation time column. */
export function formatTime(value?: string): string {
  const d = parseDate(value);
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
}

/**
 * "2 days ago" / "in 3 days" — relative wording for follow-ups and edits.
 *
 * Localised through the global i18n instance rather than a hook: this is a plain
 * util called from render helpers, not a component, so it cannot use
 * useTranslation. i18n.t reads the currently-active language, which the
 * LanguageProvider keeps in sync.
 */
export function relativeDay(value?: string): string {
  const d = parseDate(value);
  if (!d) return i18n.t('relative.dash');
  const days = Math.round((d.setHours(0, 0, 0, 0) - startOfToday()) / 86_400_000);
  if (days === 0) return i18n.t('relative.today');
  if (days === 1) return i18n.t('relative.tomorrow');
  if (days === -1) return i18n.t('relative.yesterday');
  return days > 0
    ? i18n.t('relative.inDays', { count: days })
    : i18n.t('relative.daysAgo', { count: Math.abs(days) });
}

// ── The four buckets ─────────────────────────────────────────

/** Anything worked on today, by whichever timestamp the record actually has. */
export function todaysConsultations(all: Consultation[]): Consultation[] {
  const now = new Date();
  return all
    .filter((c) => {
      const d = parseDate(c.updatedAt || c.createdAt || c.date);
      return !!d && isSameDay(d, now);
    })
    .sort((a, b) => sessionTime(b) - sessionTime(a));
}

/** Everything not yet finished — the work still owed a report. */
export function draftConsultations(all: Consultation[]): Consultation[] {
  return all.filter((c) => c.status !== 'Completed').sort((a, b) => sessionTime(b) - sessionTime(a));
}

export function completedConsultations(all: Consultation[]): Consultation[] {
  return all.filter((c) => c.status === 'Completed').sort((a, b) => sessionTime(b) - sessionTime(a));
}

/**
 * Follow-ups still owed.
 *
 * A follow-up counts as pending when the report carries a follow-up date that
 * has not been marked done. Overdue ones are deliberately INCLUDED — a missed
 * follow-up is more important than an upcoming one, not less, so they sort to
 * the top rather than dropping out of the list.
 */
export function pendingFollowUps(all: Consultation[]): Consultation[] {
  return all
    .filter((c) => {
      if (c.followUpCompletedAt) return false;
      return !!c.report?.followUp?.date?.trim();
    })
    .sort((a, b) => {
      // Soonest (and most overdue) first; undated entries last.
      const da = parseDate(a.report?.followUp?.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseDate(b.report?.followUp?.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
}

/**
 * True when a follow-up has a REAL date that has passed.
 *
 * Only ISO dates can be overdue. `report.followUp.date` is often free text the
 * model wrote — "7 days", "in a few days" — which carries no instant to compare
 * against, so those are never flagged rather than guessed at.
 */
export function isOverdue(c: Consultation): boolean {
  const d = parseDate(c.report?.followUp?.date);
  return !!d && d.setHours(0, 0, 0, 0) < startOfToday();
}

/**
 * What to show for "when is this follow-up due".
 *
 * A real date becomes "in 3 days"; anything else is the doctor's own wording,
 * shown verbatim. Rendering "—" for a follow-up that plainly says "after seven
 * days" would be throwing away the only instruction that was actually given.
 */
export function followUpDueLabel(c: Consultation): string {
  const raw = c.report?.followUp?.date?.trim();
  if (!raw) return '-';
  return parseDate(raw) ? relativeDay(raw) : raw;
}

/**
 * Why the patient is coming back.
 *
 * The report stores follow-up guidance across a few fields depending on how the
 * consultation was dictated, so the first one with content wins, falling back to
 * the assessment — never an empty string, which would render as a blank row.
 */
export function followUpReason(c: Consultation): string {
  const fu = c.report?.followUp;
  return (
    fu?.instructions?.trim() ||
    fu?.reports?.trim() ||
    c.report?.assessment?.find((a) => a?.trim())?.trim() ||
    c.report?.chiefComplaint?.find((a) => a?.trim())?.trim() ||
    i18n.t('lists.followups.routineReview')
  );
}

/** Does this consultation have a report worth opening/exporting? */
export function hasReport(c: Consultation): boolean {
  const r = c.report;
  if (!r) return false;
  return !!(
    r.clinicalOverview?.trim() ||
    r.chiefComplaints?.length ||
    r.assessment?.length ||
    r.prescribedMedications?.length
  );
}

/** Age/gender for the row subtitle — they live on the patient, not the session. */
export function patientOf(patients: Patient[], c: Consultation): Patient | undefined {
  return patients.find((p) => p.id === c.patientId);
}

export function demographics(patient?: Patient): string {
  if (!patient) return '';
  const bits: string[] = [];
  if (patient.age > 0) bits.push(`${patient.age}y`);
  if (patient.gender?.trim()) bits.push(patient.gender.trim());
  return bits.join(' · ');
}
