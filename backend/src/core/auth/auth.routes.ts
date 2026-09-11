import { Router } from 'express';

import mfaRouter, { sessionRouter } from './mfa.routes.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../authz/requirePermission.js';
import { authLimiter } from '../../middleware/rateLimiters.js';
import { requirePartnerSecret } from '../../middleware/partnerSso.js';
import { validate } from '../../middleware/validate.js';
import {
  forgotPasswordHandler,
  login,
  me,
  resendOtp,
  resetPasswordHandler,
  signup,
  verifyOtp
} from './auth.controller.js';
import {
  forgotPasswordSchema,
  loginSchema,
  resendOtpSchema,
  resetPasswordSchema,
  signupSchema,
  verifyOtpSchema
} from './auth.schemas.js';

const authRouter = Router();

// Creating a staff account requires an authenticated clinic admin; the new
// user is bound to that admin's clinic (clinicId comes from the JWT, never the body).
// Creating a colleague's account is an owner action — a receptionist must not be
// able to mint themselves a second login, and a doctor has no reason to.
authRouter.post('/signup', requireAuth, requirePermission('users.manage'), validate(signupSchema), signup);
authRouter.post('/login', authLimiter, validate(loginSchema), login);
// Cross-system SSO: a trusted partner backend (e.g. the external NovaScribe)
// verifies a clinic's ClinicBook email+password here with a shared secret, so the
// SAME clinic login works on that system. Same {user, accessToken} response as
// /login; the shared secret (not the per-IP limiter) is the gate.
authRouter.post('/partner-login', requirePartnerSecret, validate(loginSchema), login);
// Email verification (signup OTP gate) — rate-limited (brute-force / guessing).
authRouter.post('/verify-otp', authLimiter, validate(verifyOtpSchema), verifyOtp);
authRouter.post('/resend-otp', authLimiter, validate(resendOtpSchema), resendOtp);
authRouter.get('/me', requireAuth, me);

// ── Getting back in ────────────────────────────────────────────────────────
//
// Rate limited with the same limiter as login, and for the same reason: both
// take an email and a secret, and both are worth guessing at in bulk. The
// request endpoint also sends mail, which makes an unlimited one a way to use
// this platform to flood somebody's inbox.
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordHandler
);
authRouter.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPasswordHandler);

// Two-factor authentication (opt-in per user) and session revocation.
authRouter.use('/mfa', mfaRouter);
authRouter.use(sessionRouter);

export default authRouter;