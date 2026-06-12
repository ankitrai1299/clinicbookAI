import { WaitlistStatus } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { notifyWaitlistOffer } from '../whatsapp/whatsapp.notifications.js';
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
