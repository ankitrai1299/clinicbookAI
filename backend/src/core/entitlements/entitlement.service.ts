// What a clinic actually bought.
//
// ClinicBook AI and MediScribe are sold separately or together. This is the one
// place that answers "does this clinic have that product?", so a feature that
// spans both can FADE for a clinic that only bought one — instead of failing, or
// worse, quietly showing them another product's data.
//
// Deliberately NOT a permission check. Permissions say what a USER may do inside
// a product; this says whether the clinic has the product at all.

import { prisma } from '../../config/prisma.js';

export type ProductKey = 'clinicbook' | 'mediscribe';

export const ALL_PRODUCTS: readonly ProductKey[] = ['clinicbook', 'mediscribe'] as const;

// Small TTL cache. This is asked on WhatsApp turns and skill calls, where an
// extra round-trip per message is real cost at a hundred clinics, and the answer
// changes when someone buys a product — minutes-stale is harmless.
const TTL_MS = 60_000;
const cache = new Map<string, { products: ProductKey[]; at: number }>();

const parse = (raw: unknown): ProductKey[] => {
  if (!Array.isArray(raw)) return [...ALL_PRODUCTS];
  const known = raw.filter((p): p is ProductKey => p === 'clinicbook' || p === 'mediscribe');
  // An empty or unrecognisable list means nobody has configured this clinic yet.
  // Treat that as "everything", never as "nothing" — a mis-set row must not take
  // a paying clinic's features away.
  return known.length ? known : [...ALL_PRODUCTS];
};

/**
 * The products this clinic has. FAILS OPEN: if the lookup errors — most likely
 * because the column has not been applied to this database yet — every product
 * is granted, so adding this code to a running system changes nothing until the
 * schema and the data are both in place.
 */
export const clinicProducts = async (clinicId: string): Promise<ProductKey[]> => {
  const hit = cache.get(clinicId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.products;

  let products: ProductKey[];
  try {
    const row = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { products: true } });
    products = parse(row?.products);
  } catch (err) {
    console.warn('[entitlements] lookup failed, granting all products:', (err as Error).message);
    products = [...ALL_PRODUCTS];
  }

  cache.set(clinicId, { products, at: Date.now() });
  return products;
};

export const hasProduct = async (clinicId: string, product: ProductKey): Promise<boolean> =>
  (await clinicProducts(clinicId)).includes(product);

/** Call after changing a clinic's products so the next request sees it. */
export const forgetClinicProducts = (clinicId?: string): void => {
  if (clinicId) cache.delete(clinicId);
  else cache.clear();
};
