import { z } from 'zod';

export const registerClinicSchema = z.object({
  clinicName: z.string().trim().min(2).max(200),
  ownerName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(6).max(30),
  password: z.string().min(8).max(128),
});

export const updateClinicSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
}).refine(data => data.name !== undefined || data.phone !== undefined, {
  message: 'At least one field (name or phone) is required',
});

export type RegisterClinicInput = z.infer<typeof registerClinicSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
