import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getMyClinicHandler, registerClinicHandler } from './clinic.controller.js';
import { registerClinicSchema } from './clinic.schemas.js';

const clinicRouter = Router();

clinicRouter.post('/register', validate(registerClinicSchema), registerClinicHandler);
clinicRouter.get('/me', requireAuth, getMyClinicHandler);

export default clinicRouter;
