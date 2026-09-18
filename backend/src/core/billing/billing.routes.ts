import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import {
  createCheckoutSessionHandler,
  createPortalSessionHandler,
  getStripeStatusHandler,
  startSubscriptionHandler,
  stopSubscriptionHandler,
} from './billing.controller.js';

const billingRouter = Router();

billingRouter.use(requireAuth);
billingRouter.get('/status', getStripeStatusHandler);
billingRouter.post('/checkout-session', createCheckoutSessionHandler);
billingRouter.post('/portal-session', createPortalSessionHandler);

// Razorpay. Returns the page the clinic pays on; the webhook is what actually
// grants access, because a clinic reaching a success page proves only that a
// browser followed a redirect.
billingRouter.post('/subscribe', startSubscriptionHandler);
billingRouter.post('/unsubscribe', stopSubscriptionHandler);

export default billingRouter;
