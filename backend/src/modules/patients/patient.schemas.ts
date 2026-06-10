import { z } from 'zod';

export const patientIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export const createPatientSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(6).max(30),
  language: z.string().trim().min(2).max(50)
});

export const updatePatientSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  language: z.string().trim().min(2).max(50).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required for update'
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientIdParams = z.infer<typeof patientIdParamsSchema>;