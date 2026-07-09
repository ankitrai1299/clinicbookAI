// Tenant-binding choke point for the PUBLIC API (/api/v1). The partner sends its
// key; we resolve it to a clinic and attach the same `req.clinic` + `req.db`
// shape that resolveTenant gives the authenticated dashboard channel — so every
// downstream handler is identical regardless of how the tenant was resolved.
//
// Accepts either `Authorization: Bearer ck_live_…` (preferred) or `X-API-Key`.

import { NextFunction, Request, RequestHandler, Response } from 'express';

import { forClinic } from '../config/tenantPrisma.js';
import type { ApiScope } from '../core/apikeys/apiKey.service.js';
import { resolveApiKey, touchApiKey } from '../core/apikeys/apiKey.service.js';
import { AppError } from '../utils/AppError.js';

const extractKey = (req: Request): string | undefined => {
  const auth = req.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const v = auth.slice(7).trim();
    if (v) return v;
  }
  return req.get('x-api-key')?.trim() || undefined;
};

export const requireApiKey = (req: Request, _res: Response, next: NextFunction): void => {
  const key = extractKey(req);
  if (!key) {
    next(new AppError('API key required. Send Authorization: Bearer <key>.', 401));
    return;
  }

  // Two-argument .then, NOT .then(...).catch(next): with a trailing .catch the
  // whole downstream middleware chain runs INSIDE the fulfilment callback, so a
  // synchronous throw from any later handler unwinds back into this promise and
  // calls next(err) a SECOND time on a request whose error path already ran
  // (double errorHandler -> ERR_HTTP_HEADERS_SENT). Rejections of resolveApiKey
  // itself go to the onRejected arm; next() is the last thing we do.
  void resolveApiKey(key).then((resolved) => {
    if (!resolved) {
      next(new AppError('Invalid or revoked API key.', 401));
      return;
    }
    req.apiKey = resolved;
    req.clinic = { id: resolved.clinicId };
    req.db = forClinic(resolved.clinicId);
    touchApiKey(resolved.id);
    next();
  }, next);
};

/**
 * Gate a route on a scope. Mount AFTER requireApiKey, per-route (not `.use`), so
 * a read-only key can still reach every GET.
 *
 * 403, not 401: the key is valid and we know who it is — it simply may not do
 * this. A 401 would tell an integrator to go re-check their credentials.
 */
export const requireScope =
  (scope: ApiScope): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    // requireApiKey always runs first and 401s without a key, so a missing
    // req.apiKey here means the route was mis-wired. Fail closed rather than
    // silently allowing the call through.
    if (!req.apiKey?.scopes.includes(scope)) {
      next(new AppError(`This API key does not have the "${scope}" scope.`, 403));
      return;
    }
    next();
  };
