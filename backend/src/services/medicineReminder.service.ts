// Medicine reminders: created from a MediScribe prescription, delivered on
// WhatsApp at each drug's daily times. Mirrors the appointment reminder service
// (services/reminder.service.ts) — same sendTemplatedOrSession channel (approved
// medicine_reminder template outside the 24h window, free-form session inside),
// and a nextRunAt-guarded claim so overlapping cron runs never double-send.

import { prisma } from '../config/prisma.js';
import { sendTemplatedOrSession } from '../core/whatsapp/whatsapp.service.js';
import { WhatsAppTemplate, medicineReminderComponents } from '../core/whatsapp/whatsapp.templates.js';
import { clinicNow } from './slotMath.js';
import { parseFrequencyTimes, parseDurationDays, medicineLabel } from './medicineReminder.frequency.js';

const CLINIC_UTC_OFFSET_MIN = 330; // Asia/Kolkata (UTC+5:30, no DST)
// When a prescription gives no explicit duration, cap the course so reminders
// don't run forever.
const DEFAULT_COURSE_DAYS = 30;

// A clinic-local "YYYY-MM-DD" + "HH:MM" → the true UTC instant it fires.
const clinicLocalToUtc = (dateStr: string, hhmm: string): Date => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hh, mm - CLINIC_UTC_OFFSET_MIN, 0, 0));
};

const addDaysStr = (dateStr: string, days: number): string => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
};

const dateStrOf = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The next UTC instant a reminder should fire: the earliest daily time (clinic-
 * local) at or after `from`, within [startDate, endDate]. null when the course
 * has ended (→ the reminder is deactivated).
 */
export const computeNextRunAt = (
  times: string[],
  startDate: Date,
  endDate: Date | null,
  from: Date
): Date | null => {
  if (!times.length) return null;
  const sorted = [...times].sort();
  const startStr = dateStrOf(startDate);
  const endStr = endDate ? dateStrOf(endDate) : null;
  // Begin scanning from the later of the course start and `from`'s clinic-local day.
  const fromDay = clinicNow(from).dateStr;
  let day = startStr > fromDay ? startStr : fromDay;

  for (let i = 0; i <= 370; i++) {
    if (endStr && day > endStr) return null;
    for (const t of sorted) {
      const instant = clinicLocalToUtc(day, t);
      if (instant.getTime() >= from.getTime()) return instant;
    }
    day = addDaysStr(day, 1);
  }
  return null;
};

interface Medication {
  medicine?: string; strength?: string; dose?: string;
  frequency?: string; timing?: string; duration?: string;
}

/**
 * (Re)create the medicine reminders for a consultation's prescription. Existing
 * reminders for the same consultation are replaced, so re-saving a note updates
 * them. Medicines with no schedulable frequency (SOS/unknown) are skipped.
 * Returns how many reminders are now active.
 */
export const createRemindersForConsultation = async (params: {
  clinicId: string;
  patientId: string;
  phone: string;
  consultationId: string;
  medications: Medication[];
}): Promise<number> => {
  const { clinicId, patientId, phone, consultationId, medications } = params;
  if (!phone || !patientId) return 0;

  // Replace any previous reminders from this consultation (idempotent re-save).
  await prisma.medicineReminder.deleteMany({ where: { consultationId } });

  const todayStr = clinicNow().dateStr;
  const startDate = new Date(`${todayStr}T00:00:00.000Z`);
  const now = new Date();
  let created = 0;

  for (const med of medications || []) {
    const times = parseFrequencyTimes(med.frequency || '');
    if (!times.length) continue; // SOS / unknown → no scheduled reminder

    const days = parseDurationDays(med.duration || '') ?? DEFAULT_COURSE_DAYS;
    const endStr = addDaysStr(todayStr, Math.max(0, days - 1));
    const endDate = new Date(`${endStr}T00:00:00.000Z`);
    const nextRunAt = computeNextRunAt(times, startDate, endDate, now);
    if (!nextRunAt) continue; // course already over

    await prisma.medicineReminder.create({
      data: {
        clinicId,
        patientId,
        phone,
        consultationId,
        drug: medicineLabel(med),
        times,
        startDate,
        endDate,
        nextRunAt,
        active: true
      }
    });
    created += 1;
  }
  return created;
};

