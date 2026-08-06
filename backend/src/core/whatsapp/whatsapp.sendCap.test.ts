import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The daily send cap. It used to be a per-process counter, which meant the real
// budget was the configured number times however many instances were running.
// It is now one atomic counter in the database.

const queryRaw = vi.fn();
vi.mock('../../config/prisma.js', () => ({
  prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a), whatsAppSendCounter: { deleteMany: vi.fn() } }
}));

const { consumeDailySendQuota, decideQuota } = await import('./whatsapp.sendCap');

const ENV = { ...process.env };
beforeEach(() => {
  queryRaw.mockReset();
  process.env = { ...ENV };
  delete process.env.WA_DAILY_SEND_CAP;
  delete process.env.WA_SEND_CAP_EXEMPT_CLINICS;
  delete process.env.WHATSAPP_CLINIC_ID;
});
afterEach(() => {
  process.env = ENV;
  vi.restoreAllMocks();
});

describe('decideQuota — the off-by-one that decides a real send', () => {
  it('allows the send that lands exactly ON the cap', () => {
    // The count is post-increment, so the 1000th send of a 1000 cap reads 1000
    // and must go out. Getting this wrong silently loses a clinic one message
    // a day — or lets one extra through.
    expect(decideQuota(1000, 1000)).toBe(true);
  });

  it('blocks the one after', () => {
    expect(decideQuota(1001, 1000)).toBe(false);
  });

  it('allows the very first send', () => {
    expect(decideQuota(1, 1000)).toBe(true);
  });
});

describe('consumeDailySendQuota', () => {
  it('allows while under the cap', async () => {
    queryRaw.mockResolvedValue([{ count: 5 }]);
    const r = await consumeDailySendQuota('c1');
    expect(r).toEqual({ allowed: true, count: 5, cap: 1000 });
  });

  it('blocks once the counter passes the cap', async () => {
    process.env.WA_DAILY_SEND_CAP = '10';
    queryRaw.mockResolvedValue([{ count: 11 }]);
    const r = await consumeDailySendQuota('c1');
    expect(r.allowed).toBe(false);
  });

  it('does not touch the counter for an exempt clinic', async () => {
    process.env.WA_SEND_CAP_EXEMPT_CLINICS = 'c1';
    const r = await consumeDailySendQuota('c1');
    expect(r.allowed).toBe(true);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('exempts the established env clinic by default', async () => {
    // Shipping a cap must never throttle the clinic that was already live.
    process.env.WHATSAPP_CLINIC_ID = 'live-clinic';
    const r = await consumeDailySendQuota('live-clinic');
    expect(r.allowed).toBe(true);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('skips entirely when the cap is disabled', async () => {
    process.env.WA_DAILY_SEND_CAP = '0';
    const r = await consumeDailySendQuota('c1');
    expect(r.allowed).toBe(true);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('FAILS OPEN when the counter is unreachable', async () => {
    // This is a cost backstop, not a correctness gate. A database blip must not
    // stop a clinic replying to its patients.
    queryRaw.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await consumeDailySendQuota('c1');
    expect(r.allowed).toBe(true);
  });

  it('counts a clinic-less send under its own key rather than skipping the cap', async () => {
    queryRaw.mockResolvedValue([{ count: 1 }]);
    await consumeDailySendQuota(null);
    expect(queryRaw).toHaveBeenCalled();
  });
});
