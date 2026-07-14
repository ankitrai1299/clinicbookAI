// The SINGLE PDF service for MediScribe. Print and Download share ONE rendering
// pipeline: the exact HTML built by report.ts (buildReportHtml / buildTranscriptHtml)
// is what the browser prints AND what we rasterise into the downloaded PDF. There is
// no second, jsPDF-hand-drawn report — so the downloaded PDF is the same document as
// the print preview (same logo, tables, spacing, margins, colours, fonts, page
// layout), and multilingual transcripts stay readable because the BROWSER renders the
// Unicode fonts (no glyph mapping into a Latin-only PDF font = no corrupted symbols).

import { buildReportHtml, buildTranscriptHtml, type ReportMeta } from './report.js';
import type { ReportData } from '../types';

// A4 content box at 96dpi. We render the HTML at this width so line breaks/tables
// match the print layout, then slice the tall capture across A4 PDF pages.
const A4_WIDTH_PX = 794; // 210mm @ 96dpi

// Make a safe, readable file name like "report_jane-doe_2026-06-17".
function fileName(kind: string, meta: ReportMeta, ext: string): string {
  const name = (meta.patientName || 'patient')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const date = (meta.date || '').replace(/[^0-9a-zA-Z]+/g, '-').replace(/(^-|-$)/g, '');
  return [kind, name, date].filter(Boolean).join('_') + '.' + ext;
}

// Render a full HTML document (offscreen, style-isolated in an iframe) to a canvas.
// Isolating in an iframe means the report's global CSS never leaks into the app, and
// html2canvas captures exactly what the browser painted — including Unicode glyphs.
async function renderHtmlToCanvas(html: string): Promise<HTMLCanvasElement> {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${A4_WIDTH_PX}px`,
    height: '100px',
    border: '0',
    background: '#ffffff',
  });
  document.body.appendChild(iframe);
  try {
    const idoc = iframe.contentWindow!.document;
    idoc.open();
    idoc.write(html);
    idoc.close();

    // Wait for the embedded (Noto) web fonts to load and one paint tick, so the
    // capture has the final, correctly-shaped multilingual glyphs.
    try {
      await (idoc as Document & { fonts?: FontFaceSet }).fonts?.ready;
    } catch {
      /* fonts API unavailable — system fonts still render the scripts */
    }
    await new Promise((r) => setTimeout(r, 80));

    const fullHeight = Math.max(idoc.documentElement.scrollHeight, idoc.body.scrollHeight, 200);
    iframe.style.height = `${fullHeight}px`;

    // Crisp text at scale 2, but keep the rasterised canvas height under the browser's
    // per-canvas limit (~32767px in Safari/Firefox) so LONG (10+ page) reports still
    // render instead of coming out blank.
    const MAX_CANVAS_PX = 30000;
    const scale = Math.min(2, Math.max(1, MAX_CANVAS_PX / fullHeight));

    const html2canvas = (await import('html2canvas')).default;
    return await html2canvas(idoc.body, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: A4_WIDTH_PX,
      width: A4_WIDTH_PX,
      height: fullHeight,
    });
  } finally {
    document.body.removeChild(iframe);
  }
}

// Rasterise an HTML document to a multi-page A4 PDF and save it. Handles long
// (10+ page) reports by slicing the single tall capture across pages.
export async function htmlToPdf(html: string, filename: string): Promise<void> {
  const canvas = await renderHtmlToCanvas(html);
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const dataUrl = canvas.toDataURL('image/png');

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH, undefined, 'FAST');
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH, undefined, 'FAST');
    heightLeft -= pageH;
  }
  pdf.save(filename);
}

// Open the shared report/transcript HTML in a print window. Same HTML the PDF is
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
