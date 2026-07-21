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
import {
  sendTemplatedOrSession,
  sendWhatsAppDocument,
  isConversationWindowOpen,
} from '../../../core/whatsapp/whatsapp.service.js';
import { buildPrescriptionPdf, prescriptionFileName } from './prescriptionPdf.js';
import { WhatsAppTemplate, prescriptionReadyComponents } from '../../../core/whatsapp/whatsapp.templates.js';
import { medicineLabel } from '../../../services/medicineReminder.frequency.js';
import { emitEvent } from '../../../core/timeline/patientTimeline.service.js';
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

  // Out-of-window fallback uses the approved template, so the FULL prescription
  // still reaches the patient. Template variables can't contain newlines, so the
  // medicine list is collapsed to a single semicolon-separated line for {{4}}.
  const medsOneLine = meds
    .map((m) => medicineLabel(m))
    .filter((l) => l.trim().length > 3)
    .join('; ');

  // Attach the ACTUAL prescription PDF when the 24h window is open — the patient
  // gets the same document the clinic prints, not just a text summary. A document
  // is a free-form message, so outside the window we can only send the approved
  // template below (the patient's next reply opens a window and the MCP
  // prescription skill can then deliver the file on request).
  let pdfSent = false;
  if (await isConversationWindowOpen(clinicId, patient.phone)) {
    const pdf = await buildPrescriptionPdf(consultation, clinicName);
    if (pdf) {
      pdfSent = await sendWhatsAppDocument({
        to: patient.phone,
        data: pdf,
        filename: prescriptionFileName(patientName, consultation?.date),
        caption: `Prescription — ${doctorName ? `Dr. ${bareDoctor(doctorName)}` : clinicName}`,
        messageType: 'prescription_pdf',
        clinicId,
      });
    }
  }

  const { channel } = await sendTemplatedOrSession({
    to: patient.phone,
    templateName: WhatsAppTemplate.PRESCRIPTION_READY,
    components: prescriptionReadyComponents({
      patientName,
      doctorName: bareDoctor(doctorName) || 'your doctor',
      clinicName,
      medicines: medsOneLine || 'See clinic for details',
    }),
    sessionBody: body,
    clinicId,
  });

  // Mark as sent so a re-save never double-sends (shallow-merged into the note).
  await consultationsRepo.upsert({ id: consultationId, prescriptionSentAt: new Date().toISOString() } as any);
  emitEvent({
    clinicId,
    patientId,
    type: 'prescribed',
    title: `Prescription sent — ${meds.length} medicine${meds.length === 1 ? '' : 's'}`,
    detail: medsOneLine,
    actorType: 'doctor',
    actorName: bareDoctor(doctorName) || undefined,
    refType: 'consultation',
    refId: consultationId
  });
  console.info(
    `[Prescription] Sent via ${channel}${pdfSent ? ' + PDF' : ''} → ${patientName} (${meds.length} medicine(s))`,
  );
  return true;
};
