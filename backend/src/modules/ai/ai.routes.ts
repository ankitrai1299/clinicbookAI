import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { chatHandler, historyHandler } from './ai.controller.js';
import { chatSchema } from './ai.schemas.js';

const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.post('/chat', validate(chatSchema), chatHandler);
aiRouter.get('/history/:conversationId', historyHandler);

export default aiRouter;
