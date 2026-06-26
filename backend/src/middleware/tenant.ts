import { NextFunction, Request, Response } from 'express';

import { forClinic } from '../config/tenantPrisma.js';
import { AppError } from '../utils/AppError.js';

// Resolves the current tenant onto the request and attaches a clinic-scoped
// Prisma client. MUST run after `requireAuth` (which populates req.user from the
// JWT). Once this has run, downstream handlers use `req.db` / `req.clinic` and
// never read clinicId from anywhere else.
//
// This is the single tenant-binding choke point for the authenticated/REST
// channel. Other channels (WhatsApp webhook by phone_number_id, Stripe webhook
// by customer) get their own resolvers in later phases; they converge on the
// same `req.clinic` + `req.db` shape.
export const resolveTenant = (req: Request, _res: Response, next: NextFunction) => {
  const clinicId = req.user?.clinicId;

  if (!clinicId) {
    // requireAuth should already have rejected this; guard anyway so a
    // misordered route can never run a handler with an unscoped client.
    return next(new AppError('Authentication required', 401));
  }

  req.clinic = { id: clinicId };
  req.db = forClinic(clinicId);
  return next();
};
