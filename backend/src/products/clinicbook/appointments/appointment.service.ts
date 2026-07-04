import { AppointmentStatus } from '@prisma/client';

import { AppError } from '../../../utils/AppError.js';
import {
  notifyBookingConfirmation,
  notifyAppointmentRejectedWithAlternatives
} from '../../../core/whatsapp/whatsapp.notifications.js';
import { recordNotification } from '../../../core/notifications/notification.service.js';
import { eventBus } from '../../../core/events/index.js';
import { autoOfferFreedSlot } from '../waitlist/waitlist.service.js';
import { canonicalizeTime, isPastSlot } from '../../../services/scheduling.service.js';
import { runPostVisitWorkflow } from './postVisit.service.js';
import { CreateAppointmentInput, UpdateAppointmentInput } from './appointment.schemas.js';
import { appointmentSourceFor } from './appointmentSource.js';
import type { AppointmentRecord } from './appointment.port.js';
import { LOST_RACE } from './appointment.port.js';

// Re-exported so existing importers (postVisit.service, etc.) are unaffected by
// the type's move into appointment.port.
export type { AppointmentRecord } from './appointment.port.js';

// This service owns the ORCHESTRATION of appointments — lifecycle guards,
// WhatsApp + dashboard notifications, cross-product events, waitlist recovery,
// post-visit workflow. The raw persistence (atomic slot-lock, concurrency
// semantics, reads) lives behind AppointmentPort (native Prisma today, an EMR
// adapter later), reached via appointmentSourceFor(clinicId). No caller changes
// when a clinic's bookings move to an external HMIS.

// Store every appointment time in the one canonical "HH:MM AM/PM" shape so slot
// generation, double-booking checks and reminders all compare like-for-like.
// Falls back to the trimmed input if it can't be parsed (never silently drops it).
const normalizeTime = (time: string): string => canonicalizeTime(time) ?? time.trim();

const whenLabel = (appt: AppointmentRecord): string =>
  `${appt.appointmentDate.toISOString().slice(0, 10)} at ${appt.appointmentTime}`;

// ---------------------------------------------------------------------------
// Appointment lifecycle guard. The ONLY legal transitions are:
//   PENDING   → CONFIRMED | CANCELLED | NO_SHOW
//   CONFIRMED → COMPLETED | CANCELLED | NO_SHOW
//   CANCELLED → (terminal)   COMPLETED → (terminal)   NO_SHOW → (terminal)
// Terminal states have NO outgoing transitions, so a completed or cancelled
// appointment can never be reopened/reactivated. isValidTransition is pure
// (unit-tested); assertTransition is the throwing guard used by write paths.
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  [AppointmentStatus.CONFIRMED]: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  [AppointmentStatus.CANCELLED]: [],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.NO_SHOW]: []
};

export const isValidTransition = (from: AppointmentStatus, to: AppointmentStatus): boolean =>
  from === to || ALLOWED_TRANSITIONS[from].includes(to);

const FRIENDLY = {
  PENDING: 'awaiting confirmation',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'missed'
} as const;

const assertTransition = (from: AppointmentStatus, to: AppointmentStatus): void => {
  if (!isValidTransition(from, to)) {
    throw new AppError(`Cannot move a ${FRIENDLY[from]} appointment to ${FRIENDLY[to]}.`, 409);
  }
};

