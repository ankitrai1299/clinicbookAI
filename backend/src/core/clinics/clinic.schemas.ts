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
  /**
   * Health Facility Registry id, from facility.abdm.gov.in — this clinic's
   * identity in ABDM. Blank until the clinic is registered there.
   *
   * Allowed to be an empty string, which CLEARS it. A field that can only ever
   * be set is a field nobody can correct after typing it wrong once.
   */
  hfrId: z.string().trim().max(60).optional(),
}).refine(
  (d) => d.name !== undefined || d.phone !== undefined || d.hfrId !== undefined,
  { message: 'At least one field (name, phone or hfrId) is required' },
);

export type RegisterClinicInput = z.infer<typeof registerClinicSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
