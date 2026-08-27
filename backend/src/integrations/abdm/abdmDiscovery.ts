// Deciding whether the person ABDM is asking about is a patient of ours.
//
// ── This is the most dangerous decision in the integration ─────────────────
//
// A match here causes a clinic's records to be offered to whoever the gateway
// is acting for. Match too loosely and one person receives another person's
// medical history — the worst thing this product could do. Match too tightly
// and a patient cannot reach their own records, which is an inconvenience.
// Those two failures are not comparable, so every rule below is deliberately
// biased towards refusing.
//
// Hence:
//
//   • A VERIFIED identifier is required. ABDM marks an identifier verified when
//     the Consent Manager itself has confirmed it (a mobile number it sent an
//     OTP to). Name, gender and year of birth are never sufficient on their own
//     — plenty of people share all three.
//
//   • Ambiguity is an error, not a guess. Two patients on the same verified
//     mobile is normal and innocent: a family sharing one phone. There is no
//     safe way to pick between them, so we say so and let ABDM ask the patient.
//
//   • An unverified identifier can only NARROW a match, never create one.
//
// The matching is pure and separated from the database for exactly one reason:
// so these rules can be tested without a gateway, a clinic or a network.

/** One identifier as ABDM sends it. */
export interface AbdmIdentifier {
  type: string;
  value: string;
}

/** The person the gateway is asking about. */
export interface DiscoveryPatient {
  id: string;
  name?: string;
  gender?: string;
  yearOfBirth?: number;
  verifiedIdentifiers?: AbdmIdentifier[];
  unverifiedIdentifiers?: AbdmIdentifier[];
}

/** A patient of ours, reduced to what matching is allowed to look at. */
export interface CandidatePatient {
  id: string;
  name: string;
  phone: string | null;
  gender: string | null;
  abhaNumber: string | null;
  abhaAddress: string | null;
}

export type MatchOutcome =
  | { status: 'matched'; patient: CandidatePatient; matchedBy: string[] }
  | { status: 'none' }
  | { status: 'ambiguous' };

/**
 * Indian mobile numbers arrive in several shapes — +919812345678, 919812345678,
 * 09812345678, 9812345678 — and the same person is stored one way at the clinic
 * and sent another by ABDM. Comparing the last ten digits is what makes those
 * the same number without also making two different numbers equal.
 */
export const last10 = (phone: string | null | undefined): string | null => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
};

/** ABHA numbers are written 12-3456-7890-1234 and also 123456789012 34. */
const digitsOnly = (v: string | null | undefined): string | null => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length ? d : null;
};

const verifiedOfType = (patient: DiscoveryPatient, type: string): string[] =>
  (patient.verifiedIdentifiers ?? [])
    .filter((i) => i.type?.toUpperCase() === type)
    .map((i) => i.value)
    .filter(Boolean);

/**
 * Which of our patients — if exactly one — is the person ABDM described?
 *
 * `candidates` is every patient at the facility the request named. Filtering to
 * the facility happens before this function: matching must never be able to
 * reach across clinics, and the surest way to guarantee that is for the other
 * clinics' patients never to be in the list.
 */
export const matchPatient = (
  incoming: DiscoveryPatient,
  candidates: readonly CandidatePatient[]
): MatchOutcome => {
  const matchedBy: string[] = [];
  let pool: CandidatePatient[] = [];

  // 1. ABHA number, if the gateway sent one and we have it stored. The
  //    strongest signal available: it identifies a person nationally.
  const abha = digitsOnly(incoming.id?.includes('@') ? null : incoming.id);
  const byAbha = abha ? candidates.filter((c) => digitsOnly(c.abhaNumber) === abha) : [];
  if (byAbha.length) {
    pool = byAbha;
    matchedBy.push('ABHA_NUMBER');
  }

  // 2. The ABHA address (asha@sbx), which the gateway sends as `id`.
  if (!pool.length && incoming.id?.includes('@')) {
    const addr = incoming.id.trim().toLowerCase();
    const byAddress = candidates.filter((c) => c.abhaAddress?.trim().toLowerCase() === addr);
    if (byAddress.length) {
      pool = byAddress;
      matchedBy.push('HEALTH_ID');
    }
  }

  // 3. A VERIFIED mobile number. The usual path, and the reason this is safe:
  //    the Consent Manager has itself confirmed the patient controls it.
  if (!pool.length) {
    const numbers = verifiedOfType(incoming, 'MOBILE').map(last10).filter(Boolean);
    if (numbers.length) {
      const byMobile = candidates.filter((c) => {
        const p = last10(c.phone);
        return p !== null && numbers.includes(p);
      });
      if (byMobile.length) {
        pool = byMobile;
        matchedBy.push('MOBILE');
      }
    }
  }

  // Nothing verified matched. We do NOT fall back to name, gender or year of
  // birth: those identify a description, not a person.
  if (!pool.length) return { status: 'none' };

  // A name can only narrow what an identifier already found — and only when it
  // leaves someone standing. One shared phone in a family is the case this
  // exists for; a misspelt name must not empty the pool.
  if (pool.length > 1 && incoming.name) {
    const wanted = incoming.name.trim().toLowerCase();
    const byName = pool.filter((c) => c.name.trim().toLowerCase() === wanted);
    if (byName.length === 1) {
      pool = byName;
      matchedBy.push('NAME');
    }
  }

  if (pool.length > 1) return { status: 'ambiguous' };
  return { status: 'matched', patient: pool[0], matchedBy };
};
