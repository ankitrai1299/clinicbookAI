// What may and may not go into an audit row's `metadata`. PURE — no imports.
//
// The audit log is read by more people, kept for longer, and exported more often
// than the clinical record. If transcripts and prescription text leak into it,
// we have quietly created a second copy of the medical record with weaker
// controls and a different retention rule — which is worse than having no audit
// log at all, because it is invisible.
//
// So this is a DENYLIST of clinical keys plus a hard shape restriction:
// primitives only, one level deep, values length-capped. An audit row records
// THAT a prescription was approved, WHICH one, and a HASH of its content. It
// never records what the prescription said.

/** Keys whose values are, or may contain, clinical or message content. */
const CLINICAL_KEYS = [
  'transcript',
  'report',
  'summary',
  'prescription',
  'prescriptions',
  'medication',
  'medications',
  'medicines',
  'diagnosis',
  'complaint',
  'complaints',
  'notes',
  'note',
  'content',
  'text',
  'body',
  'message',
  'audio',
  'symptom',
  'symptoms',
  'history',
  'advice',
  'findings',
  'password',
  'token',
  'secret',
  'apikey',
  'authorization'
];

/** A key is clinical if any denied word appears anywhere in it (case-insensitive). */
export const isClinicalKey = (key: string): boolean => {
  const k = key.toLowerCase();
  return CLINICAL_KEYS.some((bad) => k.includes(bad));
};

/** Values longer than this are truncated — metadata is a label, not a payload. */
export const MAX_VALUE_LENGTH = 200;

/** How many keys one row may carry, so a caller cannot turn metadata into a blob. */
export const MAX_KEYS = 25;

export type SafeMetadata = Record<string, string | number | boolean>;

/**
 * Reduce arbitrary caller-supplied metadata to something safe to store forever.
 *
 * Dropped, silently and by design: clinical keys, nested objects and arrays
 * (which is how free text usually arrives), null/undefined, and anything past
 * the key cap. Silent because a throw here would fail the user's request over an
 * audit detail — the wrong trade. A dropped key is visible in the row itself:
 * what survives is what was allowed.
 */
export const redactMetadata = (input: unknown): SafeMetadata | undefined => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;

  const out: SafeMetadata = {};
  let kept = 0;

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (kept >= MAX_KEYS) break;
    if (isClinicalKey(key)) continue;

    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      kept++;
      continue;
    }

    if (typeof value === 'string') {
      // An empty string carries no information and costs a column.
      if (!value) continue;
      out[key] = value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
      kept++;
    }
    // Everything else — objects, arrays, null, undefined, functions — is dropped.
  }

  return Object.keys(out).length ? out : undefined;
};

/**
 * A phone number reduced to something that identifies a record in an
 * investigation without being the number itself.
 */
export const maskPhone = (phone: string | undefined | null): string | undefined => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.length <= 4 ? '*'.repeat(digits.length) : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
};
