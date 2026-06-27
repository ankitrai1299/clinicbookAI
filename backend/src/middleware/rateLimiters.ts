import rateLimit from 'express-rate-limit';

// Stricter per-IP limiter for credential / verification endpoints (login,
// register, OTP verify/resend). Sits on top of the global limiter to blunt
// brute-force and OTP-guessing. The OTP itself also has a server-side 5-attempt
// cap, so this is defence in depth. Requires app.set('trust proxy', …) to key on
// the real client IP behind Railway.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' }
});
