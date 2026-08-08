import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
vi.mock('../../config/prisma.js', () => ({ prisma: { clinic: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) } } }));

const { clinicProducts, hasProduct, forgetClinicProducts, ALL_PRODUCTS } = await import('./entitlement.service.js');

// This decides whether a clinic's features exist. Getting it wrong in the
// permissive direction shows one product's data to someone who didn't buy it;
// getting it wrong in the strict direction silently removes features a clinic
// is paying for. Both matter, so both are pinned here.
describe('product entitlements', () => {
  beforeEach(() => {
    findUnique.mockReset();
    forgetClinicProducts();
  });

  it('grants exactly what the clinic bought', async () => {
    findUnique.mockResolvedValue({ products: ['mediscribe'] });
    expect(await clinicProducts('c1')).toEqual(['mediscribe']);
    expect(await hasProduct('c1', 'mediscribe')).toBe(true);
    expect(await hasProduct('c1', 'clinicbook')).toBe(false);
  });

  it('grants everything when the lookup fails', async () => {
    // Most likely cause: the column has not been applied to this database yet.
    // Adding this code to a running system must change nothing until both the
    // schema and the data are in place.
    findUnique.mockRejectedValue(new Error('column "products" does not exist'));
    expect(await clinicProducts('c1')).toEqual([...ALL_PRODUCTS]);
  });

  it('grants everything for an empty or unrecognisable list', async () => {
    // A blank row means nobody configured this clinic — not that they bought
    // nothing. Reading it as "nothing" would take a paying clinic's features away.
    findUnique.mockResolvedValue({ products: [] });
    expect(await clinicProducts('c1')).toEqual([...ALL_PRODUCTS]);

    forgetClinicProducts();
    findUnique.mockResolvedValue({ products: ['typo-product'] });
    expect(await clinicProducts('c1')).toEqual([...ALL_PRODUCTS]);
  });

  it('grants everything for a clinic that does not exist', async () => {
    findUnique.mockResolvedValue(null);
    expect(await clinicProducts('nope')).toEqual([...ALL_PRODUCTS]);
  });

  it('caches, so a WhatsApp turn does not cost a query per question', async () => {
    findUnique.mockResolvedValue({ products: ['clinicbook'] });
    await clinicProducts('c1');
    await hasProduct('c1', 'clinicbook');
    await hasProduct('c1', 'mediscribe');
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('re-reads after a clinic buys a product', async () => {
    findUnique.mockResolvedValue({ products: ['clinicbook'] });
    expect(await hasProduct('c1', 'mediscribe')).toBe(false);

    findUnique.mockResolvedValue({ products: ['clinicbook', 'mediscribe'] });
    forgetClinicProducts('c1');
    expect(await hasProduct('c1', 'mediscribe')).toBe(true);
  });

  it('keeps clinics separate in the cache', async () => {
    findUnique.mockResolvedValueOnce({ products: ['clinicbook'] });
    findUnique.mockResolvedValueOnce({ products: ['mediscribe'] });
    expect(await clinicProducts('c1')).toEqual(['clinicbook']);
    expect(await clinicProducts('c2')).toEqual(['mediscribe']);
  });
});