// Central place for everything that must happen when an appointment's status
// transitions. Keeps the WhatsApp + dashboard-notification side-effects in ONE
// spot so every path (dashboard approve/reject, AI cancel, PATCH) behaves the
// same. All side-effects are fire-and-forget and never block the DB result.
const onStatusTransition = (prev: AppointmentStatus, appt: AppointmentRecord): void => {
  if (appt.status === prev) return;

  const patientName = appt.patient?.name ?? 'A patient';
  const doctorName = appt.doctor?.name ?? 'the doctor';

  if (appt.status === AppointmentStatus.CONFIRMED) {
    // Requirement 6: approval sends a WhatsApp confirmation to the patient.
    if (appt.patient?.phone && appt.doctor && appt.clinic) {
      notifyBookingConfirmation({
        to: appt.patient.phone,
        clinicId: appt.clinicId,
        patientName: appt.patient.name,
        doctorName: appt.doctor.name,
        clinicName: appt.clinic.name,
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime
      });
    }
    recordNotification({
      clinicId: appt.clinicId,
      type: 'APPOINTMENT_CONFIRMED',
      title: 'Appointment confirmed',
      body: `${patientName}'s appointment with ${doctorName} on ${whenLabel(appt)} was confirmed.`,
      appointmentId: appt.id
    });
  } else if (appt.status === AppointmentStatus.CANCELLED) {
    // Requirement 7: rejection sends the patient alternate slots to rebook.
    if (appt.patient?.phone && appt.doctor && appt.clinic) {
      notifyAppointmentRejectedWithAlternatives({
        to: appt.patient.phone,
        clinicId: appt.clinicId,
        doctorId: appt.doctorId,
        patientName: appt.patient.name,
        doctorName: appt.doctor.name,
        clinicName: appt.clinic.name,
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime
      });
    }
    recordNotification({
      clinicId: appt.clinicId,
      type: 'APPOINTMENT_CANCELLED',
      title: 'Appointment cancelled',
      body: `${patientName}'s appointment with ${doctorName} on ${whenLabel(appt)} was cancelled. Alternate slots were offered.`,
      appointmentId: appt.id
    });

    // Cross-product domain event (fire-and-forget, isolated, no-op until
    // subscribed). Emitted here so BOTH cancel paths — cancelAppointment and
    // updateAppointment(status=CANCELLED) — publish exactly once.
    eventBus.emit('appointment.cancelled', {
      clinicId: appt.clinicId,
      appointmentId: appt.id,
      patientId: appt.patientId,
      doctorId: appt.doctorId
    });

    // Automatic waitlist recovery: offer the freed slot to the next waiting patient.
    void autoOfferFreedSlot(appt.clinicId, appt.doctorId, appt.appointmentDate, appt.appointmentTime).catch(
      (err: unknown) => console.error('[Waitlist] Auto-offer on cancellation failed:', err)
    );
  }
};

const normalizeDate = (appointmentDate: string) => {
  const date = new Date(appointmentDate);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid appointment date', 400);
  }
  return date;
};

export const createAppointment = async (
  clinicId: string,
  input: CreateAppointmentInput,
  options: { notify?: boolean } = {}
): Promise<AppointmentRecord> => {
  // notify defaults to true (staff dashboard path). The WhatsApp bot passes
  // notify:false because the conversational agent sends its own single reply —
  // a second auto-confirmation would be a duplicate message to the patient.
  const notify = options.notify ?? true;
  const src = appointmentSourceFor(clinicId);

  const appointmentDate = normalizeDate(input.appointmentDate);
  const appointmentTime = normalizeTime(input.appointmentTime);

  // P0 guard (defense-in-depth): refuse any slot at/before the current clinic
  // moment. Every booking path — WhatsApp FSM, staff dashboard, and waitlist
  // promotion (claim/convert) — funnels through here, so a past slot can never
  // be persisted even if an upstream UI ever offered one.
  if (isPastSlot(appointmentDate.toISOString().slice(0, 10), appointmentTime)) {
    throw new AppError('That appointment time is in the past. Please pick a future slot.', 400);
  }

  // Existence checks + atomic slot lock live in the port (a clean 409 on clash).
  const appointment = await src.create({
    doctorId: input.doctorId,
    patientId: input.patientId,
    appointmentDate,
    appointmentTime,
    status: input.status ?? AppointmentStatus.PENDING
  });

  // Fire-and-forget WhatsApp booking confirmation (no-op if WhatsApp unconfigured).
  if (notify && appointment.patient?.phone && appointment.doctor && appointment.clinic) {
    notifyBookingConfirmation({
      to: appointment.patient.phone,
      clinicId: appointment.clinicId,
      patientName: appointment.patient.name,
      doctorName: appointment.doctor.name,
      clinicName: appointment.clinic.name,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime
    });
  }

  // Requirement 4: every new booking raises a dashboard notification so staff see
  // bot-originated bookings (notify:false path) the moment they land.
  recordNotification({
    clinicId,
    type: 'APPOINTMENT_BOOKED',
    title: 'New appointment booked',
    body: `${appointment.patient?.name ?? 'A patient'} booked ${appointment.doctor?.name ?? 'a doctor'} on ${whenLabel(appointment)} (status: ${appointment.status}).`,
    appointmentId: appointment.id
  });

  // Cross-product domain event so OTHER modules (PatientLoop reminders, Calendar,
  // Analytics) can react WITHOUT ClinicBook importing them. Fire-and-forget and
  // isolated — emit never throws and no path is blocked; a no-op until something
  // subscribes, so ClinicBook's own behaviour is unchanged.
  eventBus.emit('appointment.booked', {
    clinicId,
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    patientName: appointment.patient?.name,
    doctorName: appointment.doctor?.name,
    status: appointment.status,
    appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
    appointmentTime: appointment.appointmentTime
  });

  return appointment;
};

