// Real-phone guard shared by both apps (ClinicBook + MediScribe). Patients created
// without a phone historically got a placeholder ("0000000000"); never show those.
// Returns the phone to display, or null when it's missing / a placeholder.

const PLACEHOLDER_WORDS = new Set(['na', 'n/a', 'none', 'null', 'undefined', 'nil', '-']);

export function realPhone(phone?: string | null): string | null {
  const p = (phone || '').trim();
  if (!p) return null;
  if (PLACEHOLDER_WORDS.has(p.toLowerCase())) return null;
  const digits = p.replace(/\D/g, '');
  if (!digits) return null;            // no digits at all (e.g. "N/A")
  if (/^0+$/.test(digits)) return null; // all zeros (0000000000, 000000, …)
  if (digits.length < 6) return null;   // too short to be a real number
  return p;
}

/** True when the value is a usable phone number worth displaying. */
export const hasRealPhone = (phone?: string | null): boolean => realPhone(phone) !== null;
