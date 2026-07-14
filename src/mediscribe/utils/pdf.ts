// The SINGLE PDF service for MediScribe. Print and Download share ONE template and
// ONE pipeline: the exact HTML built by report.ts (buildReportHtml /
// buildTranscriptHtml) is what the browser PRINTS and what the backend renders (via
// headless Chrome) into the DOWNLOADED PDF. So the downloaded PDF is layout-identical
// to the print preview — same logo, CSS, fonts, tables, spacing, margins, page breaks,
// headers/footers — and it is a REAL selectable-text PDF (no screenshots, no jsPDF
// re-layout). Multilingual text stays readable because Chrome renders the Unicode fonts.

import { saveAs } from 'file-saver';

import { buildReportHtml, buildTranscriptHtml, type ReportMeta } from './report.js';
import { renderReportPdf } from '../services/api';
import type { ReportData } from '../types';

// Make a safe, readable file name like "report_jane-doe_2026-06-17".
function fileName(kind: string, meta: ReportMeta, ext: string): string {
  const name = (meta.patientName || 'patient')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const date = (meta.date || '').replace(/[^0-9a-zA-Z]+/g, '-').replace(/(^-|-$)/g, '');
  return [kind, name, date].filter(Boolean).join('_') + '.' + ext;
}

// Send the HTML to the backend's Chrome renderer and save the returned PDF file.
async function htmlToPdf(html: string, filename: string): Promise<void> {
  const blob = await renderReportPdf(html, filename);
  saveAs(blob, filename);
}

// Open the SAME report/transcript HTML in a print window. Same HTML the PDF is
// built from → the print preview and the downloaded PDF are the same document.
function printHtml(html: string): void {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Unable to open the print window. Please allow pop-ups and try again.');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ── Public API — the ONLY report/transcript PDF + print entry points ──────────
export const printReport = (report: ReportData, meta: ReportMeta = {}): void =>
  printHtml(buildReportHtml(report, meta));

export const printTranscript = (text: string, meta: ReportMeta = {}): void =>
  printHtml(buildTranscriptHtml(text, meta));

export const downloadReportPdf = (report: ReportData, meta: ReportMeta = {}): Promise<void> =>
  htmlToPdf(buildReportHtml(report, meta), fileName('report', meta, 'pdf'));

export const downloadTranscriptPdf = (text: string, meta: ReportMeta = {}): Promise<void> =>
  htmlToPdf(buildTranscriptHtml(text, meta), fileName('transcript', meta, 'pdf'));
