import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import {
  notifyBookingConfirmation,
  notifyAppointmentRejectedWithAlternatives
} from '../whatsapp/whatsapp.notifications.js';
import { recordNotification } from '../notifications/notification.service.js';
import { autoOfferFreedSlot } from '../waitlist/waitlist.service.js';
import { canonicalizeTime, isPastSlot } from '../../services/scheduling.service.js';
import { runPostVisitWorkflow } from './postVisit.service.js';
import { CreateAppointmentInput, UpdateAppointmentInput } from './appointment.schemas.js';

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

    // Automatic waitlist recovery: offer the freed slot to the next waiting patient.
    void autoOfferFreedSlot(appt.clinicId, appt.doctorId, appt.appointmentDate, appt.appointmentTime).catch(
      (err: unknown) => console.error('[Waitlist] Auto-offer on cancellation failed:', err)
    );
  }
};

const appointmentInclude = {
  doctor: {
    select: {
      id: true,
      name: true,
      speciality: true
    }
  },
  patient: {
    select: {
      id: true,
      name: true,
      phone: true,
      language: true
    }
  },
  clinic: {
    select: {
      id: true,
      name: true,
      plan: true
    }
  },
  reminders: {
    select: {
      id: true,
      type: true,
      sent: true
    }
  }
} as const;

export type AppointmentRecord = Appointment & {
  doctor?: {
    id: string;
    name: string;
    speciality: string;
  };
  patient?: {
    id: string;
    name: string;
    phone: string;
    language: string;
  };
  clinic?: {
    id: string;
    name: string;
    plan: string;
  };
  reminders?: Array<{
    id: string;
    type: string;
    sent: boolean;
  }>;
};

const normalizeDate = (appointmentDate: string) => {
  const date = new Date(appointmentDate);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid appointment date', 400);
  }

  return date;
};

const ensureClinicDoctorPatient = async (clinicId: string, doctorId: string, patientId: string) => {
  const [doctor, patient] = await Promise.all([
    prisma.doctor.findFirst({ where: { id: doctorId, clinicId }, select: { id: true } }),
    prisma.patient.findFirst({ where: { id: patientId, clinicId }, select: { id: true } })
  ]);

  if (!doctor) {
    throw new AppError('Doctor not found', 404);
  }

  if (!patient) {
    throw new AppError('Patient not found', 404);
  }
};

