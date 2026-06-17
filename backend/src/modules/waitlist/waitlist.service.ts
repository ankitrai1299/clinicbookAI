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

  const doctor = await prisma.doctor.findFirst({
    where: { id: input.doctorId, clinicId },
    select: { id: true }
  });
  if (!doctor) throw new AppError('Doctor not found', 404);

  const date = new Date(input.appointmentDate);
  if (Number.isNaN(date.getTime())) throw new AppError('Invalid appointment date', 400);

  const [updatedEntry, appointment] = await prisma.$transaction([
    prisma.waitlist.update({
      where: { id },
      data: { status: WaitlistStatus.CONVERTED },
      include: waitlistInclude
    }),
    prisma.appointment.create({
      data: {
        clinicId,
        patientId: waitlistEntry.patientId,
        doctorId: input.doctorId,
        appointmentDate: date,
        appointmentTime: input.appointmentTime.trim()
      }
    })
  ]);

  return { waitlistEntry: updatedEntry, appointment };
};

// --- Automatic waitlist workflow ------------------------------------------

// Called when a cancellation frees a slot. Offers that EXACT slot to the
// highest-priority WAITING patient: parks the slot on their entry, flips to
// OFFERED, and WhatsApps them a "reply YES to claim" message. No-op if the
// queue is empty. Returns the offered entry (or null).
export const autoOfferFreedSlot = async (
  clinicId: string,
  doctorId: string,
  appointmentDate: Date,
  appointmentTime: string
) => {
  const next = await prisma.waitlist.findFirst({
    where: { clinicId, status: WaitlistStatus.WAITING },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    include: waitlistInclude
  });
  if (!next) return null;

  const updated = await prisma.waitlist.update({
    where: { id: next.id },
    data: {
      status: WaitlistStatus.OFFERED,
      offeredDoctorId: doctorId,
      offeredDate: appointmentDate,
      offeredTime: appointmentTime
    },
    include: waitlistInclude
  });

  const [doctor, clinic] = await Promise.all([
    prisma.doctor.findUnique({ where: { id: doctorId }, select: { name: true } }),
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } })
  ]);

  if (updated.patient?.phone) {
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

  console.info(`[Waitlist] Auto-offered freed slot ${appointmentDate.toISOString().slice(0, 10)} ${appointmentTime} to ${updated.patient?.name} (entry ${updated.id})`);
  return updated;
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
      data: { status: WaitlistStatus.CONVERTED, offeredDoctorId: null, offeredDate: null, offeredTime: null }
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
      data: { status: WaitlistStatus.WAITING, offeredDoctorId: null, offeredDate: null, offeredTime: null }
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