/**
 * Called when a MediScribe consultation is saved. Schedules reminders from its
 * prescription when the note is FINALIZED (status 'Completed') and the patient is
 * a real ClinicBook patient (has a phone). Clears them otherwise. Idempotent.
 */
export const syncFromScribeConsultation = async (
  clinicId: string,
  consultation: any
): Promise<number> => {
  const consultationId = String(consultation?.id ?? '');
  const patientId = String(consultation?.patientId ?? '');
  if (!consultationId) return 0;

  const meds: Medication[] =
    (Array.isArray(consultation?.report?.prescribedMedications) && consultation.report.prescribedMedications) ||
    (Array.isArray(consultation?.prescriptions) && consultation.prescriptions) ||
    [];

  // Only a finalized note with medicines schedules reminders; anything else
  // clears any reminders this consultation previously created.
  if (consultation?.status !== 'Completed' || meds.length === 0 || !patientId) {
    await prisma.medicineReminder.deleteMany({ where: { consultationId } });
    return 0;
  }

  // Need a real phone → look up the (ClinicBook) patient. A scribe-local patient
  // with no ClinicBook link simply gets no reminders.
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { phone: true } });
  if (!patient?.phone) {
    await prisma.medicineReminder.deleteMany({ where: { consultationId } });
    return 0;
  }

  return createRemindersForConsultation({
    clinicId,
    patientId,
    phone: patient.phone,
    consultationId,
    medications: meds
  });
};

const CLAIM_WINDOW_MS = 10 * 60 * 1000; // reminders due within the last cron interval

/**
 * Cron worker: send every reminder whose nextRunAt has arrived, then advance it
 * to the next slot (or deactivate when the course ends). A conditional update on
 * (id, nextRunAt) claims the row so two overlapping runs can't both send it.
 */
export const processMedicineReminders = async (): Promise<void> => {
  const now = new Date();
  const due = await prisma.medicineReminder.findMany({
    where: { active: true, nextRunAt: { lte: now, gte: new Date(now.getTime() - CLAIM_WINDOW_MS) } },
    take: 300
  });

  const clinicNames = new Map<string, string>();
  for (const r of due) {
    try {
      // Advance FIRST (claim). The next fire must be strictly after this one.
      const next = computeNextRunAt(r.times, r.startDate, r.endDate, new Date(r.nextRunAt.getTime() + 60_000));
      const claim = await prisma.medicineReminder.updateMany({
        where: { id: r.id, nextRunAt: r.nextRunAt },
        data: { nextRunAt: next ?? r.nextRunAt, active: next !== null, lastSentAt: now }
      });
      if (claim.count === 0) continue; // another run already claimed this slot

      if (!clinicNames.has(r.clinicId)) {
        const clinic = await prisma.clinic.findUnique({ where: { id: r.clinicId }, select: { name: true } });
        clinicNames.set(r.clinicId, clinic?.name ?? 'your clinic');
      }
      const clinicName = clinicNames.get(r.clinicId)!;
      const patient = await prisma.patient.findUnique({ where: { id: r.patientId }, select: { name: true } });
      const patientName = patient?.name ?? 'there';

      const sessionBody =
        `Hello ${patientName}! 💊\n\nMedicine reminder from ${clinicName}:\n${r.drug}\n\nPlease take it now. Stay healthy!`;

      const { channel } = await sendTemplatedOrSession({
        to: r.phone,
        templateName: WhatsAppTemplate.MEDICINE_REMINDER,
        components: medicineReminderComponents({ patientName, medicine: r.drug, clinicName }),
        sessionBody,
        clinicId: r.clinicId
      });
      console.info(`[MedicineReminder] Sent via ${channel} → ${patientName} (${r.drug})`);
    } catch (error) {
      console.error(`[MedicineReminder] Failed reminder ${r.id}:`, error);
    }
  }
};
