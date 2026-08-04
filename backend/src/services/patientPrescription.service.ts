// "Meri dawai batao" — a patient asking, on WhatsApp, for the medicines from
// their last visit.
//
// Cross-product on purpose: the prescription lives in MediScribe, the request
// arrives on ClinicBook's WhatsApp line, and TWO callers need the exact same
// answer — the deterministic booking FSM (everyone) and the MCP brain skill
// (numbers opted into the brain). Keeping the reply here means a patient gets
// the identical prescription whichever path handled their message.
//
// The patient asked us, so the 24h customer-service window is open by
// definition: a free-form reply plus the PDF is allowed, no template needed.

import { sendWhatsAppDocument } from '../core/whatsapp/whatsapp.service.js';
import {
  buildPrescriptionPdf,
  prescriptionFileName
} from '../products/mediscribe/services/prescriptionPdf.js';
import {
  latestScribeConsultation,
  type MedRow
} from '../products/novascribe/skills/mediscribeData.js';

/** "1. Paracetamol 500mg — 1 tab, BD, 5 days (after food)" */
export const formatMedicines = (items: MedRow[]): string =>
  items
    .map((it, i) => {
      const parts = [it.dose || it.dosage, it.strength, it.frequency, it.duration]
        .filter(Boolean)
        .join(', ');
      const notes = it.instructions ? ` (${it.instructions})` : '';
      return `${i + 1}. ${it.medicine ?? 'Medicine'}${parts ? ` — ${parts}` : ''}${notes}`;
    })
    .join('\n');

export const NO_PRESCRIPTION_REPLY =
  'Aapke naam pe abhi koi prescription record nahi hai. 🙏 ' +
  'Doctor ke visit ke baad wo yahan available ho jayegi.';

// PURE: the text half of the answer. Separated from the DB read and the PDF
// upload so the wording is unit-testable without either.
export const buildPrescriptionReply = (params: {
  doctorName?: string;
  medicines: MedRow[];
  advice: string[];
}): string => {
  const doctor = params.doctorName
    ? `Dr. ${params.doctorName.replace(/^dr\.?\s*/i, '')}`
    : 'your doctor';
  const lines: string[] = [`📋 *Your prescription* — ${doctor}`];
  if (params.medicines.length) lines.push('', '*Medicines:*', formatMedicines(params.medicines));
  if (params.advice.length) lines.push('', `*Advice:* ${params.advice.join('; ')}`);
  if (!params.medicines.length && !params.advice.length) {
    lines.push('', 'Is visit ke liye koi dawai record nahi hui.');
  }
  lines.push(
    '',
    'ℹ️ Kisi bhi dawai ko lekar sawaal ho to clinic se poochein. Ye medical advice ka replacement nahi hai.'
  );
  return lines.join('\n');
};

/**
 * Look up the patient's latest finalized consultation, WhatsApp them the
 * prescription PDF, and return the text reply the caller should send.
 *
 * The PDF is best-effort: if rendering or upload fails the patient still gets
 * the full medicine list as text, which is the part that actually matters.
 */
export const deliverPrescriptionToPatient = async (params: {
  clinicId: string;
  phone: string;
}): Promise<string> => {
  const consult = await latestScribeConsultation(params.clinicId, params.phone);
  if (!consult) return NO_PRESCRIPTION_REPLY;

  const medicines = Array.isArray(consult.report.prescribedMedications)
    ? consult.report.prescribedMedications
    : [];
  const advice = Array.isArray(consult.report.advice) ? consult.report.advice.filter(Boolean) : [];
  const doctorName = consult.doctorName;

  try {
    const pdf = await buildPrescriptionPdf(consult);
    if (pdf) {
      await sendWhatsAppDocument({
        to: params.phone,
        data: pdf,
        filename: prescriptionFileName(consult.patientName, consult.date),
        caption: `Prescription — ${doctorName ? `Dr. ${doctorName.replace(/^dr\.?\s*/i, '')}` : 'your doctor'}`,
        messageType: 'prescription_pdf',
        clinicId: params.clinicId
      });
    }
  } catch (err) {
    console.error('[prescription] PDF delivery failed (text reply still sent):', err);
  }

  return buildPrescriptionReply({ doctorName, medicines, advice });
};
