// Patients under eighteen, and the consent that has to come from a parent.
//
// ── The rule ───────────────────────────────────────────────────────────────
//
// India's DPDP Act 2023 §9 defines a child as anyone under EIGHTEEN — not
// thirteen, not sixteen — and forbids processing their personal data without
// verifiable consent from a parent or lawful guardian. It also forbids tracking
// and behavioural monitoring directed at children.
//
// A clinic sees children constantly. This is not an edge case to be handled
// later; it is a normal Tuesday.
//
// ── What this actually changes, and what it does not ───────────────────────
//
// The phone number on a child's record was ALREADY a guardian's — a seven-year
// old has no phone, and whoever registered them typed their own. So nothing
// about messaging needs to move. What was missing was the record: whose number
// it is, who consented, and that they were told they were consenting FOR the
// child. That is what is captured now.
//
// ── The honest limit ───────────────────────────────────────────────────────
//
// "Verifiable" is doing a lot of work in the Act, and nothing here proves that
// the person holding the phone is the child's parent. What it does prove is
// that somebody with that number was shown the notice, said yes on behalf of a
// named child, and named their own relationship to them — and that all of it is
// recorded against a notice version, so it can be produced later.
//
// That is the same standard the rest of this platform's consent meets, and it
// is the strongest available without asking a clinic to collect birth
// certificates at a front desk. Where the Act asks for more, it asks for more
// than a booking system can give, and pretending otherwise in code would be
// worse than saying so here.

/** DPDP's definition, not a product choice. */
export const CHILD_AGE_LIMIT = 18;

/**
 * PURE: is this patient a child under the Act?
 *
 * An unrecorded age returns FALSE, and that deserves saying out loud rather
 * than hiding: we cannot gate on a fact we do not have. The alternative —
 * treating every ageless record as a child — would demand guardian details for
 * every walk-in whose age nobody typed, which is most of them, and clinics would
 * route around it within a day.
 *
 * The mitigation is upstream: registration asks for an age, and the child
 * questions follow from the answer.
 */
export const isChild = (age: number | null | undefined): boolean =>
  typeof age === 'number' && Number.isFinite(age) && age >= 0 && age < CHILD_AGE_LIMIT;

/** How a guardian may describe themselves. Free text is not offered: this ends up in a consent record. */
export const GUARDIAN_RELATIONS = ['mother', 'father', 'guardian'] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

/** PURE: normalise what arrived, or null if it is not one of ours. */
export const guardianRelation = (raw: unknown): GuardianRelation | null => {
  const v = String(raw ?? '').trim().toLowerCase();
  return (GUARDIAN_RELATIONS as readonly string[]).includes(v) ? (v as GuardianRelation) : null;
};

export interface ChildGuardian {
  name: string;
  relation: GuardianRelation;
}

/**
 * PURE: what a registration must carry for this age, or why it cannot proceed.
 *
 * Returns the guardian to store, `null` when the patient is an adult and none is
 * needed, or throws a message written for the person filling the form.
 */
export const guardianRequiredFor = (
  age: number | null | undefined,
  input: { guardianName?: unknown; guardianRelation?: unknown }
): ChildGuardian | null => {
  if (!isChild(age)) return null;

  const name = String(input.guardianName ?? '').trim();
  const relation = guardianRelation(input.guardianRelation);

  if (!name || !relation) {
    // One message covering both, because the form asks for them together and
    // two separate refusals in sequence is a worse experience than one.
    throw new Error(
      `A patient under ${CHILD_AGE_LIMIT} needs a parent or guardian's name and relationship — the law requires their consent, not the child's.`
    );
  }
  return { name, relation };
};

/**
 * PURE: the evidence line stored against the child's consent.
 *
 * Written to be readable years later by someone who was not there, which is the
 * only situation in which anybody reads a consent record.
 */
export const childConsentEvidence = (guardian: ChildGuardian, childName: string): string =>
  `Given by ${guardian.name} (${guardian.relation}) on behalf of ${childName}, a patient under ${CHILD_AGE_LIMIT}.`;