const ensureAppointmentExists = async (clinicId: string, id: string) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { id: true }
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }
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

  await ensureClinicDoctorPatient(clinicId, input.doctorId, input.patientId);

  const appointmentDate = normalizeDate(input.appointmentDate);
  const appointmentTime = normalizeTime(input.appointmentTime);

  // P0 guard (defense-in-depth): refuse any slot at/before the current clinic
  // moment. Every booking path — WhatsApp FSM, staff dashboard, and waitlist
  // promotion (claim/convert) — funnels through here, so a past slot can never
  // be persisted even if an upstream UI ever offered one.
  if (isPastSlot(appointmentDate.toISOString().slice(0, 10), appointmentTime)) {
    throw new AppError('That appointment time is in the past. Please pick a future slot.', 400);
  }

  // Atomic slot lock. Re-check inside a transaction that no active (non-cancelled)
  // appointment already holds this doctor/date/time, then create. The partial
  // unique index "Appointment_active_slot_key" is the final backstop against a
  // concurrent booking that slips between the check and the insert — it surfaces
  // as a P2002, which we translate to a clean 409.
  let appointment: AppointmentRecord;
  try {
    appointment = await prisma.$transaction(async (tx) => {
      const clash = await tx.appointment.findFirst({
        where: {
          clinicId,
          doctorId: input.doctorId,
          appointmentDate,
          appointmentTime,
          status: { not: AppointmentStatus.CANCELLED }
        },
        select: { id: true }
      });
      if (clash) {
        throw new AppError('That time slot is already booked for this doctor.', 409);
      }

      return tx.appointment.create({
        data: {
          clinicId,
          doctorId: input.doctorId,
          patientId: input.patientId,
          appointmentDate,
          appointmentTime,
          status: input.status ?? AppointmentStatus.PENDING
        },
        include: appointmentInclude
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('That time slot is already booked for this doctor.', 409);
    }
    throw err;
  }

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

  return appointment;
};

export const getAppointments = async (clinicId: string): Promise<AppointmentRecord[]> => {
  return prisma.appointment.findMany({
    where: { clinicId },
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
    include: appointmentInclude
  });
};

export const getSingleAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId },
    include: appointmentInclude
  });

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
  const current = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { status: true, doctorId: true, patientId: true, appointmentDate: true, appointmentTime: true }
  });

  if (!current) {
    throw new AppError('Appointment not found', 404);
  }

  if (input.doctorId !== undefined || input.patientId !== undefined) {
    await ensureClinicDoctorPatient(
      clinicId,
      input.doctorId ?? current.doctorId,
      input.patientId ?? current.patientId
    );
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

  // Race guard for status changes (e.g. a double-clicked "Confirm" on the
  // dashboard). When the status is actually changing, scope the update to the
  // status we just read: only ONE concurrent request can match and flip it, so
  // onStatusTransition (which messages the patient) fires exactly once. The
  // loser matches no row → Prisma throws P2025 → we return the current record
  // with no duplicate WhatsApp confirmation.
  const statusChanging = input.status !== undefined && input.status !== current.status;

  // Lifecycle guard: reject illegal status jumps (e.g. reopening a completed or
  // cancelled appointment, or completing one that was never confirmed).
  if (statusChanging) {
    assertTransition(current.status, input.status as AppointmentStatus);
  }

  let appointment: AppointmentRecord;
  try {
    appointment = await prisma.appointment.update({
      where: statusChanging ? { id, status: current.status } : { id },
      data: {
        ...(input.doctorId !== undefined ? { doctorId: input.doctorId } : {}),
        ...(input.patientId !== undefined ? { patientId: input.patientId } : {}),
        ...(input.appointmentDate !== undefined ? { appointmentDate: normalizeDate(input.appointmentDate) } : {}),
        ...(input.appointmentTime !== undefined ? { appointmentTime: normalizeTime(input.appointmentTime) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      },
      include: appointmentInclude
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('That time slot is already booked for this doctor.', 409);
    }
    // Lost the concurrent status-change race: another request already applied
    // this exact transition (and sent any patient notification). Return the
    // current record instead of erroring or sending a duplicate message.
    if (statusChanging && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return getSingleAppointment(clinicId, id);
    }
    throw err;
  }

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
  }

  return appointment;
};

export const cancelAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  const prev = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { status: true }
  });
  if (!prev) {
    throw new AppError('Appointment not found', 404);
  }

  // Already cancelled → idempotent no-op (no duplicate side-effects).
  if (prev.status === AppointmentStatus.CANCELLED) {
    return getSingleAppointment(clinicId, id);
  }
  // Can't cancel a completed (or no-show) appointment.
  assertTransition(prev.status, AppointmentStatus.CANCELLED);

  const appointment = await prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.CANCELLED },
    include: appointmentInclude
  });

  onStatusTransition(prev.status, appointment);
  return appointment;
};

export const completeAppointment = async (
  clinicId: string,
  id: string,
  completedBy: string
): Promise<AppointmentRecord> => {
  const current = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { status: true }
  });
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

  // Race guard: scope the update to the CONFIRMED status we just read so two
  // concurrent "Mark Completed" clicks flip the row exactly once. Only the
  // winner runs the post-visit workflow (the thank-you WhatsApp); the loser
  // matches no row (P2025) and returns the current record with no duplicate.
  let appointment: AppointmentRecord;
  try {
    appointment = await prisma.appointment.update({
      where: { id, status: AppointmentStatus.CONFIRMED },
      data: {
        status: AppointmentStatus.COMPLETED,
        completedAt: new Date(),
        completedBy
      },
      include: appointmentInclude
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return getSingleAppointment(clinicId, id);
    }
    throw err;
  }

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
  const current = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { status: true }
  });
  if (!current) {
    throw new AppError('Appointment not found', 404);
  }
  if (current.status === AppointmentStatus.NO_SHOW) {
    return getSingleAppointment(clinicId, id);
  }
  // Only a pending/confirmed appointment can be marked no-show — never a
  // completed or cancelled one.
  assertTransition(current.status, AppointmentStatus.NO_SHOW);

  return prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.NO_SHOW },
    include: appointmentInclude
  });
};