export const getAppointments = (clinicId: string): Promise<AppointmentRecord[]> =>
  appointmentSourceFor(clinicId).list();

export const getSingleAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  const appointment = await appointmentSourceFor(clinicId).findFull(id);
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }
  return appointment;
};

export const updateAppointment = async (
  clinicId: string,
  id: string,
  input: UpdateAppointmentInput
): Promise<AppointmentRecord> => {
  const src = appointmentSourceFor(clinicId);
  const current = await src.findState(id);
  if (!current) {
    throw new AppError('Appointment not found', 404);
  }

  if (input.doctorId !== undefined || input.patientId !== undefined) {
    await src.assertRefs(input.doctorId ?? current.doctorId, input.patientId ?? current.patientId);
  }

  // P0 guard: a reschedule (date and/or time change) must land in the future.
  // A status-only change (e.g. confirm/complete) is exempt — it doesn't move the
  // slot — so we only check when a new date or time is supplied.
  if (input.appointmentDate !== undefined || input.appointmentTime !== undefined) {
    const newDate = input.appointmentDate !== undefined ? normalizeDate(input.appointmentDate) : current.appointmentDate;
    const newTime = input.appointmentTime !== undefined ? normalizeTime(input.appointmentTime) : current.appointmentTime;
    if (isPastSlot(newDate.toISOString().slice(0, 10), newTime)) {
      throw new AppError('That appointment time is in the past. Please pick a future slot.', 400);
    }
  }

  // When the status is actually changing, guard the write on the status we just
  // read so only ONE concurrent request flips it and onStatusTransition (which
  // messages the patient) fires exactly once. The loser gets LOST_RACE → we
  // return the current record with no duplicate WhatsApp confirmation.
  const statusChanging = input.status !== undefined && input.status !== current.status;

  // Lifecycle guard: reject illegal status jumps (e.g. reopening a completed or
  // cancelled appointment, or completing one that was never confirmed).
  if (statusChanging) {
    assertTransition(current.status, input.status as AppointmentStatus);
  }

  const result = await src.applyUpdate(
    id,
    {
      ...(input.doctorId !== undefined ? { doctorId: input.doctorId } : {}),
      ...(input.patientId !== undefined ? { patientId: input.patientId } : {}),
      ...(input.appointmentDate !== undefined ? { appointmentDate: normalizeDate(input.appointmentDate) } : {}),
      ...(input.appointmentTime !== undefined ? { appointmentTime: normalizeTime(input.appointmentTime) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    },
    statusChanging ? { expectedStatus: current.status } : {}
  );

  // Lost the concurrent status-change race: another request already applied this
  // exact transition (and sent any patient notification). Return the current
  // record instead of erroring or sending a duplicate message.
  if (result === LOST_RACE) {
    return getSingleAppointment(clinicId, id);
  }
  const appointment = result;

  // Status side-effects (approve → confirm WhatsApp; cancel → alternates).
  onStatusTransition(current.status, appointment);

  // Reschedule side-effect: date/time changed without a status transition having
  // already messaged the patient. Tell them the new time and log a notification.
  const dateChanged =
    input.appointmentDate !== undefined &&
    appointment.appointmentDate.getTime() !== current.appointmentDate.getTime();
  const timeChanged =
    input.appointmentTime !== undefined && appointment.appointmentTime !== current.appointmentTime;

  if ((dateChanged || timeChanged) && appointment.status !== AppointmentStatus.CANCELLED) {
    if (appointment.patient?.phone && appointment.doctor && appointment.clinic) {
      notifyBookingConfirmation({
        to: appointment.patient.phone,
        clinicId: appointment.clinicId,
        patientName: appointment.patient.name,
        doctorName: appointment.doctor.name,
        clinicName: appointment.clinic.name,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime
      });
    }
    recordNotification({
      clinicId,
      type: 'APPOINTMENT_RESCHEDULED',
      title: 'Appointment rescheduled',
      body: `${appointment.patient?.name ?? 'A patient'}'s appointment with ${appointment.doctor?.name ?? 'the doctor'} was moved to ${whenLabel(appointment)}.`,
      appointmentId: appointment.id
    });

    // Cross-product domain event (fire-and-forget, isolated, no-op until
    // subscribed) so Calendar/Analytics/PatientLoop can react to the new slot.
    eventBus.emit('appointment.rescheduled', {
      clinicId,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
      appointmentTime: appointment.appointmentTime
    });
  }

  return appointment;
};

export const cancelAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  const src = appointmentSourceFor(clinicId);
  const prev = await src.findState(id);
  if (!prev) {
    throw new AppError('Appointment not found', 404);
  }

  // Already cancelled → idempotent no-op (no duplicate side-effects).
  if (prev.status === AppointmentStatus.CANCELLED) {
    return getSingleAppointment(clinicId, id);
  }
  // Can't cancel a completed (or no-show) appointment.
  assertTransition(prev.status, AppointmentStatus.CANCELLED);

  const result = await src.applyUpdate(id, { status: AppointmentStatus.CANCELLED });
  const appointment = result === LOST_RACE ? await getSingleAppointment(clinicId, id) : result;

  onStatusTransition(prev.status, appointment);
  return appointment;
};

export const completeAppointment = async (
  clinicId: string,
  id: string,
  completedBy: string
): Promise<AppointmentRecord> => {
  const src = appointmentSourceFor(clinicId);
  const current = await src.findState(id);
  if (!current) {
    throw new AppError('Appointment not found', 404);
  }

  // Idempotent: already completed → return as-is without a duplicate thank-you.
  if (current.status === AppointmentStatus.COMPLETED) {
    return getSingleAppointment(clinicId, id);
  }

  // Workflow guard: only a CONFIRMED appointment can be completed
  // (PENDING → CONFIRMED → COMPLETED). Reject everything else.
  if (current.status !== AppointmentStatus.CONFIRMED) {
    throw new AppError('Only confirmed appointments can be marked completed', 409);
  }

  // Guard the write on CONFIRMED so two concurrent "Mark Completed" clicks flip
  // the row exactly once. Only the winner runs the post-visit workflow; the
  // loser gets LOST_RACE and returns the current record with no duplicate.
  const result = await src.applyUpdate(
    id,
    { status: AppointmentStatus.COMPLETED, completedAt: new Date(), completedBy },
    { expectedStatus: AppointmentStatus.CONFIRMED }
  );
  if (result === LOST_RACE) {
    return getSingleAppointment(clinicId, id);
  }
  const appointment = result;

  // Dashboard notification so staff see the completion in the feed.
  recordNotification({
    clinicId,
    type: 'APPOINTMENT_COMPLETED',
    title: 'Appointment completed',
    body: `${appointment.patient?.name ?? 'A patient'}'s appointment with ${appointment.doctor?.name ?? 'the doctor'} on ${whenLabel(appointment)} was marked completed.`,
    appointmentId: appointment.id
  });

  // Post-visit automation: thank-you WhatsApp now, plus any future feedback /
  // rating / follow-up / prescription actions registered on the workflow.
  runPostVisitWorkflow(appointment);

  return appointment;
};

export const markNoShowAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  const src = appointmentSourceFor(clinicId);
  const current = await src.findState(id);
  if (!current) {
    throw new AppError('Appointment not found', 404);
  }
  if (current.status === AppointmentStatus.NO_SHOW) {
    return getSingleAppointment(clinicId, id);
  }
  // Only a pending/confirmed appointment can be marked no-show — never a
  // completed or cancelled one.
  assertTransition(current.status, AppointmentStatus.NO_SHOW);

  const result = await src.applyUpdate(id, { status: AppointmentStatus.NO_SHOW });
  return result === LOST_RACE ? getSingleAppointment(clinicId, id) : result;
};
