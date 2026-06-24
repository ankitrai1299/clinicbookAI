import { WaitlistStatus } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { notifyWaitlistOffer, notifyWaitlistSlotOffer } from '../whatsapp/whatsapp.notifications.js';
import { createAppointment } from '../appointments/appointment.service.js';
import { AddToWaitlistInput, ConvertWaitlistInput, UpdateWaitlistPriorityInput } from './waitlist.schemas.js';

const waitlistInclude = {
  patient: {
    select: { id: true, name: true, phone: true, language: true }
  }
} as const;

const ensureEntry = async (clinicId: string, id: string) => {
  const entry = await prisma.waitlist.findFirst({
    where: { id, clinicId },
    select: { id: true, status: true }
  });
  if (!entry) throw new AppError('Waitlist entry not found', 404);
  return entry;
};

const requireStatus = (current: WaitlistStatus, allowed: WaitlistStatus[], action: string) => {
  if (!allowed.includes(current)) {
    throw new AppError(`Cannot ${action} a waitlist entry with status ${current}`, 409);
  }
};

export const getWaitlist = (clinicId: string, status?: WaitlistStatus) =>
  prisma.waitlist.findMany({
    where: { clinicId, ...(status ? { status } : {}) },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    include: waitlistInclude
  });

export const getWaitlistEntry = async (clinicId: string, id: string) => {
  const entry = await prisma.waitlist.findFirst({
    where: { id, clinicId },
    include: waitlistInclude
  });
  if (!entry) throw new AppError('Waitlist entry not found', 404);
  return entry;
};

export const addToWaitlist = async (clinicId: string, input: AddToWaitlistInput) => {
  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId },
    select: { id: true }
  });
  if (!patient) throw new AppError('Patient not found', 404);

  const existing = await prisma.waitlist.findUnique({
    where: { patientId: input.patientId },
    select: { id: true, status: true }
  });

  if (existing) {
    if (existing.status !== WaitlistStatus.CANCELLED) {
      throw new AppError('Patient is already on the waitlist', 409);
    }
    return prisma.waitlist.update({
      where: { id: existing.id },
      data: { priority: input.priority ?? 0, status: WaitlistStatus.WAITING },
      include: waitlistInclude
    });
  }

  return prisma.waitlist.create({
    data: { clinicId, patientId: input.patientId, priority: input.priority ?? 0 },
    include: waitlistInclude
  });
};

export const updateWaitlistPriority = async (
  clinicId: string,
  id: string,
  input: UpdateWaitlistPriorityInput
) => {
  await ensureEntry(clinicId, id);
  return prisma.waitlist.update({
    where: { id },
    data: { priority: input.priority },
    include: waitlistInclude
  });
};

export const offerWaitlistSlot = async (clinicId: string, id: string) => {
  const entry = await ensureEntry(clinicId, id);
  requireStatus(entry.status, [WaitlistStatus.WAITING, WaitlistStatus.RESPONDED], 'offer');
  const updated = await prisma.waitlist.update({
    where: { id },
    data: { status: WaitlistStatus.OFFERED },
    include: waitlistInclude
  });

  // Fire-and-forget WhatsApp waitlist offer (no-op if WhatsApp unconfigured).
  if (updated.patient?.phone) {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true }
    });
    notifyWaitlistOffer({
      to: updated.patient.phone,
      clinicId,
      patientName: updated.patient.name,
      clinicName: clinic?.name ?? 'our clinic'
    });
  }

  return updated;
};

export const respondWaitlistEntry = async (clinicId: string, id: string) => {
  const entry = await ensureEntry(clinicId, id);
  requireStatus(entry.status, [WaitlistStatus.OFFERED], 'mark as responded');
  return prisma.waitlist.update({
    where: { id },
    data: { status: WaitlistStatus.RESPONDED },
    include: waitlistInclude
  });
};

