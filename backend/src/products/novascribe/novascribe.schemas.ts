import { ConsultationNoteStatus } from '@prisma/client';
import { z } from 'zod';

export const noteIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export const listNotesQuerySchema = z.object({
  status: z.nativeEnum(ConsultationNoteStatus).optional()
});

// Manual draft creation (e.g. a walk-in not tied to a booked appointment, or for
// local testing without completing an appointment). All fields optional.
export const createDraftSchema = z.object({
  appointmentId: z.string().trim().min(1).optional(),
  patientId: z.string().trim().min(1).optional(),
  doctorId: z.string().trim().min(1).optional(),
  patientName: z.string().trim().min(1).max(120).optional(),
  doctorName: z.string().trim().min(1).max(120).optional()
});

export const transcribeSchema = z.object({
  transcript: z.string().trim().min(1, 'Transcript is required')
});

const prescriptionItemSchema = z.object({
  drug: z.string().trim().min(1),
  dose: z.string().trim().default(''),
  frequency: z.string().trim().default(''),
  duration: z.string().trim().default(''),
  notes: z.string().trim().default('')
});

export const reviewSchema = z
  .object({
    subjective: z.string().optional(),
    objective: z.string().optional(),
    assessment: z.string().optional(),
    plan: z.string().optional(),
    prescription: z.array(prescriptionItemSchema).optional(),
    finalize: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type CreateDraftInputBody = z.infer<typeof createDraftSchema>;
export type TranscribeInput = z.infer<typeof transcribeSchema>;
export type ReviewInputBody = z.infer<typeof reviewSchema>;
export type NoteIdParams = z.infer<typeof noteIdParamsSchema>;
