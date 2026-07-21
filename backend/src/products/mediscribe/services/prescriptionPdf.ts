// Server-side prescription/report PDF for WhatsApp delivery.
//
// The doctor's browser already builds this PDF for print/download; this is the
// same document produced entirely on the server so it can be ATTACHED to a
// WhatsApp message (on finalize, or when the patient asks for it later) without
// the doctor's device being involved.
//
// Reuses the shared report template + the headless-Chrome renderer, so the file
// the patient receives is the same document the clinic prints.

import { buildReportHtml, normalizeReport } from '../shared/report.js';
import { renderHtmlToPdf } from '../pdf.render.js';

/** A safe, readable file name like "prescription_asha-verma_2026-07-20.pdf". */
export function prescriptionFileName(patientName?: string, date?: string): string {
  const name = (patientName || 'patient')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const day = (date || new Date().toISOString().slice(0, 10)).replace(/[^0-9a-zA-Z]+/g, '-');
  return ['prescription', name, day].filter(Boolean).join('_') + '.pdf';
}

/**
 * Render a finalized consultation's report into a PDF buffer, or null when there
 * is nothing worth sending / rendering fails. Never throws: a PDF failure must
 * never break the save or the text message that accompanies it.
 */
export async function buildPrescriptionPdf(
  consultation: any,
  clinicName?: string,
): Promise<Buffer | null> {
  try {
    const raw = consultation?.report;
    if (!raw) return null;
    const report = normalizeReport(raw);

    // Nothing to send if there are no medicines and no advice.
    const hasMeds = (report.prescribedMedications || []).some((m) => (m.medicine || '').trim());
    const hasAdvice = (report.advice || []).some((a) => (a || '').trim());
    if (!hasMeds && !hasAdvice) return null;

    const html = buildReportHtml(report, {
      patientName: consultation?.patientName || undefined,
      date: consultation?.date || undefined,
      doctorName: consultation?.doctorName || undefined,
      clinicName: clinicName || undefined,
    });
    return await renderHtmlToPdf(html);
  } catch (error) {
    console.error('[prescriptionPdf] render failed:', error);
    return null;
  }
}
