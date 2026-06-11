import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getMyClinicHandler, registerClinicHandler, updateMyClinicHandler } from './clinic.controller.js';
import { registerClinicSchema, updateClinicSchema } from './clinic.schemas.js';

const clinicRouter = Router();

clinicRouter.post('/register', validate(registerClinicSchema), registerClinicHandler);
clinicRouter.get('/me', requireAuth, getMyClinicHandler);
clinicRouter.patch('/me', requireAuth, validate(updateClinicSchema), updateMyClinicHandler);

export default clinicRouter;
