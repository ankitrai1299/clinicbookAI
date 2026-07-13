// Automatic post-visit completion + prescription hand-off.
//
// The idea (from the clinic operator): a booked slot has a start time and a
// duration. Once that slot has ended, we can tell whether the patient actually
// came WITHOUT staff clicking "Mark Completed" — because if the doctor saw them,
// they used MediScribe (a finalized consultation exists for that patient). So:
//   • scribe WAS used for the patient  → auto-mark the visit COMPLETED (which
//     fires the existing thank-you message) AND send them their prescription.
//   • scribe was NOT used              → leave it for staff to complete manually.
//
// Cross-product composition (ClinicBook appointments + MediScribe notes + WhatsApp)
// lives here in the shared services layer, never inside a product module.

import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { updateAppointment, type AppointmentRecord } from '../products/clinicbook/appointments/appointment.service.js';
import { registerPostVisitAction } from '../products/clinicbook/appointments/postVisit.service.js';
import { finalizedScribeForPatient, type ScribeReport } from '../products/novascribe/skills/mediscribeData.js';
import { sendTemplatedOrSession } from '../core/whatsapp/whatsapp.service.js';
import { WhatsAppTemplate, medicineReminderComponents } from '../core/whatsapp/whatsapp.templates.js';
import { clinicLocalInstant } from './scheduling.service.js';
import { parseFrequencyTimes, medicineLabel } from './medicineReminder.frequency.js';

const DEFAULT_SLOT_MIN = 30; // when a doctor's schedule doesn't specify one

const to12h = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
};

// A patient-friendly, "when to take" prescription (the full detail — sent in-window).
const formatPrescriptionBody = (patientName: string, clinicName: string, report: ScribeReport): string => {
  const meds = report.prescribedMedications || [];
  const lines: string[] = [`💊 *Your prescription* — ${clinicName}`, `Hello ${patientName}, please take:`, ''];
  meds.forEach((m, i) => {
    const label = medicineLabel(m);
    const times = parseFrequencyTimes(m.frequency || m.instructions || '');
    const when = times.length ? ` — ${times.map(to12h).join(', ')}` : m.frequency ? ` — ${m.frequency}` : '';
    const dur = m.duration ? ` (${m.duration})` : '';
    lines.push(`${i + 1}. ${label}${when}${dur}`);
  });
  if (report.advice?.length) lines.push('', `📝 Advice: ${report.advice.join('; ')}`);
  lines.push('', 'ℹ️ Reminders will be sent at each dose time. Any doubt? Ask the clinic. Not a substitute for medical advice.');
  return lines.join('\n');
};

// A compact one-liner for the approved template's {{2}} slot (out-of-window path).
const prescriptionSummary = (report: ScribeReport): string => {
  const names = (report.prescribedMedications || []).map((m) => m.medicine).filter(Boolean);
  const head = names.slice(0, 4).join(', ');
  return (names.length > 4 ? `${head} +${names.length - 4} more` : head) || 'your prescribed medicines';
};

/**
 * Post-visit action: send the patient their prescription. Fires on EVERY
 * completion (manual or auto) but only when a finalized scribe prescription with
 * medicines exists — so a completed visit with no scribe note sends nothing extra.
 */
export const sendScribePrescription = async (appt: AppointmentRecord): Promise<void> => {
  const phone = appt.patient?.phone;
  if (!phone) return;
  const scribe = await finalizedScribeForPatient(appt.clinicId, appt.patientId);
  if (!scribe?.report?.prescribedMedications?.length) return;

  const patientName = appt.patient?.name ?? 'there';
  const clinicName = appt.clinic?.name ?? 'your clinic';
  await sendTemplatedOrSession({
    to: phone,
    templateName: WhatsAppTemplate.MEDICINE_REMINDER,
    components: medicineReminderComponents({ patientName, medicine: prescriptionSummary(scribe.report), clinicName }),
    sessionBody: formatPrescriptionBody(patientName, clinicName, scribe.report),
    clinicId: appt.clinicId
  }).catch((e) => console.error('[autoComplete] prescription send failed:', e));
};

/** Register the prescription hand-off so it runs after ANY visit completion. */
export const registerAutoCompleteActions = (): void => {
  registerPostVisitAction((appt) => {
    void sendScribePrescription(appt);
  });
};

const dayEndInstant = async (appt: { doctorId: string; clinicId: string; appointmentDate: Date; appointmentTime: string }): Promise<Date> => {
  const start = clinicLocalInstant(appt.appointmentDate, appt.appointmentTime);
  const sched = await prisma.doctorSchedule.findFirst({
    where: { clinicId: appt.clinicId, doctorId: appt.doctorId, dayOfWeek: appt.appointmentDate.getUTCDay(), isActive: true },
    select: { slotMinutes: true }
  });
  const mins = sched?.slotMinutes ?? DEFAULT_SLOT_MIN;
  return new Date(start.getTime() + mins * 60_000);
};

/**
 * Cron worker: auto-complete recent CONFIRMED visits whose slot has ended AND for
 * which the doctor used the scribe. Marking COMPLETED runs the post-visit workflow
 * (thank-you + the prescription action above). Visits with no scribe note are left
 * untouched for staff to complete manually.
 */
export const processAutoCompleteVisits = async (): Promise<void> => {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  from.setUTCHours(0, 0, 0, 0);

  // Cross-tenant scan (like the reminder cron); each write is re-scoped by clinicId.
  const appts = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.CONFIRMED, appointmentDate: { gte: from } },
    select: { id: true, clinicId: true, doctorId: true, patientId: true, appointmentDate: true, appointmentTime: true }
  });

  for (const a of appts) {
    try {
      const end = await dayEndInstant(a);
      if (end.getTime() > now.getTime()) continue; // slot hasn't ended yet

      const scribe = await finalizedScribeForPatient(a.clinicId, a.patientId);
      if (!scribe) continue; // scribe not used → leave manual

      await updateAppointment(a.clinicId, a.id, { status: AppointmentStatus.COMPLETED });
      console.info(`[AutoComplete] Visit ${a.id} auto-completed (scribe used); post-visit workflow fired.`);
    } catch (err) {
      console.error(`[AutoComplete] Failed appointment ${a.id}:`, err);
    }
  }
};
