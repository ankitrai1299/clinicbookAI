// Reports that outlive their HTTP request.
//
// ── Why ───────────────────────────────────────────────────────────────────
//
// A report was generated inside the POST that asked for it, so the doctor's
// browser had to hold a connection open for the whole thing. That works until
// the consultation is long: measured on a four-and-a-half minute one, the
// request died at 186 seconds with nothing to show. Making the work faster
// bought room — a ten minute consultation now finishes in about 85 seconds —
// but it only moved the wall. A twenty-five minute visit will reach it again,
// and a doctor who talks for twenty-five minutes is not doing anything wrong.
//
// So the request no longer waits. It starts the work, returns an id, and the
// client asks how it is going. The report is then limited by how long it takes,
// not by how long a browser, a proxy and a mobile network will all agree to
// hold one connection open — three timeouts we do not control and which a
// phone on a train breaks for reasons of its own.
//
// ── What this deliberately is not ─────────────────────────────────────────
//
// Jobs live in memory, not in the database. That is a real limitation and it is
// stated rather than hidden: a redeploy in the middle of a consultation's report
// loses that job, and the doctor has to press the button again. It is survivable
// because the transcript — the part that cannot be recreated — is already safe
// on the client and in the consultation record; only the retry is lost.
//
// The alternative costs a table and a migration on a live clinical database, and
// it buys nothing until the backend runs on more than one instance, at which
// point a poll can land on a machine that never saw the job. That is the moment
// to move this into Postgres, and it is written down here so the next person
// meets the reason rather than the surprise.

import { randomUUID } from 'crypto';

export type ReportJobStatus = 'running' | 'done' | 'failed';

export interface ReportJob {
  id: string;
  status: ReportJobStatus;
  report?: unknown;
  error?: string;
  /** Who may read it. A report is a patient's record, not a job queue entry. */
  clinicId: string | null;
  userId: string | null;
  createdAt: number;
  finishedAt?: number;
}

/** How long a finished report stays collectable. Long enough for a phone that
 *  lost signal mid-consultation to come back and still find it. */
const KEEP_FINISHED_MS = 30 * 60 * 1000;
/** A job still "running" after this is not running; nothing takes half an hour. */
const ABANDON_RUNNING_MS = 30 * 60 * 1000;
/** A ceiling, so a bug in the caller cannot grow this without limit. */
const MAX_JOBS = 200;

const jobs = new Map<string, ReportJob>();

/** Drop what nobody can collect any more, oldest first if we are still over. */
function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const age = now - (job.finishedAt ?? job.createdAt);
    const stale = job.status === 'running' ? age > ABANDON_RUNNING_MS : age > KEEP_FINISHED_MS;
    if (stale) jobs.delete(id);
  }
  if (jobs.size <= MAX_JOBS) return;
  const byAge = [...jobs.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [id] of byAge.slice(0, jobs.size - MAX_JOBS)) jobs.delete(id);
}

/**
 * Start `work` and return the id to ask about it with.
 *
 * `work` runs detached from the request. Anything it needs from the request —
 * the clinic, the user — must already be captured by the caller, because the
 * AsyncLocalStorage the request put them in is gone by the time this resolves.
 * That is not theoretical: the same mistake, made in a script, wrote a doctor's
 * account and then threw on the step after it.
 */
export function startReportJob(
  owner: { clinicId: string | null; userId: string | null },
  work: () => Promise<unknown>,
): string {
  sweep();
  const id = randomUUID();
  const job: ReportJob = { id, status: 'running', createdAt: Date.now(), ...owner };
  jobs.set(id, job);

  void work().then(
    (report) => {
      job.report = report;
      job.status = 'done';
      job.finishedAt = Date.now();
    },
    (err: any) => {
      job.error = err?.message || 'Report generation failed';
      job.status = 'failed';
      job.finishedAt = Date.now();
    },
  );

  return id;
}

/**
 * Read a job, but only for the clinic that started it.
 *
 * An unknown id and another clinic's id are both reported as "not found", so a
 * caller cannot learn that someone else's report exists by asking for it.
 */
export function readReportJob(
  id: string,
  asker: { clinicId: string | null; userId: string | null },
): ReportJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.clinicId !== asker.clinicId) return null;
  return job;
}

/** Test seam. */
export function _resetReportJobs(): void {
  jobs.clear();
}
