import { Router } from 'express';

import { validate } from '../../middleware/validate.js';
import { registerClinicHandler } from './clinic.controller.js';
import { registerClinicSchema } from './clinic.schemas.js';

const clinicRouter = Router();

clinicRouter.post('/register', validate(registerClinicSchema), registerClinicHandler);

export default clinicRouter;
