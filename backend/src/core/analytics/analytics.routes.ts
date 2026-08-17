import { Router } from 'express';

import { requirePermission } from '../authz/requirePermission.js';
import { requireAuth } from '../../middleware/auth.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { getDashboardHandler } from './analytics.controller.js';

const analyticsRouter = Router();

// requireAuth populates req.user from the JWT; resolveTenant then attaches the
// clinic-scoped Prisma client (req.db) used by this module's handlers.
analyticsRouter.use(requireAuth, resolveTenant);

// Aggregate counts over patients and appointments — the clinical picture in
// summary, so it follows the same read permission as the records behind it.
analyticsRouter.get('/dashboard', requirePermission('patient.read'), getDashboardHandler);

export default analyticsRouter;
