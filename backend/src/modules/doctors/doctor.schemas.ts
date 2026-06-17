import { z } from 'zod';

export const createDoctorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  speciality: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(150).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
});

export const updateDoctorSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    speciality: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().max(150).optional(),
    phone: z.string().trim().min(6).max(30).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update',
  });

export const doctorIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

// Weekly schedule: one entry per active weekday.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const scheduleEntrySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(HHMM, 'startTime must be HH:MM'),
    endTime: z.string().regex(HHMM, 'endTime must be HH:MM'),
    slotMinutes: z.number().int().min(5).max(240).default(30),
    isActive: z.boolean().default(true),
  })
  .refine((e) => e.startTime < e.endTime, { message: 'startTime must be before endTime' });

export const setScheduleSchema = z.object({
  entries: z.array(scheduleEntrySchema).max(7),
});

export const createLeaveSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((l) => l.startDate <= l.endDate, { message: 'startDate must be on or before endDate' });

export const leaveIdParamsSchema = z.object({
  id: z.string().trim().min(1),
  leaveId: z.string().trim().min(1),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type SetScheduleInput = z.infer<typeof setScheduleSchema>;
export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
