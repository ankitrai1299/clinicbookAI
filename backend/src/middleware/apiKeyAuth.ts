// Tenant-binding choke point for the PUBLIC API (/api/v1). The partner sends its
// key; we resolve it to a clinic and attach the same `req.clinic` + `req.db`
// shape that resolveTenant gives the authenticated dashboard channel — so every
// downstream handler is identical regardless of how the tenant was resolved.
//
// Accepts either `Authorization: Bearer ck_live_…` (preferred) or `X-API-Key`.

import { NextFunction, Request, Response } from 'express';

import { forClinic } from '../config/tenantPrisma.js';
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

  void resolveApiKey(key)
    .then((resolved) => {
      if (!resolved) {
        next(new AppError('Invalid or revoked API key.', 401));
        return;
      }
      req.apiKey = resolved;
      req.clinic = { id: resolved.clinicId };
      req.db = forClinic(resolved.clinicId);
      touchApiKey(resolved.id);
      next();
    })
    .catch(next);
};