export const convertWaitlistToAppointment = async (
  clinicId: string,
  id: string,
  input: ConvertWaitlistInput
) => {
  const entry = await ensureEntry(clinicId, id);
  requireStatus(entry.status, [WaitlistStatus.OFFERED, WaitlistStatus.RESPONDED], 'convert');

  const waitlistEntry = await prisma.waitlist.findFirst({
    where: { id, clinicId },
    select: { patientId: true }
  });
  if (!waitlistEntry) throw new AppError('Waitlist entry not found', 404);

  // Book the slot through the SAME path as a normal booking. createAppointment:
  //  - validates the doctor AND patient belong to this clinic,
  //  - normalizes the date and time,
  //  - inside a transaction, re-checks that no active (non-cancelled) appointment
  //    already holds this doctor/date/time and throws a 409 BEFORE inserting.
  // So a taken slot is rejected up front (not via a DB unique-index exception)
  // and no appointment row — i.e. no partial record — is ever created.
  let appointment;
  try {
    appointment = await createAppointment(
      clinicId,
      {
        patientId: waitlistEntry.patientId,
        doctorId: input.doctorId,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime
      },
      { notify: false }
    );
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409) {
      // Slot was taken between the offer and this conversion. Surface a clean,
      // patient-facing 409 and leave the waitlist entry untouched.
      throw new AppError(
        'Sorry, this slot is no longer available. Please choose another available time.',
        409
      );
    }
    throw err;
  }

  // Mark the entry CONVERTED only after the appointment was successfully created,
  // so a failed booking never leaves the entry in a half-converted state.
  const updatedEntry = await prisma.waitlist.update({
    where: { id },
    data: { status: WaitlistStatus.CONVERTED },
    include: waitlistInclude
  });

  return { waitlistEntry: updatedEntry, appointment };
};

// --- Automatic waitlist workflow ------------------------------------------

// 15-minute hold on an auto-offered slot before it rolls to the next patient.
export const WAITLIST_HOLD_MS = 15 * 60 * 1000;
// FSM state the patient's WhatsApp session is parked in while an offer is live,
// so a "YES"/"NO" reply is routed to the waitlist-offer handler. MUST match
// S.WAITLIST_OFFER in whatsapp.booking.ts.
const WAITLIST_OFFER_STATE = 'WAITLIST_OFFER';

const digits = (s: string): string => s.replace(/\D/g, '');

// Park (or clear) the patient's WhatsApp FSM session so their reply is handled
// as a waitlist response. Written directly (no import of the booking module) to
// avoid a cycle. Best-effort: a session write failure never breaks the offer.
const setWaSessionState = async (
  phone: string,
  clinicId: string,
  patientId: string,
  state: string
): Promise<void> => {
  const p = digits(phone);
  if (!p) return;
  await prisma.whatsAppSession
    .upsert({
      where: { phone: p },
      create: { phone: p, clinicId, patientId, state, data: '{}' },
      update: { clinicId, patientId, state, data: '{}' }
    })
    .catch((err) => console.error('[Waitlist] session state write failed:', err));
};

// Add (or refresh) a patient's waitlist entry from the WhatsApp FSM, recording
// what they were trying to book so a freed slot can be matched to them. One
// entry per patient (patientId is unique) — re-joining just updates it.
export const joinWaitlist = async (params: {
  clinicId: string;
  patientId: string;
  doctorId?: string | null;
  speciality?: string | null;
  date?: string | null;
}) => {
  const data = {
    clinicId: params.clinicId,
    status: WaitlistStatus.WAITING,
    desiredDoctorId: params.doctorId ?? null,
    desiredSpeciality: params.speciality ?? null,
    desiredDate: params.date ? new Date(`${params.date}T00:00:00.000Z`) : null,
    // Clear any stale offer parked on a previous entry.
    offeredDoctorId: null,
    offeredDate: null,
    offeredTime: null,
    offeredExpiresAt: null
  };
  const existing = await prisma.waitlist.findUnique({ where: { patientId: params.patientId }, select: { id: true } });
  if (existing) {
    return prisma.waitlist.update({ where: { id: existing.id }, data, include: waitlistInclude });
  }
  return prisma.waitlist.create({
    data: { patientId: params.patientId, priority: 0, ...data },
    include: waitlistInclude
  });
};

