import { AppointmentStatus } from '@prisma/client';
import { z } from 'zod';

export const appointmentIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export const createAppointmentSchema = z.object({
  doctorId: z.string().trim().min(1),
  patientId: z.string().trim().min(1),
  appointmentDate: z.string().trim().min(1),
  appointmentTime: z.string().trim().min(1).max(20),
  status: z.nativeEnum(AppointmentStatus).optional()
});

export const updateAppointmentSchema = z
  .object({
    doctorId: z.string().trim().min(1).optional(),
    patientId: z.string().trim().min(1).optional(),
    appointmentDate: z.string().trim().min(1).optional(),
    appointmentTime: z.string().trim().min(1).max(20).optional(),
    status: z.nativeEnum(AppointmentStatus).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update'
  });

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type AppointmentIdParams = z.infer<typeof appointmentIdParamsSchema>;