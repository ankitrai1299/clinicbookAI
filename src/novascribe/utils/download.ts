// Client-side export utilities: Transcript (.txt / .pdf) and Report (.pdf / .docx).
// Real file downloads (no server round-trip) so they work on Vercel as static.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
import { saveAs } from 'file-saver';
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
  sectionHasContent,
  COMPLAINT_COLUMNS,
  ALLERGY_COLUMNS,
  TREATMENT_COLUMNS,
  VITALS_FIELDS,
  FOLLOWUP_FIELDS,
} from './report';

const cellText = (row: Record<string, any>, col: ColumnDef): string => {
  const v = row[col.key];
  if (typeof v === 'string' && v) return v;
  // Legacy medication rows stored `dosage` instead of `dose`.
  if (col.key === 'dose' && typeof row.dosage === 'string') return row.dosage;
  return '';
};

export interface ExportMeta {
  patientName?: string;
  date?: string;
}

// Make a safe, readable file name like "report_jane-doe_2026-06-17".
function fileName(kind: string, meta: ExportMeta, ext: string): string {
  const name = (meta.patientName || 'patient')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const date = (meta.date || '').replace(/[^0-9a-zA-Z]+/g, '-').replace(/(^-|-$)/g, '');
  return [kind, name, date].filter(Boolean).join('_') + '.' + ext;
}

const NOT_MENTIONED = 'Not mentioned';

// ── Transcript: TXT ──────────────────────────────────────────
export function downloadTranscriptTxt(text: string, meta: ExportMeta): void {
  const header = [
    'NovaScribe AI — Consultation Transcript',
    meta.patientName ? `Patient: ${meta.patientName}` : '',
    meta.date ? `Date: ${meta.date}` : '',
    '',
    '',
  ].filter((l, i) => l !== '' || i >= 3);
  const blob = new Blob([header.join('\n') + (text || '')], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, fileName('transcript', meta, 'txt'));
}

// ── Transcript: PDF ──────────────────────────────────────────
export function downloadTranscriptPdf(text: string, meta: ExportMeta): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 48;
  const top = 56;
  const width = doc.internal.pageSize.getWidth() - marginX * 2;
  const bottom = doc.internal.pageSize.getHeight() - 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Consultation Transcript', marginX, top);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  const sub = [meta.patientName, meta.date].filter(Boolean).join('  •  ') || 'NovaScribe AI';
  doc.text(sub, marginX, top + 16);
  doc.setTextColor(20);

  doc.setFontSize(11.5);
  const lines = doc.splitTextToSize((text || '').trim() || NOT_MENTIONED, width);
  let y = top + 42;
  const lineHeight = 16;
  for (const line of lines) {
    if (y > bottom) {
      doc.addPage();
      y = top;
    }
    doc.text(line, marginX, y);
    y += lineHeight;
  }

  doc.save(fileName('transcript', meta, 'pdf'));
}

// Non-empty key/value pairs for the vitals + follow-up sections.
const vitalsPairs = (v: Vitals): [string, string][] =>
  VITALS_FIELDS.filter(f => (v[f.key] || '').trim()).map(f => [f.label, v[f.key]]);

const followUpPairs = (f: FollowUp): [string, string][] =>
  FOLLOWUP_FIELDS.filter(x => (f[x.key] || '').trim()).map(x => [x.label, f[x.key]]);

