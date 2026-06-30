import { ConsultationNote, PrescriptionItem } from '../../api/novascribe';

interface PrintData {
  clinicName: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  rx: PrescriptionItem[];
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Open a clean, professional prescription in a new window and trigger the
 * browser's print dialog (→ Save as PDF / print). No backend PDF dependency.
 */
export const printPrescription = (note: ConsultationNote, data: PrintData): void => {
  const date = new Date(note.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const rxRows = data.rx
    .filter((r) => r.drug.trim())
    .map((r: PrescriptionItem, i: number) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td><strong>${esc(r.canonical || r.drug)}</strong>${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}</td>
        <td>${esc(r.dose)}</td>
        <td>${esc(r.frequency)}</td>
        <td>${esc(r.duration)}</td>
      </tr>`).join('');

  const soapBlock = (label: string, value: string) =>
    value.trim() ? `<div class="soap-item"><span class="soap-label">${label}</span><p>${esc(value)}</p></div>` : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Prescription — ${esc(note.patientName || 'Patient')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 3px solid #0d9488; padding-bottom: 16px; }
    .clinic { font-size: 24px; font-weight: 800; color: #0f766e; }
    .clinic small { display:block; font-size: 11px; letter-spacing: 2px; color:#64748b; font-weight:600; text-transform:uppercase; }
    .meta { text-align:right; font-size: 12px; color:#475569; }
    .patient { display:flex; gap:24px; margin: 20px 0; font-size: 14px; }
    .patient b { color:#0f172a; }
    .patient span { color:#64748b; }
    .rx-symbol { font-size: 28px; font-weight: 800; color:#0d9488; margin: 8px 0; }
    table { width:100%; border-collapse: collapse; margin-top: 6px; }
    th { text-align:left; font-size: 11px; text-transform:uppercase; letter-spacing:1px; color:#64748b; border-bottom: 1.5px solid #cbd5e1; padding: 8px 6px; }
    td { padding: 10px 6px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: top; }
    td.num { color:#94a3b8; width: 28px; }
    .notes { font-size: 12px; color:#64748b; margin-top:2px; }
    .soap { margin-top: 28px; }
    .soap-item { margin-bottom: 10px; font-size: 13px; }
    .soap-label { display:inline-block; min-width: 90px; font-weight:700; color:#0f766e; }
    .soap-item p { display:inline; margin:0; color:#334155; }
    .footer { margin-top: 60px; display:flex; justify-content:flex-end; }
    .sign { text-align:center; border-top: 1px solid #94a3b8; padding-top: 6px; width: 220px; font-size: 12px; color:#64748b; }
    .disclaimer { margin-top: 30px; font-size: 10px; color:#94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
    @media print { body { padding: 24px; } }
  </style></head><body>
    <div class="header">
      <div class="clinic">${esc(data.clinicName || 'Clinic')}<small>Powered by NovaScribe</small></div>
      <div class="meta"><div><b>Date:</b> ${date}</div></div>
    </div>

    <div class="patient">
      <div><span>Patient</span><br><b>${esc(note.patientName || '—')}</b></div>
      ${note.doctorName ? `<div><span>Doctor</span><br><b>${esc(note.doctorName)}</b></div>` : ''}
    </div>

    ${data.assessment.trim() ? `<div class="soap-item"><span class="soap-label">Diagnosis</span><p>${esc(data.assessment)}</p></div>` : ''}

    <div class="rx-symbol">℞</div>
    <table>
      <thead><tr><th></th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th></tr></thead>
      <tbody>${rxRows || '<tr><td colspan="5" style="color:#94a3b8">No medicines prescribed.</td></tr>'}</tbody>
    </table>

    <div class="soap">
      ${soapBlock('Advice', data.plan)}
    </div>

    <div class="footer"><div class="sign">${note.doctorName ? esc(note.doctorName) : 'Doctor'}<br>Signature</div></div>
    <div class="disclaimer">This prescription was drafted with AI assistance (NovaScribe) and reviewed &amp; approved by the attending doctor.</div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) {
    alert('Please allow pop-ups to print the prescription.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the new window a tick to render before invoking print.
  setTimeout(() => w.print(), 300);
};
