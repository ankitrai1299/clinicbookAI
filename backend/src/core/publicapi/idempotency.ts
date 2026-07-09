// Idempotency for the public API's write endpoints.
//
// A partner whose POST /api/v1/appointments times out cannot know whether the
// booking happened. Without this it retries and either double-books (different
// slot) or gets a confusing 409 (same slot, already taken — by itself). With an
// `Idempotency-Key` header the retry REPLAYS the original result instead.
//
// Protocol, per (clinic, key):
//   claim()    -> 'claimed'      : first caller; go do the work
//              -> {replay: id}   : the work already succeeded; return that resource
//              -> 'in-progress'  : another request holds the claim right now (409)
//   complete() : stamp the resulting appointmentId onto the claim
//   release()  : the work FAILED — drop the claim so a retry is allowed
//
// The @@unique([clinicId, key]) is what makes two concurrent same-key requests
// race for the claim rather than both proceeding.

import { Prisma } from '@prisma/client';

import type { TenantClient } from '../../config/tenantPrisma.js';

export type ClaimResult = { status: 'claimed' } | { status: 'replay'; appointmentId: string } | { status: 'in-progress' };

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export const claim = async (
  db: TenantClient,
  clinicId: string,
  key: string,
  endpoint: string
): Promise<ClaimResult> => {
  const decide = (row: { appointmentId: string | null }): ClaimResult =>
    row.appointmentId ? { status: 'replay', appointmentId: row.appointmentId } : { status: 'in-progress' };

  const existing = await db.idempotencyKey.findUnique({
    where: { clinicId_key: { clinicId, key } },
    select: { appointmentId: true }
  });
  if (existing) return decide(existing);

  try {
    await db.idempotencyKey.create({ data: { clinicId, key, endpoint } });
    return { status: 'claimed' };
  } catch (err) {
    // Lost the race with a concurrent request carrying the same key: re-read to
    // see whether that one has finished (replay) or is still in flight (409).
    if (!isUniqueViolation(err)) throw err;
    const row = await db.idempotencyKey.findUnique({
      where: { clinicId_key: { clinicId, key } },
      select: { appointmentId: true }
    });
    return row ? decide(row) : { status: 'in-progress' };
  }
};

/** The work succeeded — record what it produced so retries replay it. */
export const complete = async (
  db: TenantClient,
  clinicId: string,
  key: string,
  appointmentId: string
): Promise<void> => {
  await db.idempotencyKey.updateMany({ where: { clinicId, key }, data: { appointmentId } });
};

/**
 * The work failed — drop the claim so the caller may legitimately retry.
 * Best-effort: a failure to clean up must not mask the original error.
 */
export const release = (db: TenantClient, clinicId: string, key: string): void => {
  void db.idempotencyKey
    .deleteMany({ where: { clinicId, key, appointmentId: null } })
    .catch((err: unknown) => console.error('[idempotency] failed to release claim:', err));
};
