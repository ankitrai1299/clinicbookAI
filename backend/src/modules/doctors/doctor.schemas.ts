import { z } from 'zod';

export const createDoctorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  speciality: z.string().trim().min(2).max(100),
});

export const updateDoctorSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    speciality: z.string().trim().min(2).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update',
  });

export const doctorIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
