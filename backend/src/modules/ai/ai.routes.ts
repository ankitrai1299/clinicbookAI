import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { chatHandler, historyHandler } from './ai.controller.js';

const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.post('/chat', chatHandler);
aiRouter.get('/history/:conversationId', historyHandler);

export default aiRouter;
