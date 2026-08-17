// Writing the audit trail.
//
// Three rules govern everything in this file:
//
//  1. An audit write NEVER fails the user's request. A clinic must not lose a
//     booking because the audit table was briefly unreachable. Every path here
//     swallows its own errors and reports them to the application log.
//
//  2. An audit write is never awaited by a request handler. `record()` returns
//     void and runs in the background; `recordAndWait()` exists only for tests.
//
//  3. Nothing clinical is stored. Callers pass ids; metadata is redacted before
//     it reaches the database (audit.redact.ts).
//
// Raw prisma on purpose: the writer must be able to record a FAILED_LOGIN, which
// happens before any clinic is known, and it supplies clinicId itself when there
// is one. Reads go through the tenant-scoped client (audit.routes.ts).

import type { Request } from 'express';

import { prisma } from '../../config/prisma.js';
import type { ActorType, AuditAction, AuditOutcome } from './audit.actions.js';
import { redactMetadata } from './audit.redact.js';
import { hashEntry, type HashableEntry } from './audit.hash.js';

export interface AuditEntry {
  action: AuditAction;
  clinicId?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
  actorRole?: string | null;
  actorName?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  patientId?: string | null;
  outcome?: AuditOutcome;
  /** Short machine-readable reason, mainly for `denied` and `failure`. */
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** The request-derived fields, pulled out once so call sites stay short. */
export const auditContext = (req: Request): Pick<AuditEntry, 'clinicId' | 'actorId' | 'actorRole' | 'ip' | 'userAgent' | 'requestId' | 'actorType'> => ({
  clinicId: req.user?.clinicId ?? req.apiKey?.clinicId ?? null,
  actorId: req.user?.userId ?? req.apiKey?.id ?? null,
  actorType: req.user ? 'user' : req.apiKey ? 'api_key' : 'anonymous',
  actorRole: req.user?.role ?? null,
  // Behind Railway's proxy `req.ip` is the real client because app.set('trust
  // proxy', 1) is configured. User-Agent is capped: it is attacker-controlled
  // and unbounded.
  ip: req.ip ?? null,
  userAgent: (req.headers['user-agent'] || '').toString().slice(0, 300) || null,
  requestId: req.requestId ?? null
});

/** The most recent row for a clinic, whose hash the next row chains from. */
const previousHash = async (clinicId: string | null | undefined): Promise<string | null> => {
  const prev = await prisma.auditLog.findFirst({
    where: { clinicId: clinicId ?? null },
    orderBy: { createdAt: 'desc' },
    select: { hash: true }
  });
  return prev?.hash ?? null;
};

/**
 * Write one audit row. Awaitable, but only tests should await it — request
 * handlers use `record()`.
 */
export const recordAndWait = async (entry: AuditEntry): Promise<void> => {
  const createdAt = new Date();
  const metadata = redactMetadata(entry.metadata);

  const hashable: HashableEntry = {
    clinicId: entry.clinicId ?? null,
    actorId: entry.actorId ?? null,
    actorType: entry.actorType ?? 'user',
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    resourceType: entry.resourceType ?? null,
    resourceId: entry.resourceId ?? null,
    patientId: entry.patientId ?? null,
    outcome: entry.outcome ?? 'success',
    reason: entry.reason ?? null,
    metadata: metadata ?? null,
    createdAt
  };

  const prevHash = await previousHash(entry.clinicId);

  await prisma.auditLog.create({
    data: {
      ...hashable,
      metadata: metadata ?? undefined,
      actorName: entry.actorName ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
      prevHash,
      hash: hashEntry(hashable, prevHash),
      createdAt
    }
  });
};

/**
 * Fire-and-forget audit write — the form every request handler should use.
 *
 * Returns void, not a promise, so it cannot accidentally be awaited into the
 * request's critical path, and so a forgotten `.catch` can never produce an
 * unhandled rejection.
 */
export const record = (entry: AuditEntry): void => {
  void recordAndWait(entry).catch((err) => {
    // Losing an audit row is a real problem, so it is loud in the application
    // log — but it is not the user's problem, so it stops here.
    console.error('[audit] failed to record', entry.action, err);
  });
};

/** `record()` with the request-derived fields already filled in. */
export const recordFromRequest = (req: Request, entry: AuditEntry): void =>
  record({ ...auditContext(req), ...entry });
