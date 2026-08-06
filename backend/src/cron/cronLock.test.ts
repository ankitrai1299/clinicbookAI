import { describe, it, expect, vi, beforeEach } from 'vitest';

// Leader election for the crons. What is being protected: with two instances and
// no lock, every tick fires twice — two reminders to the same patient, two
// auto-complete sweeps. These pin the two properties that make the lease safe:
// exactly one winner, and a dead holder cannot wedge the job forever.

const updateMany = vi.fn();
const create = vi.fn();
vi.mock('../config/prisma.js', () => ({
  prisma: { cronLock: { updateMany: (...a: unknown[]) => updateMany(...a), create: (...a: unknown[]) => create(...a) } }
}));

const { acquireCronLock, releaseCronLock, withCronLock, lockHolderId } = await import('./cronLock');

beforeEach(() => {
  updateMany.mockReset();
  create.mockReset();
});

describe('acquireCronLock', () => {
  it('takes the lease when the existing one has expired', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    expect(await acquireCronLock('reminders', 60_000)).toBe(true);
  });

  it('only reclaims a lease whose expiry has PASSED', async () => {
    // The whole safety property: the update must be conditional on expiry, never
    // an unconditional overwrite of whoever currently holds it.
    updateMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-08-04T10:00:00Z');
    await acquireCronLock('reminders', 60_000, now);
    expect(updateMany.mock.calls[0][0].where).toEqual({ name: 'reminders', expiresAt: { lte: now } });
  });

  it('sets the new expiry to now + the lease', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-08-04T10:00:00Z');
    await acquireCronLock('reminders', 90_000, now);
    expect(updateMany.mock.calls[0][0].data.expiresAt).toEqual(new Date('2026-08-04T10:01:30Z'));
  });

  it('creates the row on the very first run', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    create.mockResolvedValue({});
    expect(await acquireCronLock('reminders', 60_000)).toBe(true);
  });

  it('loses gracefully when another instance created the row first', async () => {
    // Both instances see "no row", both try to create; the primary key means one
    // of them loses, and losing must NOT be an error.
    updateMany.mockResolvedValue({ count: 0 });
    create.mockRejectedValue(new Error('unique constraint'));
    expect(await acquireCronLock('reminders', 60_000)).toBe(false);
  });

  it('does not acquire while someone else holds an unexpired lease', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    create.mockRejectedValue(new Error('unique constraint'));
    expect(await acquireCronLock('reminders', 60_000)).toBe(false);
  });

  it('FAILS CLOSED when the lock cannot be read', async () => {
    // A lock we cannot read is not a lock we can trust. Skipping a tick costs a
    // few minutes; assuming leadership wrongly costs duplicate patient messages.
    updateMany.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await acquireCronLock('reminders', 60_000)).toBe(false);
  });
});

describe('releaseCronLock', () => {
  it('only releases a lease THIS process still holds', async () => {
    // Releasing someone else's lease (ours may have expired and been taken)
    // would let a third instance straight in.
    updateMany.mockResolvedValue({ count: 1 });
    await releaseCronLock('reminders');
    expect(updateMany.mock.calls[0][0].where).toEqual({ name: 'reminders', holder: lockHolderId() });
  });

  it('swallows a failed release — the lease expires on its own', async () => {
    updateMany.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(releaseCronLock('reminders')).resolves.toBeUndefined();
  });
});

describe('withCronLock', () => {
  it('runs the job and reports that it ran here', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const job = vi.fn().mockResolvedValue(undefined);
    expect(await withCronLock('reminders', 60_000, job)).toBe(true);
    expect(job).toHaveBeenCalledOnce();
  });

  it('skips the job entirely when another instance holds the lease', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    create.mockRejectedValue(new Error('held'));
    const job = vi.fn();
    expect(await withCronLock('reminders', 60_000, job)).toBe(false);
    expect(job).not.toHaveBeenCalled();
  });

  it('releases even when the job throws', async () => {
    // Otherwise one failing run holds the lease for its whole duration and the
    // job silently stops until the lease expires.
    updateMany.mockResolvedValue({ count: 1 });
    const job = vi.fn().mockRejectedValue(new Error('job blew up'));
    await expect(withCronLock('reminders', 60_000, job)).rejects.toThrow('job blew up');
    expect(updateMany).toHaveBeenCalledTimes(2); // acquire + release
  });
});
