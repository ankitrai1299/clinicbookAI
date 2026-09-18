// The lock on a product a clinic has not bought.
//
// ── Why this is a middleware and not a UI decision ────────────────────────
//
// The product picker already shows a clinic only what it owns, and that is
// where the honest customer will meet this. It is not a control: a URL typed
// by hand, a bookmark from a trial, an old tab left open by a doctor whose
// clinic dropped the scribe — all of them reach the API without going past any
// screen. The screen is a courtesy; this is the answer.
//
// ── It fails OPEN, on purpose ─────────────────────────────────────────────
//
// `clinicProducts` grants everything when the lookup itself errors — most
// likely because the column has not reached that database yet — and that choice
// is inherited here.
//
// It is safe to inherit because THIS IS A BILLING BOUNDARY, NOT A SECURITY ONE.
// The caller is already authenticated and already scoped to their own clinic by
// the tenant layer; failing open lets them use a product they have not paid
// for, and cannot let them see anyone else's data. Weigh the two failures with
// that in mind: closed means every paying clinic loses the scribe the moment a
// query hiccups, mid-consultation, and hears about it by telephone. Open means
// one clinic briefly keeps something they did not buy. Only one of those is an
// outage.
//
// If this ever becomes the thing standing between two clinics' records, that
// reasoning stops holding and this must be reversed.

import type { Request, Response, NextFunction } from 'express';

import { hasProduct, type ProductKey } from './entitlement.service.js';

/** Human names, because 'mediscribe' is a key and nobody bought a key. */
const NAME: Record<ProductKey, string> = {
  clinicbook: 'अन्वयBook',
  mediscribe: 'अन्वयScribe',
};

/**
 * Refuse a request for a product this clinic does not have.
 *
 * 403 rather than 404: the product plainly exists — it is on the pricing page —
 * and pretending otherwise would send a clinic that wants to buy it looking for
 * a bug instead. The message says what to do about it.
 */
export const requireProduct =
  (product: ProductKey) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // req.user is set by requireAuth, which every product router mounts before
    // its own bridge — so this reads the same clinic on both products without
    // core having to know either of them exists.
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      // No clinic on the request is an authentication problem, not an
      // entitlement one, and the route's own auth says so more accurately.
      next();
      return;
    }

    try {
      if (await hasProduct(clinicId, product)) return next();
      res.status(403).json({
        success: false,
        error: `${NAME[product]} is not part of your subscription yet.`,
        message: `${NAME[product]} is not part of your subscription yet.`,
        product,
      });
    } catch (err) {
      // Reaching here is a bug in hasProduct, which handles its own lookup
      // failures. Let the request through and say so loudly, rather than
      // turning our bug into their outage.
      console.error(`[entitlements] check for '${product}' failed; allowing the request:`, err);
      next();
    }
  };
