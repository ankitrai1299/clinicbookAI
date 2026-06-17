import { z } from 'zod';

export const doctorRegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  speciality: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(150),
  phone: z.string().trim().min(6).max(30),
  password: z.string().min(6).max(100)
});

export const doctorLoginSchema = z.object({
  email: z.string().trim().email().max(150),
  password: z.string().min(1)
});

export const appointmentIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export const leaveParamsSchema = z.object({
  leaveId: z.string().trim().min(1)
});

// Doctor's decision on an appointment request. `reschedule` requires the new
// slot; approve/reject need no extra fields.
export const appointmentDecisionSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'reschedule']),
    appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'appointmentDate must be YYYY-MM-DD').optional(),
    appointmentTime: z.string().trim().min(1).max(20).optional()
  })
  .refine((d) => d.action !== 'reschedule' || (d.appointmentDate && d.appointmentTime), {
    message: 'reschedule requires appointmentDate and appointmentTime'
  });

export type DoctorRegisterInput = z.infer<typeof doctorRegisterSchema>;
export type DoctorLoginInput = z.infer<typeof doctorLoginSchema>;
export type AppointmentDecisionInput = z.infer<typeof appointmentDecisionSchema>;
