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

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;