// Mobile export utilities: Transcript (.txt / .pdf) and Report (.pdf / .docx).
// Files are written to the app cache then handed to the OS share sheet
// (expo-sharing). The PDF reuses the web app's buildReportHtml() so the layout
// is identical; the DOCX uses the same `docx` builder as the web app.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from 'docx';
import {
  ReportData,
  MedicationRow,
  ComplaintRow,
  AllergyRow,
  SystemGroup,
  Vitals,
  FollowUp,
} from '../types';
import {
  REPORT_SECTIONS,
  ColumnDef,
  ReportMeta,
  sectionHasContent,
  sectionHeading,
  buildReportHtml,
  condenseReport,
  COMPLAINT_COLUMNS,
  ALLERGY_COLUMNS,
  TREATMENT_COLUMNS,
  VITALS_FIELDS,
  FOLLOWUP_FIELDS,
  medicationsToText,
  L,
} from './report';
import { deriveSOAP } from './reportInsights';

export interface ExportMeta {
  patientName?: string;
  date?: string;
  doctorName?: string;
}

const cellText = (row: Record<string, any>, col: ColumnDef): string => {
  const v = row[col.key];
  if (typeof v === 'string' && v) return v;
  // Legacy medication rows stored `dosage` instead of `dose`.
  if (col.key === 'dose' && typeof row.dosage === 'string') return row.dosage;
  return '';
};

// Make a safe, readable file name like "report_jane-doe_2026-06-17".
function fileName(kind: string, meta: ExportMeta, ext: string): string {
  const name = (meta.patientName || 'patient')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const date = (meta.date || '').replace(/[^0-9a-zA-Z]+/g, '-').replace(/(^-|-$)/g, '');
  return [kind, name, date].filter(Boolean).join('_') + '.' + ext;
}

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Write a string (utf8/base64) to the cache dir and open the OS share sheet.
async function shareFile(
  filename: string,
  data: string,
  encoding: 'utf8' | 'base64',
  mimeType: string,
  uti: string,
): Promise<void> {
  const uri = (FileSystem.cacheDirectory || '') + filename;
  await FileSystem.writeAsStringAsync(uri, data, {
    encoding:
      encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: filename, UTI: uti });
  }
}

// ── Transcript: TXT ──────────────────────────────────────────
export async function exportTranscriptTxt(text: string, meta: ExportMeta): Promise<void> {
  const header = [
    `NovaScribe - ${L('Consultation Transcript')}`,
    meta.patientName ? `${L('Patient')}: ${meta.patientName}` : '',
    meta.date ? `Date: ${meta.date}` : '',
    '',
    '',
  ].filter((l, i) => l !== '' || i >= 3);
  const body = header.join('\n') + (text || '');
  await shareFile(fileName('transcript', meta, 'txt'), body, 'utf8', 'text/plain', 'public.plain-text');
}

// ── Transcript: PDF (rendered HTML → expo-print → share) ─────
export async function exportTranscriptPdf(text: string, meta: ExportMeta): Promise<void> {
  const sub = [meta.patientName, meta.date].filter((x): x is string => !!x).map(escapeHtml).join('  •  ');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.6; }
  h1 { font-size: 18px; color: #0f172a; margin: 0 0 4px; }
  .sub { color: #475569; font-size: 11.5px; margin-bottom: 14px; }
  .text { white-space: pre-wrap; }
</style></head><body>
  <h1>${escapeHtml(L('Consultation Transcript'))}</h1>
  ${sub ? `<div class="sub">${sub}</div>` : ''}
  <div class="text">${escapeHtml((text || '').trim() || 'Not mentioned')}</div>
</body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: fileName('transcript', meta, 'pdf'),
      UTI: 'com.adobe.pdf',
    });
  }
}

// ── Report: PDF — reuses the EXACT clinical HTML template (buildReportHtml) ──
// Accepts the full ReportMeta (letterhead, consultation id, SOAP, previous
// summary, signature image); the extra fields are optional so existing callers
// keep working with just patientName/date/doctorName.
export async function exportReportPdf(report: ReportData, meta: ReportMeta): Promise<void> {
  const html = buildReportHtml(report, meta);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: fileName('report', meta, 'pdf'),
      UTI: 'com.adobe.pdf',
    });
  }
}

