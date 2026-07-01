// Registers ClinicBook's capabilities into the Healthcare MCP brain. Called once
// at startup (createApp), exactly like the event subscriptions.
//
// Each handler is a THIN wrapper over an existing, tested appointment service —
// no business logic is duplicated here. The brain routes to these; ClinicBook
// still owns "how an appointment is booked". Patient identity comes from
// ctx.actor.patientId (the single shared identity), never re-derived here.

import { forClinic } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';
import { capabilityRegistry } from '../../core/mcp/index.js';
import type { McpContext } from '../../core/mcp/index.js';
import {
  cancelAppointment,
  createAppointment,
  getAppointments,
  updateAppointment
} from './appointments/appointment.service.js';

// Booking on behalf of a patient uses the patient's shared identity from the
// context when the caller didn't pass one explicitly (patient-facing channels).
const resolvePatientId = (ctx: McpContext, input: { patientId?: string }): string => {
  const patientId = input.patientId ?? ctx.actor.patientId;
  if (!patientId) {
    throw new AppError('No patient identity in context for this action.', 400);
  }
  return patientId;
};

// An appointment id must belong to the acting patient before we cancel/move it
// on a patient-facing channel — the brain passes WHO, the capability enforces it.
const assertOwnedByPatient = async (ctx: McpContext, appointmentId: string): Promise<void> => {
  if (ctx.actor.kind !== 'patient' || !ctx.actor.patientId) return; // staff/system: no self-scope
  const db = forClinic(ctx.clinicId);
  const own = await db.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId, patientId: ctx.actor.patientId },
    select: { id: true }
  });
  if (!own) {
    throw new AppError('That appointment was not found under your account.', 404);
  }
};

export const registerClinicBookCapabilities = (): void => {
  // Idempotent: createApp may run more than once (e.g. across tests). Guard on
  // the registry itself so a test that clear()s it can re-register cleanly.
  if (capabilityRegistry.has('appointment.book')) return;

  capabilityRegistry.register({
    name: 'appointment.book',
    product: 'clinicbook',
    description: 'Book an appointment for a patient with a doctor at a date/time.',
    intents: ['book'],
    handler: (ctx, input: {
      patientId?: string;
      doctorId: string;
      appointmentDate: string;
      appointmentTime: string;
      notify?: boolean;
    }) =>
      createAppointment(
        ctx.clinicId,
        {
          patientId: resolvePatientId(ctx, input),
          doctorId: input.doctorId,
          appointmentDate: input.appointmentDate,
          appointmentTime: input.appointmentTime
        },
        // Conversational channels send their own single reply → suppress the
        // duplicate auto-confirmation; other callers keep the default (notify).
        input.notify !== undefined ? { notify: input.notify } : {}
      )
  });

  capabilityRegistry.register({
    name: 'appointment.cancel',
    product: 'clinicbook',
    description: "Cancel an appointment by id (freeing the slot for the waitlist).",
    intents: ['cancel'],
    handler: async (ctx, input: { appointmentId: string }) => {
      await assertOwnedByPatient(ctx, input.appointmentId);
      return cancelAppointment(ctx.clinicId, input.appointmentId);
    }
  });

  capabilityRegistry.register({
    name: 'appointment.reschedule',
    product: 'clinicbook',
    description: 'Move an appointment to a new date/time.',
    intents: ['reschedule'],
    handler: async (ctx, input: { appointmentId: string; appointmentDate: string; appointmentTime: string }) => {
      await assertOwnedByPatient(ctx, input.appointmentId);
      return updateAppointment(ctx.clinicId, input.appointmentId, {
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime
      });
    }
  });

  capabilityRegistry.register({
    name: 'appointment.check',
    product: 'clinicbook',
    description: "List appointments — scoped to the acting patient on patient channels.",
    intents: ['check'],
    handler: async (ctx) => {
      const all = await getAppointments(ctx.clinicId);
      // Patient channels only ever see their OWN appointments.
      if (ctx.actor.kind === 'patient' && ctx.actor.patientId) {
        return all.filter((a) => a.patientId === ctx.actor.patientId);
      }
      return all;
    }
  });
};
