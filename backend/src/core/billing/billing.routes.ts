import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import {
  createCheckoutSessionHandler,
  createPortalSessionHandler,
  getStripeStatusHandler,
} from './billing.controller.js';

const billingRouter = Router();

billingRouter.use(requireAuth);
billingRouter.get('/status', getStripeStatusHandler);
billingRouter.post('/checkout-session', createCheckoutSessionHandler);
billingRouter.post('/portal-session', createPortalSessionHandler);

export default billingRouter;