// Print the report directly (native print dialog) — same document as the PDF export.
// On print the OS renders only the document (no app chrome/navigation).
//
// Deliberately renders to a PDF first and prints THAT file rather than handing
// printAsync the raw HTML. Passing `html` makes Android print through a WebView
// print adapter, which is the path that silently produced nothing here; the
// failure is invisible because on Android printAsync "will be resolved
// immediately after displaying the native print window and won't be rejected if
// the window is closed", so a broken print never reaches the caller's catch.
// printToFileAsync is the same renderer exportReportPdf already uses
// successfully, so this makes the printed page identical to the exported PDF by
// construction instead of relying on a second, differently-behaving engine.
export async function printReport(report: ReportData, meta: ReportMeta): Promise<void> {
  const html = buildReportHtml(report, meta);
  const { uri } = await Print.printToFileAsync({ html });
  await Print.printAsync({ uri });
}

// ── Report: JSON export (structured data, shareable/interoperable) ──
export async function exportReportJson(report: ReportData, meta: ExportMeta): Promise<void> {
  const payload = {
    generatedBy: 'NovaScribe',
    exportedAt: new Date().toISOString(),
    patient: meta.patientName || null,
    date: meta.date || null,
    doctor: meta.doctorName || null,
    report,
  };
  await shareFile(
    fileName('report', meta, 'json'),
    JSON.stringify(payload, null, 2),
    'utf8',
    'application/json',
    'public.json',
  );
}

