import { Router } from 'express';

import { requirePermission } from '../authz/requirePermission.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { chatHandler, historyHandler } from './ai.controller.js';
import { chatSchema } from './ai.schemas.js';

const aiRouter = Router();

aiRouter.use(requireAuth);
// The assistant answers questions about this clinic's patients.
aiRouter.post('/chat', requirePermission('patient.read'), validate(chatSchema), chatHandler);
aiRouter.get('/history/:conversationId', requirePermission('patient.read'), historyHandler);

export default aiRouter;
