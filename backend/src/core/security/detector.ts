// Turning audit rows into alerts somebody actually sees.
//
// Phase 2 wrote the trail. Phase 5 reads it — because a trail nobody reads is a
// forensic tool, not a detection one, and CERT-In's six-hour clock starts when
// an incident is NOTICED. Nothing here shortens that clock by itself; what it
// does is make "noticed" happen within minutes of the event instead of whenever
// someone next opens a dashboard.
//
// Three deliberate properties:
//
//   IT NEVER ALERTS TWICE for the same burst. dedupeKey is rule + subject +
//   window, uniquely indexed, and a duplicate insert is swallowed. An alerting
//   system that repeats itself gets filtered into a folder nobody opens.
//
//   IT NEVER THROWS INTO THE CRON. A detection failure is logged and the scan
//   moves on; the alternative is a scanner that dies on one malformed row and
//   stops watching everything else.
//
//   IT WRITES BEFORE IT SENDS. The row exists even if email is unconfigured or
//   the provider is down, so the evidence survives a delivery failure — and
//   `notifiedAt` being null is itself the signal that delivery failed.

import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { isEmailConfigured, sendSecurityAlertEmail } from '../../services/email.service.js';
import { DEFAULT_THRESHOLDS, evaluate, type AuditRow, type Finding, type Thresholds } from './rules.js';

/**
 * How far back each scan looks.
 *
 * Must be at least as long as the interval between scans, or events falling
 * between two windows are never examined. It is deliberately a little LONGER
 * than the interval (see the cron), so windows overlap and nothing slips
 * through a scheduling wobble — the dedupe key is what stops the overlap
 * producing duplicate alerts.
 */
export const WINDOW_MINUTES = 15;

/** Thresholds, overridable per deployment without touching the rules. */
const thresholds = (): Thresholds => ({
  failedLogins: Number(process.env.ALERT_FAILED_LOGINS) || DEFAULT_THRESHOLDS.failedLogins,
  denials: Number(process.env.ALERT_DENIALS) || DEFAULT_THRESHOLDS.denials,
  patientReads: Number(process.env.ALERT_PATIENT_READS) || DEFAULT_THRESHOLDS.patientReads,
  recordingReads: Number(process.env.ALERT_RECORDING_READS) || DEFAULT_THRESHOLDS.recordingReads,
  destructive: Number(process.env.ALERT_DESTRUCTIVE) || DEFAULT_THRESHOLDS.destructive
});

/** Where alerts are emailed. Blank disables email; rows are still written. */
const alertRecipient = (): string => (process.env.SECURITY_ALERT_EMAIL || '').trim();

export interface ScanResult {
  scanned: number;
  found: number;
  raised: number;
  notified: number;
}

/**
 * Persist a finding, unless the same burst already alerted.
 *
 * Returns the row when it is NEW, null when it was a duplicate. The uniqueness
 * of dedupeKey is what makes this safe to call from overlapping windows and
 * from two instances at once.
 */
const raise = async (finding: Finding, windowStart: Date, windowEnd: Date) => {
  try {
    return await prisma.securityAlert.create({
      data: {
        clinicId: finding.clinicId,
        rule: finding.rule,
        severity: finding.severity,
        subject: finding.subject,
        count: finding.count,
        summary: finding.summary,
        detail: finding.detail as Prisma.InputJsonValue,
        windowStart,
        windowEnd,
        dedupeKey: finding.dedupeKey
      }
    });
  } catch (err) {
    // P2002 = unique violation on dedupeKey: this burst already alerted, which
    // is the intended outcome, not an error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    console.error('[security] could not record alert', finding.rule, err);
    return null;
  }
};

/**
 * One scan of the recent audit trail.
 *
 * Reads with the RAW client on purpose: this looks across every clinic, exactly
 * like the reminder and waitlist crons, and the rows it needs most (failed
 * sign-ins) have no clinic at all.
 */
export const scanForIncidents = async (now: Date = new Date()): Promise<ScanResult> => {
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60_000);

  const rows = (await prisma.auditLog.findMany({
    where: { createdAt: { gte: windowStart, lte: now } },
    select: {
      id: true,
      clinicId: true,
      actorId: true,
      actorRole: true,
      action: true,
      outcome: true,
      patientId: true,
      resourceId: true,
      ip: true,
      metadata: true,
      createdAt: true
    },
    // A ceiling, so one pathological window cannot pull the whole table into
    // memory. If it is ever hit, the count in the log says so.
    take: 20_000
  })) as unknown as AuditRow[];

  const findings = evaluate(rows, windowStart, thresholds());

  let raised = 0;
  let notified = 0;

  for (const finding of findings) {
    const row = await raise(finding, windowStart, now);
    if (!row) continue;
    raised++;

    // LOUD in the application log regardless of email — this is the one place a
    // console.error is the point rather than a fallback.
    console.error(`[security][${finding.severity}] ${finding.rule}: ${finding.summary}`);

    const to = alertRecipient();
    if (!to || !isEmailConfigured()) continue;

    try {
      await sendSecurityAlertEmail(to, {
        severity: finding.severity,
        rule: finding.rule,
        summary: finding.summary,
        subject: finding.subject,
        windowStart,
        windowEnd: now,
        alertId: row.id
      });
      await prisma.securityAlert.update({ where: { id: row.id }, data: { notifiedAt: new Date() } });
      notified++;
    } catch (err) {
      // The row survives with notifiedAt null, which is exactly how an
      // undelivered alert is found later.
      console.error('[security] alert email failed to send', finding.rule, err);
    }
  }

  if (rows.length >= 20_000) {
    console.warn(`[security] scan hit the ${20_000}-row ceiling — the window may be under-examined.`);
  }

  return { scanned: rows.length, found: findings.length, raised, notified };
};
