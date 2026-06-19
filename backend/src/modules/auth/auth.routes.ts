import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { login, me, signup } from './auth.controller.js';
import { loginSchema, signupSchema } from './auth.schemas.js';

const authRouter = Router();

// Creating a staff account requires an authenticated clinic admin; the new
// user is bound to that admin's clinic (clinicId comes from the JWT, never the body).
authRouter.post('/signup', requireAuth, validate(signupSchema), signup);
authRouter.post('/login', validate(loginSchema), login);
authRouter.get('/me', requireAuth, me);

export default authRouter;