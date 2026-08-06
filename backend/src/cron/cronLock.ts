// Leader election for the scheduled jobs.
//
// Five crons run inside the API process. With one instance that is fine; with
// two, every tick fires twice — two reminder messages to the same patient, two
// auto-complete sweeps, two thank-yous. So each tick takes a short LEASE first
// and only the holder runs.
//
// The lease EXPIRES rather than being released. An instance that is killed
// mid-tick (a deploy, an OOM) cannot wedge the job forever: the next tick past
// the expiry reclaims it. That is also why the lease must comfortably exceed the
// job's normal runtime — a lease shorter than the work would let a second
// instance start the same job while the first is still going.
//
// Correctness does not rest on this alone. The jobs it guards are individually
// idempotent (completeAppointment is race-guarded, reminders claim their row
// before sending), so a rare overlap degrades to wasted work rather than
// duplicate patient messages.

import { randomUUID } from 'crypto';

import { prisma } from '../config/prisma.js';

// Identifies THIS process in the lock row. Only useful for diagnosis — the
// expiry, not the holder, is what makes the lease safe.
const HOLDER = `${process.pid}-${randomUUID().slice(0, 8)}`;

export const lockHolderId = (): string => HOLDER;

/**
 * Try to take the lease for `name` for `leaseMs`.
 *
 * Acquisition is a single conditional UPDATE — "take it if it is unheld or
 * expired" — so two instances racing cannot both succeed: Postgres serialises
 * the row update and the loser matches zero rows.
 */
export const acquireCronLock = async (
  name: string,
  leaseMs: number,
  now: Date = new Date()
): Promise<boolean> => {
  const expiresAt = new Date(now.getTime() + leaseMs);
  try {
    // updateMany (not update) so a non-match is a count of 0 rather than a throw.
    const { count } = await prisma.cronLock.updateMany({
      where: { name, expiresAt: { lte: now } },
      data: { holder: HOLDER, acquiredAt: now, expiresAt }
    });
    if (count > 0) return true;

    // No row yet — first ever run of this job on this database. create() races
    // safely: the primary key means exactly one instance can win.
    try {
      await prisma.cronLock.create({ data: { name, holder: HOLDER, acquiredAt: now, expiresAt } });
      return true;
    } catch {
      return false; // someone else created it first, or it is genuinely held
    }
  } catch (err) {
    // FAIL-CLOSED. A lock we cannot read is not a lock we can trust, and the
    // cost of skipping one tick is a few minutes' delay; the cost of assuming
    // leadership wrongly is duplicate messages to real patients.
    console.error(`[cron:${name}] lock unavailable — skipping this tick:`, err);
    return false;
  }
};

/** Release early so the next tick isn't delayed by the rest of the lease. */
export const releaseCronLock = async (name: string): Promise<void> => {
  try {
    // Only if WE still hold it — an expired lease may already belong to someone
    // else, and releasing theirs would let a third instance in.
    await prisma.cronLock.updateMany({
      where: { name, holder: HOLDER },
      data: { expiresAt: new Date(0) }
    });
  } catch (err) {
    console.error(`[cron:${name}] release failed (lease will expire on its own):`, err);
  }
};

/**
 * Run `job` only if this instance wins the lease. Always releases.
 * @returns true if it ran here, false if another instance holds the lease.
 */
export const withCronLock = async (
  name: string,
  leaseMs: number,
  job: () => Promise<void>
): Promise<boolean> => {
  if (!(await acquireCronLock(name, leaseMs))) return false;
  try {
    await job();
  } finally {
    await releaseCronLock(name);
  }
  return true;
};
