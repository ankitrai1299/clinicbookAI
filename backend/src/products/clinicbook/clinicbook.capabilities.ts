// Registers ClinicBook's capabilities into the Healthcare MCP brain. Called once
// at startup (createApp), exactly like the event subscriptions.
//
// Each handler is a THIN wrapper over an existing, tested appointment service —
// no business logic is duplicated here. The brain routes to these; ClinicBook
// still owns "how an appointment is booked". Patient identity comes from
// ctx.actor.patientId (the single shared identity), never re-derived here.

import { forClinic } from '../../config/tenantPrisma.js';
import { addToWaitlist, claimWaitlistOffer } from './waitlist/waitlist.service.js';
import { AppError } from '../../utils/AppError.js';
import { capabilityRegistry } from '../../core/mcp/index.js';
import type { McpContext } from '../../core/mcp/index.js';
import {
  cancelAppointment,
  createAppointment,
  getAppointments,
  updateAppointment
} from '../../core/appointments/appointment.service.js';

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
      // Patient channels only ever see their OWN appointments — scope it in the
      // query rather than fetching the clinic's history and filtering after.
      if (ctx.actor.kind === 'patient' && ctx.actor.patientId) {
        const mine = await getAppointments(ctx.clinicId, { patientId: ctx.actor.patientId, limit: 100 });
        // Redundant on purpose — see status.skill. A patient seeing someone
        // else's appointment must not depend on the query filter alone.
        return mine.filter((a) => a.patientId === ctx.actor.patientId);
      }
      return getAppointments(ctx.clinicId, { limit: 500 });
    }
  });
};

/**
 * Waitlist, exposed as capabilities so the dashboard assistant can reach it
 * without core/ai importing a product. Waitlist is genuinely ClinicBook-only:
 * a clinic that bought just the scribe has nothing to wait for, and the
 * assistant tells them so rather than crashing on a missing module.
 */
export const registerWaitlistCapabilities = (): void => {
  capabilityRegistry.register({
    name: 'waitlist.add',
    product: 'clinicbook',
    description: 'Put a patient on the waitlist for an earlier slot.',
    handler: (ctx, input: { patientId?: string; priority?: number }) =>
      addToWaitlist(ctx.clinicId, {
        patientId: resolvePatientId(ctx, input),
        priority: input.priority ?? 0
      })
  });

  capabilityRegistry.register({
    name: 'waitlist.claim',
    product: 'clinicbook',
    description: 'Claim a slot that was offered to a waitlisted patient.',
    handler: (ctx) => claimWaitlistOffer(ctx.clinicId, resolvePatientId(ctx, {}))
  });
};
