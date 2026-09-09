// How long this platform keeps things, and why.
//
// ── The rule that shapes all of this ───────────────────────────────────────
//
// DPDP §8(7) says erase personal data once the purpose it was collected for is
// served, and the DPDP Rules add erasure after a defined period of inactivity.
// Read alone, that argues for deleting a great deal.
//
// It does not stand alone. A clinic is under statutory obligations to KEEP
// clinical records — the Indian Medical Council's regulations set three years
// for an indoor record, longer where a case is in dispute, and longer again for
// a patient who was a minor at the time. Where those two collide, retention
// wins: DPDP's erasure right yields to a legal obligation to retain.
//
// So this file draws one line and defends it:
//
//   OPERATIONAL data — how a message was delivered, which webhook fired, what
//   a rate counter said — ages out automatically, because nothing turns on it
//   after a few weeks and keeping it forever is exactly what §8(7) forbids.
//
//   CLINICAL data — a patient, a visit, a consultation note, a prescription,
//   a consent — is NEVER deleted by a job. An erasure request for one goes
//   through core/rights, where a human decides in writing, because deleting a
//   record the clinic is required to keep is a worse and less reversible
//   failure than keeping one it could have deleted.
//
// ── Two periods that are floors, not choices ───────────────────────────────
//
// AuditLog and SecurityAlert are kept for a year at minimum: the DPDP Rules
// require a year of logs for breach investigation. Shortening either is not a
// tuning decision, it is a compliance one.
//
// ── Everything here is deliberate, including the absences ──────────────────
//
// A table missing from this list is not an oversight to be tidied up later. It
// is either clinical (and named below as such) or it does not grow. Adding a
// sweep for one of them should require the same argument these did.

/** One entry per table we age out, with the reason in the file rather than a commit. */
export interface RetentionRule {
  /** Prisma model name, as the delegate is spelled. */
  model: string;
  /** The date column age is measured from. */
  field: string;
  days: number;
  /** Why THIS long. Read by whoever next wonders if it can be shortened. */
  why: string;
}

const DAY = 24 * 60 * 60 * 1000;

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    model: 'processedInboundMessage',
    field: 'processedAt',
    days: 7,
    why: 'Only exists to reject a duplicate webhook. Meta retries for minutes, not days.'
  },
  {
    model: 'idempotencyKey',
    field: 'createdAt',
    days: 7,
    why: 'Same shape of promise to an API caller, over the same kind of window.'
  },
  {
    model: 'whatsAppSendCounter',
    field: 'updatedAt',
    days: 7,
    why: 'A per-day send counter. Yesterday-but-one has nothing left to say.'
  },
  {
    model: 'emailOtp',
    field: 'createdAt',
    days: 2,
    why: 'A code valid for minutes. Anything older is a row nobody can use, including us.'
  },
  {
    model: 'webhookDelivery',
    field: 'createdAt',
    days: 30,
    why: 'Long enough for an integrator to ask why a delivery failed, and no longer.'
  },
  {
    model: 'whatsAppSession',
    field: 'updatedAt',
    days: 30,
    why: 'Where a conversation had got to. A month-old booking half-finished is abandoned.'
  },
  {
    model: 'conversationSession',
    field: 'updatedAt',
    days: 30,
    why: 'As above, for the other conversation surface.'
  },
  {
    model: 'notification',
    field: 'createdAt',
    days: 90,
    why: 'A dashboard alert nobody acted on in three months is not going to be acted on.'
  },
  {
    // The single judgement call here, and the one worth arguing with. A message
    // BODY can quote a health concern, which makes this the most personal thing
    // in the list — an argument for going shorter. Against that: it is the only
    // record of what a patient was actually told, and a dispute about a missed
    // appointment surfaces weeks later. Six months is the compromise, and it is
    // shorter than everything clinical for exactly that reason.
    model: 'whatsAppLog',
    field: 'createdAt',
    days: 180,
    why: 'The only record of what a patient was told; balanced against message bodies quoting health concerns.'
  },
  {
    model: 'aiMessage',
    field: 'createdAt',
    days: 180,
    why: 'Conversation transcript, not a clinical note. The booking it produced is kept separately, forever.'
  },
  {
    model: 'securityAlert',
    field: 'createdAt',
    days: 400,
    why: 'FLOOR, not a choice: the DPDP Rules require a year of logs for breach investigation.'
  },
  {
    model: 'auditLog',
    field: 'createdAt',
    days: 1095,
    why: 'Three years. The breach-investigation floor is one; this is also the trail behind a rights request, which a patient may raise long afterwards.'
  }
];

/**
 * Tables a job MUST NOT touch, and the reason, so that a future sweep written
 * in a hurry has to argue with this list first.
 */
export const NEVER_AUTO_DELETED: Readonly<Record<string, string>> = {
  patient: 'The clinical record itself. Erasure goes through core/rights, decided by a person.',
  appointment: 'A visit that happened. Statutory retention applies and the clinic, not us, answers for it.',
  consultationNote: 'Clinical. Deleting one is not recoverable and may be unlawful.',
  novaDoc: 'Clinical documents and prescriptions.',
  patientEvent: 'The patient timeline — the thread a clinician reads a history from.',
  patientConsent: 'The proof consent was given. Deleting it destroys the defence, not the liability.',
  patientRightsRequest: 'The record of what a patient asked for and what was decided.',
  reminder: 'Evidence a patient was told about their appointment.',
  medicineReminder: 'Attached to a live prescription.',
  aiConversation: 'The thread AiMessage rows hang from; kept so a cleared conversation is not orphaned.'
};

/** PURE: the cut-off for a rule, given when the sweep runs. */
export const cutoffFor = (rule: RetentionRule, now: Date = new Date()): Date =>
  new Date(now.getTime() - rule.days * DAY);

/**
 * PURE: a rule is only usable if it names a table we are allowed to age out.
 *
 * Exported for the test that runs it over every rule — the failure this guards
 * against is somebody adding `patient` to RETENTION_RULES, which would delete
 * clinical records nightly and pass every other test in the suite.
 */
export const ruleIsAllowed = (rule: RetentionRule): boolean =>
  !Object.prototype.hasOwnProperty.call(NEVER_AUTO_DELETED, rule.model);