// ── Report: PDF (Premium Clinical Report — paginated, empty sections omitted) ──
export function downloadReportPdf(report: ReportData, meta: ExportMeta): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const bottom = pageHeight - 48;
  let y = 52;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = 52;
    }
  };

  const table = (head: string[], body: (string | { content: string; colSpan?: number })[][]) => {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [head],
      body: body as any,
      styles: { fontSize: 8.5, cellPadding: 3.5, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [239, 246, 255], textColor: [30, 58, 138], fontStyle: 'bold' },
      theme: 'grid',
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  };

  const bulletList = (items: string[]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(30);
    for (const item of items.filter(Boolean)) {
      const lines = doc.splitTextToSize(item, contentWidth - 14);
      lines.forEach((line: string, i: number) => {
        ensureSpace(14);
        if (i === 0) doc.text('•', marginX, y);
        doc.text(line, marginX + 14, y);
        y += 14;
      });
    }
    y += 6;
  };

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(29, 78, 216);
  doc.text('NOVASCRIBE AI', pageWidth / 2, y, { align: 'center' });
  y += 16;
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text('CLINICAL REPORT', pageWidth / 2, y, { align: 'center' });
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const sub = [meta.patientName, meta.date].filter(Boolean).join('  •  ');
  if (sub) {
    doc.text(sub, pageWidth / 2, y, { align: 'center' });
    y += 14;
  }
  doc.setDrawColor(29, 78, 216);
  doc.setLineWidth(1.2);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.5);
  y += 20;

  let n = 0;
  for (const section of REPORT_SECTIONS.filter(s => sectionHasContent(report, s))) {
    n += 1;
    ensureSpace(48);

    // Section heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(29, 78, 216);
    doc.text(`${n}. ${section.title.toUpperCase()}`, marginX, y);
    y += 5;
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, y, pageWidth - marginX, y);
    doc.setTextColor(30);
    y += 14;

    const value = report[section.key];

    switch (section.kind) {
      case 'overview': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        const lines = doc.splitTextToSize((value as string).trim(), contentWidth);
        for (const line of lines) {
          ensureSpace(14);
          doc.text(line, marginX, y);
          y += 14;
        }
        y += 8;
        break;
      }
      case 'complaints': {
        const cols = COMPLAINT_COLUMNS;
        table(
          cols.map(c => c.label),
          (value as ComplaintRow[]).map(r => cols.map(c => cellText(r, c))),
        );
        break;
      }
      case 'allergies': {
        const cols = ALLERGY_COLUMNS;
        table(
          cols.map(c => c.label),
          (value as AllergyRow[]).map(r => cols.map(c => cellText(r, c))),
        );
        break;
      }
      case 'medications': {
        const cols = section.columns || TREATMENT_COLUMNS;
        table(
          cols.map(c => c.label),
          (value as MedicationRow[]).map(r => cols.map(c => cellText(r, c))),
        );
        break;
      }
      case 'vitals':
        table(['Measurement', 'Value'], vitalsPairs(value as Vitals));
        break;
      case 'followup':
        table(['Field', 'Detail'], followUpPairs(value as FollowUp));
        break;
      case 'groups': {
        for (const g of (value as SystemGroup[]).filter(x => x.findings.length || x.name.trim())) {
          ensureSpace(16);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(51, 65, 85);
          doc.text(g.name || 'Findings', marginX, y);
          y += 14;
          doc.setTextColor(30);
          bulletList(g.findings);
        }
        break;
      }
      default: // bullets
        bulletList(value as string[]);
        break;
    }
  }

  // Signature block
  ensureSpace(60);
  y += 24;
  doc.setDrawColor(51, 65, 85);
  doc.line(pageWidth - marginX - 200, y, pageWidth - marginX, y);
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("Doctor's Signature", pageWidth - marginX, y, { align: 'right' });

  doc.save(fileName('report', meta, 'pdf'));
}

// ── Report: DOCX (Premium Clinical Report — empty sections omitted) ──
export async function downloadReportDocx(report: ReportData, meta: ExportMeta): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'NOVASCRIBE AI', bold: true, color: '1D4ED8', size: 20 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'CLINICAL REPORT', bold: true, size: 34 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: [meta.patientName, meta.date].filter(Boolean).join('  •  ') || 'Generated by NovaScribe AI',
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
        c =>
          new TableCell({
            shading: { fill: 'EFF6FF' },
            children: [new Paragraph({ children: [new TextRun({ text: c.label, bold: true, size: 16 })] })],
          }),
      ),
    });
    const bodyRows = rows.map(
      r =>
        new TableRow({
          children: cols.map(
            c =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: cellText(r, c), size: 16 })] })],
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

  let n = 0;
  for (const section of REPORT_SECTIONS.filter(s => sectionHasContent(report, s))) {
    n += 1;
    children.push(heading(`${n}. ${section.title}`));
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
        for (const g of (value as SystemGroup[]).filter(x => x.findings.length || x.name.trim())) {
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
      children: [new TextRun({ text: "Doctor's Signature", bold: true, size: 18 })],
    }),
  );

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName('report', meta, 'docx'));
}
