import { WaitlistStatus } from '@prisma/client';
import { z } from 'zod';

export const waitlistIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export const addToWaitlistSchema = z.object({
  patientId: z.string().trim().min(1),
  priority: z.number().int().min(0).optional().default(0)
});

export const updateWaitlistPrioritySchema = z.object({
  priority: z.number().int().min(0)
});

export const convertWaitlistSchema = z.object({
  doctorId: z.string().trim().min(1),
  appointmentDate: z.string().trim().min(1),
  appointmentTime: z.string().trim().min(1).max(20)
});

export const listWaitlistQuerySchema = z.object({
  status: z.nativeEnum(WaitlistStatus).optional()
});

export type AddToWaitlistInput = z.infer<typeof addToWaitlistSchema>;
export type UpdateWaitlistPriorityInput = z.infer<typeof updateWaitlistPrioritySchema>;
export type ConvertWaitlistInput = z.infer<typeof convertWaitlistSchema>;
export type ListWaitlistQuery = z.infer<typeof listWaitlistQuerySchema>;
export type WaitlistIdParams = z.infer<typeof waitlistIdParamsSchema>;
