import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimiters.js';
import { validate } from '../../middleware/validate.js';
import { login, me, resendOtp, signup, verifyOtp } from './auth.controller.js';
import { loginSchema, resendOtpSchema, signupSchema, verifyOtpSchema } from './auth.schemas.js';

const authRouter = Router();

// Creating a staff account requires an authenticated clinic admin; the new
// user is bound to that admin's clinic (clinicId comes from the JWT, never the body).
authRouter.post('/signup', requireAuth, validate(signupSchema), signup);
authRouter.post('/login', authLimiter, validate(loginSchema), login);
// Email verification (signup OTP gate) — rate-limited (brute-force / guessing).
authRouter.post('/verify-otp', authLimiter, validate(verifyOtpSchema), verifyOtp);
authRouter.post('/resend-otp', authLimiter, validate(resendOtpSchema), resendOtp);
authRouter.get('/me', requireAuth, me);

export default authRouter;