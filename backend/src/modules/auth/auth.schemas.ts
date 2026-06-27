import { z } from 'zod';

// clinicId is intentionally NOT accepted from the request body. New staff
// accounts are always created in the authenticated admin's own clinic
// (clinicId is taken from the JWT in the controller). Accepting it from the
// body would let anyone register an admin into any clinic by id.
export const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128)
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128)
});

// Email verification (signup OTP gate).
export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code')
});

export const resendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;