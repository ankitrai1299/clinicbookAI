import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./entitlement.service.js', () => ({ hasProduct: vi.fn() }));

const { hasProduct } = vi.mocked(await import('./entitlement.service.js'));
const { requireProduct } = await import('./requireProduct.js');

const run = async (req: any) => {
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = vi.fn();
  await requireProduct('mediscribe')(req, res, next);
  return { res, next };
};

// The lock on a product a clinic has not bought.
//
// Two ways to be wrong, and they are not equal. Letting someone in costs a
// month's fee. Locking a PAYING clinic out of the product they pay for takes
// their doctors off the scribe mid-clinic, and they find out by phoning us.
// So every test here is about not doing the second one by accident.
describe('the subscription lock', () => {
  beforeEach(() => hasProduct.mockReset());

  it('lets a clinic that owns it through', async () => {
    hasProduct.mockResolvedValue(true);
    const { res, next } = await run({ user: { clinicId: 'c1' } });
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });

  it('refuses a clinic that does not, and names the product', async () => {
    // 403, not 404. The product plainly exists — it is on the pricing page —
    // and pretending otherwise sends a clinic that wants to buy it looking for
    // a bug instead.
    hasProduct.mockResolvedValue(false);
    const { res, next } = await run({ user: { clinicId: 'c1' } });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/अन्वयScribe/);
    expect(res.body.error).not.toMatch(/mediscribe/);
  });

  it('asks about the caller\'s OWN clinic', async () => {
    hasProduct.mockResolvedValue(true);
    await run({ user: { clinicId: 'clinic-42' } });
    expect(hasProduct).toHaveBeenCalledWith('clinic-42', 'mediscribe');
  });

  it('leaves a request with no clinic to the route\'s own auth', async () => {
    // Not signed in is an authentication problem, not an entitlement one, and
    // "not part of your subscription" would be a confusing thing to tell
    // someone who is not logged in.
    const { res, next } = await run({});
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
    expect(hasProduct).not.toHaveBeenCalled();
  });

  it('does not lock a paying clinic out when the lookup itself fails', async () => {
    // Inherited from clinicProducts on purpose. Failing closed means every
    // clinic loses a product they pay for the moment a query hiccups; failing
    // open means one briefly keeps something they did not buy. Only one of
    // those is an outage.
    // Thrown synchronously rather than as a rejected promise: an `await` inside
    // the middleware catches both identically, and a rejected promise left in a
    // mock'"'"'s result log is reported by the runner as an unhandled rejection even
    // after the code under test has handled it.
    hasProduct.mockRejectedValueOnce(new Error('connection reset'));
    const { res, next } = await run({ user: { clinicId: 'c1' } });
    expect(next.mock.calls).toEqual([[]]); // through, and NOT into the error handler
    expect(res.statusCode).toBe(0);
  });
});
