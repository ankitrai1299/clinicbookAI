// The compliance audit trail: who did what, to which patient, when, and whether
// it succeeded.
//
// See audit.actions.ts for the vocabulary, audit.redact.ts for what may be
// stored, audit.hash.ts for tamper evidence, and audit.service.ts for writing.
// Reading is a route (audit.routes.ts) gated on the `audit.read` permission.

export { AUDIT_ACTIONS, type AuditAction, type ActorType, type AuditOutcome } from './audit.actions.js';
export { record, recordAndWait, recordFromRequest, auditContext, type AuditEntry } from './audit.service.js';
export { redactMetadata, maskPhone } from './audit.redact.js';
export { verifyChain, hashEntry, canonicalise, type ChainRow, type ChainProblem } from './audit.hash.js';
