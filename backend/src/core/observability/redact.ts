// What may appear in an application log. PURE — no imports.
//
// Application logs are the least-protected copy of anything we hold. They go to
// the hosting provider's log store, they are read by whoever can open a
// dashboard, they are retained on someone else's schedule, and nobody thinks of
// them as clinical data. So a patient's phone number, what they said about their
// health, or which medicine they were prescribed must not be written there —
// even though every one of those made a log line easier to debug.
//
// The replacement is not "log nothing". A support request is "a booking failed
// around 3pm for a number ending 4686", and that has to remain answerable. So
// identifiers are MASKED down to the part that lets someone correlate a record
// they already have the right to see, and content is replaced by its shape:
// how long it was, how many items, which language — never what it said.

/**
 * A phone number reduced to its last four digits.
 *
 * Enough to match against a record the reader already holds; not enough to
 * contact anyone or to identify a person from the log alone.
 */
export const maskPhone = (phone: string | null | undefined): string => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '(none)';
  return digits.length <= 4 ? '*'.repeat(digits.length) : `*${digits.slice(-4)}`;
};

/**
 * A person's name reduced to initials.
 *
 * "Asha Kumari" → "A.K." — a human reading the log can tell two patients apart
 * in the same trace without the log naming either of them.
 */
export const maskName = (name: string | null | undefined): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '(unnamed)';
  return `${parts.map((p) => p[0]?.toUpperCase() ?? '').join('.')}.`;
};

/**
 * An email reduced to its first character and domain: "a***@nextdot.co.in".
 */
export const maskEmail = (email: string | null | undefined): string => {
  const value = (email || '').trim();
  const at = value.indexOf('@');
  if (at < 1) return value ? '(redacted)' : '(none)';
  return `${value[0]}***${value.slice(at)}`;
};

/**
 * The SHAPE of a piece of text, never the text.
 *
 * Used where a preview used to be logged — a transcript preview is the patient
 * describing their symptoms, and 80 characters of that is more than enough to
 * identify both the person and the condition.
 */
export const describeText = (text: string | null | undefined): string => {
  const value = text || '';
  if (!value) return 'empty';
  return `${value.length} chars`;
};

/**
 * A medicine reduced to nothing but its presence.
 *
 * A drug name beside a patient name in a log is a diagnosis in all but wording.
 * Reminder logs now say how many, and carry the reminder id for anyone entitled
 * to look up which.
 */
export const describeMedicines = (count: number): string => `${count} medicine${count === 1 ? '' : 's'}`;
