// What counts as suspicious. PURE — no imports, no database, no clock.
//
// Phase 2 made these events visible; this decides which patterns are worth
// waking someone for. Getting that balance right IS the feature: an alert that
// fires on ordinary Monday-morning work is an alert that gets muted, and a muted
// alert is worse than none because it looks like coverage.
//
// So every rule here answers three questions in its comment — what real attack
// or mistake it catches, what innocent behaviour looks similar, and why the
// threshold separates them. A rule that cannot answer those does not belong.
//
// Thresholds are inputs, not constants, so they can be tuned per deployment
// without editing logic (see detector.ts for where they come from).

export type Severity = 'low' | 'medium' | 'high';

/** The subset of an audit row these rules read. */
export interface AuditRow {
  id: string;
  clinicId: string | null;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  outcome: string;
  patientId: string | null;
  resourceId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface Finding {
  /** Stable id for this rule + subject + window, so the same burst alerts once. */
  dedupeKey: string;
  rule: string;
  severity: Severity;
  clinicId: string | null;
  /** Who or what this is about: an email, an actor id, an IP. */
  subject: string;
  count: number;
  /** One sentence a person can act on, with no clinical or personal content. */
  summary: string;
  detail: Record<string, string | number>;
}

export interface Thresholds {
  /** Failed sign-ins against one email before it reads as an attack. */
  failedLogins: number;
  /** Refused requests by one actor before it reads as probing. */
  denials: number;
  /** Distinct patients one actor may open before it reads as a sweep. */
  patientReads: number;
  /** Recordings one actor may open before it reads as a sweep. */
  recordingReads: number;
  /** Destructive actions by one actor before it reads as a rampage. */
  destructive: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  // A person who has forgotten their password tries three or four times and
  // then uses the reset flow. Ten failures against ONE email in the window is
  // not a forgetful human.
  failedLogins: 10,
  // A stuck receptionist hits one or two refusals and calls the clinic admin.
  // Fifteen means something is walking the API.
  denials: 15,
  // A busy front desk opens perhaps twenty patient records in a morning, and
  // the window here is minutes, not hours. Thirty distinct patients inside one
  // window is not a person doing their job.
  patientReads: 30,
  // Recordings are opened one at a time, by the doctor who made them, while
  // writing a note. Five in a window is already unusual.
  recordingReads: 5,
  // Deleting a patient or a recording is rare and deliberate. Three in one
  // window is either a mistake in progress or someone covering their tracks —
  // both worth interrupting.
  destructive: 3
};

/** Actions that destroy something a patient or a clinic would want back. */
const DESTRUCTIVE = new Set(['PATIENT_DELETED', 'RECORDING_DELETED', 'API_KEY_REVOKED', 'CONSENT_WITHDRAWN']);

/** Group rows by a key, dropping rows with no key. */
const groupBy = <T>(rows: T[], key: (row: T) => string | null | undefined): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
};

const windowKey = (windowStart: Date): string => windowStart.toISOString().slice(0, 16);

/**
 * Evaluate every rule against one window of audit rows.
 *
 * Rows must already be limited to the window. Returns findings, not alerts —
 * whether a finding becomes an alert (deduplication, delivery) is the caller's
 * concern, so this stays a pure function of its inputs.
 */
