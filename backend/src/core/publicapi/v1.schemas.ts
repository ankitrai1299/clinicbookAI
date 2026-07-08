// Request/response contracts for the PUBLIC API v1. These are a published
// contract for partners — keep them narrow, and never leak internal fields
// (clinic plan, reminder rows, patientCode…) into the response DTO.

import { z } from 'zod';

import type { AppointmentRecord } from '../../products/clinicbook/appointments/appointment.port.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
// Deliberately loose: the service canonicalises "9", "9:30", "2:30pm", "14:30",
// "09:00 AM" into the one stored shape. Partners shouldn't have to guess ours.
const TIME = z.string().trim().min(1).max(20);

export const bookAppointmentSchema = z.object({
  doctorId: z.string().trim().min(1),
  // The patient is identified by phone; we find-or-create on (clinic, phone) so a
  // partner never has to hold our patient ids.
  patientName: z.string().trim().min(2).max(100),
  patientPhone: z.string().trim().min(6).max(30),
  patientLanguage: z.string().trim().max(30).optional(),
  date: DATE,
  time: TIME,
  // Whether WE send the patient the WhatsApp confirmation. A partner that sends
  // its own messaging can turn this off. Defaults to true.
  notify: z.boolean().optional()
});

export const updateAppointmentSchema = z
  .object({
    status: z.literal('CANCELLED').optional(),
    date: DATE.optional(),
    time: TIME.optional()
  })
  .refine((d) => d.status !== undefined || d.date !== undefined || d.time !== undefined, {
    message: 'Provide status:"CANCELLED" to cancel, or date and/or time to reschedule.'
  })
  .refine((d) => !(d.status !== undefined && (d.date !== undefined || d.time !== undefined)), {
    message: 'Cancel and reschedule are separate operations — send one or the other.'
  });

export const appointmentIdParamsSchema = z.object({ id: z.string().trim().min(1) });
export const slotsQuerySchema = z.object({ date: DATE });

export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

/** The only appointment shape v1 ever returns. Additive changes only. */
export const toPublicAppointment = (a: AppointmentRecord) => ({
  id: a.id,
  status: a.status,
  date: a.appointmentDate.toISOString().slice(0, 10),
  time: a.appointmentTime,
  doctor: a.doctor ? { id: a.doctor.id, name: a.doctor.name, speciality: a.doctor.speciality } : null,
  patient: a.patient ? { id: a.patient.id, name: a.patient.name, phone: a.patient.phone } : null
});
