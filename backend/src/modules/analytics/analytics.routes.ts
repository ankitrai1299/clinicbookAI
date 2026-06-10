import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { getDashboardHandler } from './analytics.controller.js';

const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get('/dashboard', getDashboardHandler);

export default analyticsRouter;
