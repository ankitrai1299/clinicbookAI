// The vocabulary of auditable actions. PURE — no imports.
//
// A closed list, not free-form strings, for one reason: an audit trail is only
// useful if you can ask it a question. "Show me everyone who opened a recording"
// works when the action is always spelled RECORDING_ACCESSED and breaks the day
// somebody writes 'recording_access'. TypeScript enforces the spelling at every
// call site.

export const AUDIT_ACTIONS = [
  // ── Authentication ──────────────────────────────────────────────
  'LOGIN',
  'LOGOUT',
  'FAILED_LOGIN',
  'AUTHORIZATION_DENIED',

  // ── Patients ────────────────────────────────────────────────────
  'PATIENT_VIEWED',
  'PATIENT_LIST_VIEWED',
  'PATIENT_CREATED',
  'PATIENT_UPDATED',
  'PATIENT_DELETED',

  // ── Appointments ────────────────────────────────────────────────
  'APPOINTMENT_CREATED',
  'APPOINTMENT_UPDATED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_COMPLETED',

  // ── Consultation recording ──────────────────────────────────────
  'RECORDING_STARTED',
  'RECORDING_UPLOADED',
  'RECORDING_ACCESSED',
  'RECORDING_DELETED',

  // ── AI ──────────────────────────────────────────────────────────
  // What the model produced, and when. The output itself is NOT here — it is
  // stored in the clinical record and referenced by id + hash.
  'AI_TRANSCRIPT_GENERATED',
  'AI_SUMMARY_GENERATED',
  'AI_PRESCRIPTION_DRAFT_CREATED',

  // ── Prescriptions ───────────────────────────────────────────────
  // APPROVED is the moment a human doctor finalises the note. It is the single
  // most important row in this table: everything before it is a draft, and
  // nothing may be sent without it.
  'PRESCRIPTION_UPDATED',
  'PRESCRIPTION_APPROVED',
  'PRESCRIPTION_SENT',

  // ── Documents ───────────────────────────────────────────────────
  'DOCUMENT_ACCESSED',
  'DOCUMENT_DOWNLOADED',

  // ── Consent (Phase 1 owns the mechanism; the actions are reserved here so
  //    the vocabulary does not fork when that phase lands) ─────────
  'CONSENT_GRANTED',
  'CONSENT_WITHDRAWN',

  // ── Administration ──────────────────────────────────────────────
  'USER_CREATED',
  // Second factor and session revocation (Phase 3).
  'MFA_ENABLED',
  'MFA_DISABLED',
  'SESSIONS_REVOKED',
  'CLINIC_SETTINGS_UPDATED',
  'API_KEY_CREATED',
  'API_KEY_REVOKED',
  'AUDIT_LOG_VIEWED'
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Who or what performed the action. */
export type ActorType = 'user' | 'system' | 'ai' | 'api_key' | 'patient' | 'anonymous';

/**
 * `denied` is distinct from `failure` on purpose: a refused authorization is a
 * security signal, while a failure is usually a bug or a bad request. Alerting
 * wants to treat them differently.
 */
export type AuditOutcome = 'success' | 'failure' | 'denied';
