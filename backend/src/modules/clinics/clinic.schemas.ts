import { z } from 'zod';

export const registerClinicSchema = z.object({
  clinicName: z.string().trim().min(2).max(200),
  ownerName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(6).max(30),
  password: z.string().min(8).max(128),
});

export type RegisterClinicInput = z.infer<typeof registerClinicSchema>;
