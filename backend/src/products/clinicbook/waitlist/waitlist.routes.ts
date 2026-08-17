import { Router } from 'express';

import { requirePermission } from '../../../core/authz/requirePermission.js';
import { requireAuth } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
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
  listWaitlistQuerySchema,
  updateWaitlistPrioritySchema
} from './waitlist.schemas.js';

const waitlistRouter = Router();

waitlistRouter.use(requireAuth);

// Validate ?status= against the WaitlistStatus enum. Without this an arbitrary
// status string flows straight into prisma.findMany and triggers a 500.
waitlistRouter.get('/', requirePermission('appointment.read'), validate(listWaitlistQuerySchema, 'query'), getWaitlistHandler);
waitlistRouter.post('/', requirePermission('appointment.create'), validate(addToWaitlistSchema), addToWaitlistHandler);
waitlistRouter.get('/:id', requirePermission('appointment.read'), getWaitlistEntryHandler);
waitlistRouter.patch('/:id', requirePermission('appointment.update'), validate(updateWaitlistPrioritySchema), updateWaitlistPriorityHandler);
waitlistRouter.patch('/:id/offer', requirePermission('appointment.update'), offerWaitlistSlotHandler);
waitlistRouter.patch('/:id/respond', requirePermission('appointment.update'), respondWaitlistEntryHandler);
waitlistRouter.patch('/:id/convert', requirePermission('appointment.create'), validate(convertWaitlistSchema), convertWaitlistHandler);
waitlistRouter.patch('/:id/cancel', requirePermission('appointment.cancel'), cancelWaitlistEntryHandler);

export default waitlistRouter;