export const evaluate = (
  rows: AuditRow[],
  windowStart: Date,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Finding[] => {
  const findings: Finding[] = [];
  const w = windowKey(windowStart);

  // ── Failed sign-ins against one email ────────────────────────────────────
  //
  // Catches: credential stuffing, and a targeted guess at a known clinic admin.
  // Looks like: a person who changed their password and forgot.
  // Separated by: counting per EMAIL, not per IP. A forgetful human retries a
  // handful of times from one place; an attack produces a burst against one
  // email, often from several.
  const failed = rows.filter((r) => r.action === 'FAILED_LOGIN');
  for (const [email, hits] of groupBy(failed, (r) => String(r.metadata?.email ?? ''))) {
    if (hits.length < thresholds.failedLogins) continue;
    const ips = new Set(hits.map((h) => h.ip).filter(Boolean));
    findings.push({
      dedupeKey: `failed_logins:${email}:${w}`,
      rule: 'failed_logins',
      severity: ips.size > 1 ? 'high' : 'medium',
      clinicId: null,
      subject: email,
      count: hits.length,
      summary:
        `${hits.length} failed sign-ins for ${email}` +
        (ips.size > 1 ? ` from ${ips.size} different addresses` : '') +
        '. Possible password guessing.',
      detail: { failures: hits.length, distinctIps: ips.size }
    });
  }

  // ── Refused requests by one actor ────────────────────────────────────────
  //
  // Catches: someone with a valid session walking the API for something they
  // are not allowed to reach — the shape of a compromised account being
  // explored, or an insider testing the edges.
  // Looks like: a receptionist whose role was changed and whose UI has not
  // caught up.
  // Separated by: volume. The honest case produces a couple of refusals and
  // then a phone call.
  const denied = rows.filter((r) => r.action === 'AUTHORIZATION_DENIED');
  for (const [actor, hits] of groupBy(denied, (r) => r.actorId)) {
    if (hits.length < thresholds.denials) continue;
    const routes = new Set(hits.map((h) => h.resourceId).filter(Boolean));
    findings.push({
      dedupeKey: `denials:${actor}:${w}`,
      rule: 'denials',
      severity: routes.size > 3 ? 'high' : 'medium',
      clinicId: hits[0]?.clinicId ?? null,
      subject: actor,
      count: hits.length,
      summary:
        `${hits.length} refused requests from one account across ${routes.size} endpoints. ` +
        'Either a role change nobody told the user about, or an account being probed.',
      detail: { refusals: hits.length, distinctRoutes: routes.size }
    });
  }

  // ── One actor reading many patients ──────────────────────────────────────
  //
  // Catches: the exfiltration case — an account quietly pulling the patient
  // base. This is the single most damaging thing that can happen quietly, and
  // before Phase 2 it left no trace at all.
  // Looks like: a busy clinic morning.
  // Separated by: DISTINCT patients inside a short window. Reception opens the
  // same few records repeatedly; a sweep opens many different ones once.
  const reads = rows.filter((r) => r.action === 'PATIENT_VIEWED' && r.outcome === 'success');
  for (const [actor, hits] of groupBy(reads, (r) => r.actorId)) {
    const distinct = new Set(hits.map((h) => h.patientId).filter(Boolean));
    if (distinct.size < thresholds.patientReads) continue;
    findings.push({
      dedupeKey: `patient_sweep:${actor}:${w}`,
      rule: 'patient_sweep',
      severity: 'high',
      clinicId: hits[0]?.clinicId ?? null,
      subject: actor,
      count: distinct.size,
      summary:
        `One account opened ${distinct.size} different patient records in a few minutes. ` +
        'Check whether this is an export nobody asked for.',
      detail: { distinctPatients: distinct.size, reads: hits.length }
    });
  }

  // ── One actor opening many recordings ────────────────────────────────────
  //
  // Catches: the same shape as above, against the most sensitive thing we hold.
  // Looks like: a doctor reviewing a day's visits.
  // Separated by: a low threshold, on purpose. Recordings are opened while
  // writing one note; a handful in minutes is worth a look even when innocent.
  const recordings = rows.filter((r) => r.action === 'RECORDING_ACCESSED');
  for (const [actor, hits] of groupBy(recordings, (r) => r.actorId)) {
    if (hits.length < thresholds.recordingReads) continue;
    findings.push({
      dedupeKey: `recording_sweep:${actor}:${w}`,
      rule: 'recording_sweep',
      severity: 'high',
      clinicId: hits[0]?.clinicId ?? null,
      subject: actor,
      count: hits.length,
      summary: `One account played ${hits.length} consultation recordings in a few minutes.`,
      detail: { recordings: hits.length }
    });
  }

  // ── Destructive actions in a burst ───────────────────────────────────────
  //
  // Catches: a mistake in progress (a bulk delete nobody meant), and the
  // clean-up phase of an intrusion.
  // Looks like: a clinic genuinely tidying old records.
  // Separated by: nothing reliable — which is why this is MEDIUM and phrased as
  // a question. It is meant to prompt a look, not an incident.
  const destroyed = rows.filter((r) => DESTRUCTIVE.has(r.action) && r.outcome === 'success');
  for (const [actor, hits] of groupBy(destroyed, (r) => r.actorId)) {
    if (hits.length < thresholds.destructive) continue;
    const kinds = new Set(hits.map((h) => h.action));
    findings.push({
      dedupeKey: `destructive_burst:${actor}:${w}`,
      rule: 'destructive_burst',
      severity: 'medium',
      clinicId: hits[0]?.clinicId ?? null,
      subject: actor,
      count: hits.length,
      summary: `One account performed ${hits.length} destructive actions (${[...kinds].join(', ')}). Was this intended?`,
      detail: { actions: hits.length, kinds: [...kinds].join(',') }
    });
  }

  // Highest severity first: whoever reads this list has limited attention and
  // the top of it should be the thing that matters.
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
};