// The patient's currently-live (non-expired) slot offer, or null. Used by the
// FSM to render the offer and to decide whether a YES/NO is a waitlist reply.
export const pendingOfferFor = async (clinicId: string, patientId: string, now: Date = new Date()) => {
  const entry = await prisma.waitlist.findFirst({
    where: { clinicId, patientId, status: WaitlistStatus.OFFERED },
    include: waitlistInclude
  });
  if (!entry || !entry.offeredExpiresAt || entry.offeredExpiresAt.getTime() <= now.getTime()) return null;
  return entry;
};

// Called when a cancellation frees a slot. Offers that EXACT slot to the best
// WAITING patient (prefers one who wanted this doctor), parks the slot + a
// 15-minute hold on their entry, flips to OFFERED, sets their FSM session to the
// waitlist-offer state, and WhatsApps a "reply YES to claim" message. No-op if
// no eligible patient. Returns the offered entry (or null).
export const autoOfferFreedSlot = async (
  clinicId: string,
  doctorId: string,
  appointmentDate: Date,
  appointmentTime: string,
  now: Date = new Date()
) => {
  // Candidates: anyone WAITING who wanted this doctor, or who didn't specify a
  // doctor. Prefer an exact doctor match, else the highest-priority general entry.
  const candidates = await prisma.waitlist.findMany({
    where: {
      clinicId,
      status: WaitlistStatus.WAITING,
      OR: [{ desiredDoctorId: doctorId }, { desiredDoctorId: null }]
    },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    include: waitlistInclude
  });
  const next = candidates.find((c) => c.desiredDoctorId === doctorId) ?? candidates[0];
  if (!next) return null;

  const updated = await prisma.waitlist.update({
    where: { id: next.id },
    data: {
      status: WaitlistStatus.OFFERED,
      offeredDoctorId: doctorId,
      offeredDate: appointmentDate,
      offeredTime: appointmentTime,
      offeredExpiresAt: new Date(now.getTime() + WAITLIST_HOLD_MS)
    },
    include: waitlistInclude
  });

  const [doctor, clinic] = await Promise.all([
    prisma.doctor.findUnique({ where: { id: doctorId }, select: { name: true } }),
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } })
  ]);

  if (updated.patient?.phone) {
    // Park their FSM session FIRST so a fast "YES" reply is routed correctly.
    await setWaSessionState(updated.patient.phone, clinicId, updated.patientId, WAITLIST_OFFER_STATE);
    notifyWaitlistSlotOffer({
      to: updated.patient.phone,
      clinicId,
      patientName: updated.patient.name,
      doctorName: doctor?.name ?? 'our doctor',
      clinicName: clinic?.name ?? 'our clinic',
      appointmentDate,
      appointmentTime
    });
  }

  console.info(`[Waitlist] Auto-offered freed slot ${appointmentDate.toISOString().slice(0, 10)} ${appointmentTime} to ${updated.patient?.name} (entry ${updated.id}, holds 15m)`);
  return updated;
};

// Patient replied NO (or the FSM is declining for them): drop this offer and
// roll the slot to the next waiting patient. Returns the next offered entry.
export const declineWaitlistOffer = async (clinicId: string, patientId: string) => {
  const entry = await prisma.waitlist.findFirst({
    where: { clinicId, patientId, status: WaitlistStatus.OFFERED }
  });
  if (!entry) return null;
  const { offeredDoctorId, offeredDate, offeredTime } = entry;
  await prisma.waitlist.update({
    where: { id: entry.id },
    data: { status: WaitlistStatus.CANCELLED, offeredDoctorId: null, offeredDate: null, offeredTime: null, offeredExpiresAt: null }
  });
  if (offeredDoctorId && offeredDate && offeredTime) {
    return autoOfferFreedSlot(clinicId, offeredDoctorId, offeredDate, offeredTime);
  }
  return null;
};

