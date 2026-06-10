import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  addToWaitlistHandler,
  cancelWaitlistEntryHandler,
  convertWaitlistHandler,
  getWaitlistEntryHandler,
  getWaitlistHandler,
  offerWaitlistSlotHandler,
  respondWaitlistEntryHandler,
  updateWaitlistPriorityHandler
} from './waitlist.controller.js';
import {
  addToWaitlistSchema,
  convertWaitlistSchema,
  updateWaitlistPrioritySchema
} from './waitlist.schemas.js';

const waitlistRouter = Router();

waitlistRouter.use(requireAuth);

waitlistRouter.get('/', getWaitlistHandler);
waitlistRouter.post('/', validate(addToWaitlistSchema), addToWaitlistHandler);
waitlistRouter.get('/:id', getWaitlistEntryHandler);
waitlistRouter.patch('/:id', validate(updateWaitlistPrioritySchema), updateWaitlistPriorityHandler);
waitlistRouter.patch('/:id/offer', offerWaitlistSlotHandler);
waitlistRouter.patch('/:id/respond', respondWaitlistEntryHandler);
waitlistRouter.patch('/:id/convert', validate(convertWaitlistSchema), convertWaitlistHandler);
waitlistRouter.patch('/:id/cancel', cancelWaitlistEntryHandler);

export default waitlistRouter;
