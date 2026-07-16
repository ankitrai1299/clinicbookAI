// Deliver a finalized prescription to the patient on WhatsApp.
//
// When a MediScribe consultation is finalized (status 'Completed') with medicines
// and the patient is a real ClinicBook patient (has a phone), we send the
// prescription to their WhatsApp — the full medicine list as a free-form message
// while the 24h session window is open, otherwise an approved "visit completed"
// nudge (there is no approved prescription template yet). Idempotent: sent at most
// once per consultation (guarded by a `prescriptionSentAt` flag on the note).
//
// Medicine REMINDERS are handled separately (medicineReminder.service) — together
// they give the patient both the prescription and the daily reminders on WhatsApp.

import { prisma } from '../../../config/prisma.js';
import { sendTemplatedOrSession } from '../../../core/whatsapp/whatsapp.service.js';
import { WhatsAppTemplate, appointmentCompletedComponents } from '../../../core/whatsapp/whatsapp.templates.js';
import { medicineLabel } from '../../../services/medicineReminder.frequency.js';
import { consultationsRepo } from '../repositories/index.js';

const bareDoctor = (name: string): string => name.replace(/^dr\.?\s*/i, '').trim();

function followUpLine(report: any): string {
  const fu = report?.followUp;
  if (!fu) return '';
  if (typeof fu === 'string') return fu.trim();
  if (fu.date) return `Next visit: ${String(fu.date).trim()}`;
  return '';
}

function buildMessage(opts: {
  patientName: string;
  doctorName: string;
  clinicName: string;
  meds: Array<Record<string, unknown>>;
  followUp: string;
}): string {
  const list = opts.meds.map((m, i) => `${i + 1}. ${medicineLabel(m)}`).filter((l) => l.trim().length > 3).join('\n');
  const doctor = opts.doctorName ? `Dr. ${bareDoctor(opts.doctorName)}` : 'your doctor';
  return (
    `Hello ${opts.patientName}! 🩺\n\n` +
    `Your prescription from ${doctor} at ${opts.clinicName}:\n\n` +
    `${list}\n\n` +
    (opts.followUp ? `${opts.followUp}\n\n` : '') +
    `Get well soon! Reply here if you have any questions. 💙`
  );
}

/**
 * Send the finalized prescription to the patient's WhatsApp (once). No-op unless
 * the note is Completed, has medicines, and the patient has a phone.
 */
export const sendPrescriptionOnFinalize = async (clinicId: string, consultation: any): Promise<boolean> => {
  const consultationId = String(consultation?.id ?? '');
  const patientId = String(consultation?.patientId ?? '');
  if (!consultationId || !patientId) return false;
  if (consultation?.status !== 'Completed') return false;

  const meds: Array<Record<string, unknown>> =
    (Array.isArray(consultation?.report?.prescribedMedications) && consultation.report.prescribedMedications) ||
    (Array.isArray(consultation?.prescriptions) && consultation.prescriptions) ||
    [];
  if (!meds.length) return false;

  // Idempotent: skip if this consultation's prescription was already sent.
  const stored = (await consultationsRepo.findById(consultationId)) as { prescriptionSentAt?: string } | null;
  if (stored?.prescriptionSentAt) return false;

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { name: true, phone: true } });
  if (!patient?.phone) return false;

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  const clinicName = clinic?.name ?? 'your clinic';
  const patientName = patient.name ?? 'there';
  const doctorName = String(consultation?.doctorName ?? '');

  const body = buildMessage({
    patientName,
    doctorName,
    clinicName,
    meds,
    followUp: followUpLine(consultation?.report),
  });

  const { channel } = await sendTemplatedOrSession({
    to: patient.phone,
    templateName: WhatsAppTemplate.APPOINTMENT_COMPLETED,
    components: appointmentCompletedComponents({
      clinicName,
      patientName,
      doctorName: bareDoctor(doctorName) || 'your doctor',
    }),
    sessionBody: body,
    clinicId,
  });

  // Mark as sent so a re-save never double-sends (shallow-merged into the note).
  await consultationsRepo.upsert({ id: consultationId, prescriptionSentAt: new Date().toISOString() } as any);
  console.info(`[Prescription] Sent via ${channel} → ${patientName} (${meds.length} medicine(s))`);
  return true;
};
