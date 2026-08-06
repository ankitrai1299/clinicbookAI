import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Inbound idempotency. Meta retries a webhook until it gets a 200, and with more
// than one instance the retry can land somewhere else — so the claim has to be
// the database's primary key, not a Set in one process.

const create = vi.fn();
const deleteMany = vi.fn();
vi.mock('../../config/prisma.js', () => ({
  prisma: {
    processedInboundMessage: {
      create: (...a: unknown[]) => create(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a)
    }
  }
}));

const { claimInboundMessage, sweepProcessedMessages, DEDUPE_RETENTION_HOURS } = await import('./whatsapp.dedupe');

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' });

beforeEach(() => {
  create.mockReset();
  deleteMany.mockReset();
});

describe('claimInboundMessage', () => {
  it('lets the first caller through', async () => {
    create.mockResolvedValue({});
    expect(await claimInboundMessage('wamid.1')).toBe(true);
  });

  it('rejects a second claim on the same id', async () => {
    create.mockRejectedValue(uniqueViolation());
    expect(await claimInboundMessage('wamid.1')).toBe(false);
  });

  it('claims by the message id itself', async () => {
    create.mockResolvedValue({});
    await claimInboundMessage('wamid.abc');
    expect(create).toHaveBeenCalledWith({ data: { waMessageId: 'wamid.abc' } });
  });

  it('FAILS OPEN when the database is unreachable', async () => {
    // A duplicate reply is a nuisance. A silently dropped booking is a patient
    // who never hears back — so an unavailable claim must not swallow the
    // message.
    create.mockRejectedValue(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await claimInboundMessage('wamid.1')).toBe(true);
  });

  it('treats only P2002 as "already claimed", not any Prisma error', async () => {
    // A different Prisma failure is an outage, not a duplicate — fail open.
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('nope', { code: 'P2024', clientVersion: 'x' })
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await claimInboundMessage('wamid.1')).toBe(true);
  });
});

describe('sweepProcessedMessages', () => {
  it('deletes only rows older than the retention window', async () => {
    deleteMany.mockResolvedValue({ count: 7 });
    const now = new Date('2026-08-04T12:00:00Z');
    expect(await sweepProcessedMessages(now)).toBe(7);
    expect(deleteMany.mock.calls[0][0].where.processedAt.lt).toEqual(
      new Date(now.getTime() - DEDUPE_RETENTION_HOURS * 3600_000)
    );
  });

  it('never throws — a failed sweep must not take the cron down with it', async () => {
    deleteMany.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await sweepProcessedMessages()).toBe(0);
  });
});
