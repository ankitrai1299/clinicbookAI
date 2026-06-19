// Doctor-name presentation helpers.
//
// Doctor names are entered by clinic admins and arrive dirty: missing or
// duplicated "Dr." prefixes ("dr rai", "Dr. Dr. Ruchi"), wrong casing
// ("dr a.k das"). Two boundaries render them to patients with DIFFERENT needs:
//
//   • Session / free-form bodies + the FSM build their own text, so they need
//     the full display form WITH exactly one "Dr." prefix  → formatDoctorName.
//   • The Meta-approved WhatsApp templates already bake "Dr." into the body
//     ("…with Dr. {{4}}…"), so they must receive the BARE name (no prefix),
//     otherwise the channel renders "Dr. Dr. X"               → normalizeDoctorName.
//
// Both functions are idempotent: re-applying them never adds a second "Dr." and
// never double-cases, so they are safe to call at every render point regardless
// of how clean the stored value already is.

// Strip any run of leading "dr"/"dr."/"doctor" tokens (covers "Dr. Dr. ").
const TITLE_PREFIX = /^(?:\s*(?:dr\.?|doctor)\s+)+/i;

// Capitalise the first letter of each whitespace word and of each dotted
// segment within it, leaving the rest untouched so initials survive:
//   "rai" → "Rai", "a.k. das" → "A.K. Das", "A.K. Das" → "A.K. Das".
const capitalizeName = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split('.')
        .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
        .join('.')
    )
    .join(' ');

// Bare, properly-cased name with NO title. Use for template variables where the
// approved template body already prints "Dr.".
export const normalizeDoctorName = (raw: string | null | undefined): string => {
  const base = (raw ?? '').trim();
  if (!base) return '';
  return capitalizeName(base.replace(TITLE_PREFIX, '').trim());
};

// Full display name with exactly one "Dr." prefix. Use for free-form/session
// bodies and the FSM, which render the name standalone.
export const formatDoctorName = (raw: string | null | undefined): string => {
  const bare = normalizeDoctorName(raw);
  return bare ? `Dr. ${bare}` : 'the doctor';
};