// ── Report: plain-text builder + copy to clipboard ──
export function reportToPlainText(rawReport: ReportData, meta: ExportMeta): string {
  // Condensed like every other output, so copying a report to the clipboard
  // yields the same document the doctor sees and prints.
  const report = condenseReport(rawReport);
  const soap = deriveSOAP(report);
  const lines: string[] = [];
  lines.push(`NOVASCRIBE ${L('Clinical Report').toUpperCase()}`);
  if (meta.patientName) lines.push(`${L('Patient')}: ${meta.patientName}`);
  if (meta.date) lines.push(`${L('Date')}: ${meta.date}`);
  if (meta.doctorName) lines.push(`${L('Doctor')}: ${meta.doctorName}`);
  lines.push('');
  const soapParts: [string, string][] = [
    ['SUBJECTIVE', soap.subjective], ['OBJECTIVE', soap.objective],
    ['ASSESSMENT', soap.assessment], ['PLAN', soap.plan],
  ];
  for (const [label, text] of soapParts) {
    if (text.trim()) { lines.push(label, text, ''); }
  }
  // Headings, not numbers — the same sequence the printed document carries.
  for (const s of REPORT_SECTIONS.filter((sec) => sectionHasContent(report, sec))) {
    lines.push(sectionHeading(s).toUpperCase());
    const v = report[s.key];
    if (s.kind === 'overview') lines.push(String(v).trim());
    else if (s.kind === 'medications') lines.push(medicationsToText(v as MedicationRow[]));
    else if (s.kind === 'bullets') lines.push((v as string[]).filter(Boolean).map((i) => `• ${i}`).join('\n'));
    else if (s.kind === 'vitals') lines.push(vitalsPairs(v as Vitals).map(([k, val]) => `${k}: ${val}`).join('\n'));
    else if (s.kind === 'followup') lines.push(followUpPairs(v as FollowUp).map(([k, val]) => `${k}: ${val}`).join('\n'));
    else if (s.kind === 'complaints') lines.push((v as ComplaintRow[]).map((c) => `• ${[c.complaint, c.duration, c.severity].filter(Boolean).join(' - ')}`).join('\n'));
    else if (s.kind === 'allergies') lines.push((v as AllergyRow[]).map((a) => `• ${[a.allergy, a.reaction, a.severity].filter(Boolean).join(' - ')}`).join('\n'));
    else if (s.kind === 'groups') lines.push((v as SystemGroup[]).flatMap((g) => g.findings.filter(Boolean).map((f) => `• ${g.name ? g.name + ': ' : ''}${f}`)).join('\n'));
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function copyReportToClipboard(report: ReportData, meta: ExportMeta): Promise<void> {
  await Clipboard.setStringAsync(reportToPlainText(report, meta));
}

// Non-empty key/value pairs for the vitals + follow-up sections.
const vitalsPairs = (v: Vitals): [string, string][] =>
  VITALS_FIELDS.filter((f) => (v[f.key] || '').trim()).map((f) => [L(f.label), v[f.key]]);

const followUpPairs = (f: FollowUp): [string, string][] =>
  FOLLOWUP_FIELDS.filter((x) => (f[x.key] || '').trim()).map((x) => [L(x.label), f[x.key]]);

// ── Report: DOCX (Premium Clinical Report — same builder as web) ──
export async function exportReportDocx(rawReport: ReportData, meta: ExportMeta): Promise<void> {
  // Condensed like the PDF/print/preview paths. Not strictly required, but a
  // Word export that contradicts the PDF of the same consultation is worse than
  // either one alone.
  const report = condenseReport(rawReport);
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'NOVASCRIBE', bold: true, color: '1D4ED8', size: 20 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: L('Clinical Report').toUpperCase(), bold: true, size: 34 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text:
            [meta.patientName, meta.date].filter(Boolean).join('  •  ') ||
            'NovaScribe',
          color: '64748B',
          size: 20,
        }),
      ],
    }),
  );

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 220, after: 80 },
      children: [new TextRun({ text, bold: true, color: '1D4ED8', size: 24 })],
    });

  const buildTable = (cols: ColumnDef[], rows: Record<string, any>[]) => {
    const headerRow = new TableRow({
      tableHeader: true,
      children: cols.map(
        (c) =>
          new TableCell({
            shading: { fill: 'EFF6FF' },
            children: [
              new Paragraph({ children: [new TextRun({ text: L(c.label), bold: true, size: 16 })] }),
            ],
          }),
      ),
    });
    const bodyRows = rows.map(
      (r) =>
        new TableRow({
          children: cols.map(
            (c) =>
              new TableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: cellText(r, c), size: 16 })] }),
                ],
              }),
          ),
        }),
    );
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] });
  };

  const kvTable = (pairs: [string, string][]) => {
    const rows = pairs.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: 'F8FAFC' },
              width: { size: 35, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 16 })] })],
            }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v, size: 16 })] })] }),
          ],
        }),
    );
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
  };

  for (const section of REPORT_SECTIONS.filter((s) => sectionHasContent(report, s))) {
    children.push(heading(sectionHeading(section)));
    const value = report[section.key];

    switch (section.kind) {
      case 'overview':
        children.push(new Paragraph({ children: [new TextRun({ text: (value as string).trim() })] }));
        break;
      case 'complaints':
        children.push(buildTable(COMPLAINT_COLUMNS, value as ComplaintRow[]));
        break;
      case 'allergies':
        children.push(buildTable(ALLERGY_COLUMNS, value as AllergyRow[]));
        break;
      case 'medications':
        children.push(buildTable(section.columns || TREATMENT_COLUMNS, value as MedicationRow[]));
        break;
      case 'vitals':
        children.push(kvTable(vitalsPairs(value as Vitals)));
        break;
      case 'followup':
        children.push(kvTable(followUpPairs(value as FollowUp)));
        break;
      case 'groups':
        for (const g of (value as SystemGroup[]).filter((x) => x.findings.length || x.name.trim())) {
          children.push(
            new Paragraph({
              spacing: { before: 60, after: 20 },
              children: [new TextRun({ text: g.name || 'Findings', bold: true, color: '334155', size: 20 })],
            }),
          );
          for (const f of g.findings.filter(Boolean)) {
            children.push(new Paragraph({ text: f, bullet: { level: 0 } }));
          }
        }
        break;
      default: // bullets
        for (const item of (value as string[]).filter(Boolean)) {
          children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
        }
        break;
    }
  }

  // Signature block
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 600 },
      children: [new TextRun({ text: '__________________________', color: '334155' })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: meta.doctorName || "Doctor's Signature", bold: true, size: 18 })],
    }),
  );

  const doc = new Document({ sections: [{ children }] });
  const base64 = await Packer.toBase64String(doc);
  await shareFile(
    fileName('report', meta, 'docx'),
    base64,
    'base64',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'org.openxmlformats.wordprocessingml.document',
  );
}
