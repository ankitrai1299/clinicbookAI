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

// Partner-facing /api/v1. The app-wide limiter keys on client IP, which is wrong
// for a machine-to-machine surface: one partner rendering a booking calendar
// (doctors x days) blows a browser-sized budget, and two partners behind the same
// NAT/egress share one bucket — a partner can 429 a different clinic's partner.
// Key on the API key instead (set by requireApiKey, which runs before this).
// Falls back to IP if a request somehow reaches here unauthenticated, so the
// bucket can never collapse into a single shared global one.
export const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600, // ~10 rps sustained per key; a full calendar render fits comfortably
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKey?.id ?? req.ip ?? 'unknown',
  message: {
    success: false,
    message: 'Rate limit exceeded for this API key. Retry after the window resets.'
  }
});