// Cron sweep: any OFFER whose 15-minute hold has elapsed is dropped and the slot
// is rolled to the next waiting patient. Returns how many offers expired.
export const expireStaleOffers = async (now: Date = new Date()): Promise<number> => {
  const stale = await prisma.waitlist.findMany({
    where: { status: WaitlistStatus.OFFERED, offeredExpiresAt: { lt: now } },
    include: waitlistInclude
  });
  let expired = 0;
  for (const entry of stale) {
    const { clinicId, offeredDoctorId, offeredDate, offeredTime } = entry;
    await prisma.waitlist.update({
      where: { id: entry.id },
      data: { status: WaitlistStatus.CANCELLED, offeredDoctorId: null, offeredDate: null, offeredTime: null, offeredExpiresAt: null }
    });
    // Free the patient's FSM session (no live turn will do it for them).
    if (entry.patient?.phone) await setWaSessionState(entry.patient.phone, clinicId, entry.patientId, 'BOOKED');
    expired += 1;
    console.info(`[Waitlist] Offer expired for ${entry.patient?.name} (entry ${entry.id}) → rolling to next`);
    if (offeredDoctorId && offeredDate && offeredTime) {
      await autoOfferFreedSlot(clinicId, offeredDoctorId, offeredDate, offeredTime, now);
    }
  }
  return expired;
};

// Called when a waitlisted patient replies YES to a slot offer (via the AI
// agent's claim_waitlist_offer tool). Books the parked slot atomically through
// createAppointment (slot lock + dashboard notification), marks CONVERTED. If
// the slot was taken in the meantime, returns the entry to WAITING.
export const claimWaitlistOffer = async (clinicId: string, patientId: string) => {
  const entry = await prisma.waitlist.findFirst({
    where: { clinicId, patientId, status: WaitlistStatus.OFFERED }
  });
  if (!entry || !entry.offeredDoctorId || !entry.offeredDate || !entry.offeredTime) {
    return { success: false, error: 'No active slot offer to claim.' };
  }
  // The 15-minute hold lapsed before they replied — treat as no active offer
  // (the cron will have rolled, or is about to roll, the slot to the next patient).
  if (entry.offeredExpiresAt && entry.offeredExpiresAt.getTime() <= Date.now()) {
    return { success: false, error: 'This slot offer has expired.' };
  }

  const dateStr = entry.offeredDate.toISOString().slice(0, 10);
  const doctor = await prisma.doctor.findUnique({
    where: { id: entry.offeredDoctorId },
    select: { name: true }
  });

  try {
    const appt = await createAppointment(
      clinicId,
      {
        patientId,
        doctorId: entry.offeredDoctorId,
        appointmentDate: dateStr,
        appointmentTime: entry.offeredTime
      },
      { notify: false } // the agent sends its own confirmation reply
    );
    await prisma.waitlist.update({
      where: { id: entry.id },
      data: { status: WaitlistStatus.CONVERTED, offeredDoctorId: null, offeredDate: null, offeredTime: null, offeredExpiresAt: null }
    });
    return {
      success: true,
      appointmentId: appt.id,
      doctor: doctor?.name ?? null,
      date: dateStr,
      time: entry.offeredTime,
      status: appt.status
    };
  } catch (err) {
    // Slot got booked by someone else first — return to the queue.
    await prisma.waitlist.update({
      where: { id: entry.id },
      data: { status: WaitlistStatus.WAITING, offeredDoctorId: null, offeredDate: null, offeredTime: null, offeredExpiresAt: null }
    });
    const taken = err instanceof Error && /already booked/i.test(err.message);
    return { success: false, error: taken ? 'That slot was just taken by someone else.' : (err instanceof Error ? err.message : 'Could not book the offered slot.') };
  }
};

export const cancelWaitlistEntry = async (clinicId: string, id: string) => {
  const entry = await ensureEntry(clinicId, id);
  requireStatus(
    entry.status,
    [WaitlistStatus.WAITING, WaitlistStatus.OFFERED, WaitlistStatus.RESPONDED],
    'cancel'
  );
  return prisma.waitlist.update({
    where: { id },
    data: { status: WaitlistStatus.CANCELLED },
    include: waitlistInclude
  });
};
