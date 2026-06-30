import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { getDashboardHandler } from './analytics.controller.js';

const analyticsRouter = Router();

// requireAuth populates req.user from the JWT; resolveTenant then attaches the
// clinic-scoped Prisma client (req.db) used by this module's handlers.
analyticsRouter.use(requireAuth, resolveTenant);

analyticsRouter.get('/dashboard', getDashboardHandler);

export default analyticsRouter;
