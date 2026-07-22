// The SINGLE PDF service for MediScribe. Print and Download share ONE template and
// ONE pipeline: the exact HTML built by report.ts (buildReportHtml /
// buildTranscriptHtml) is what the browser PRINTS and what the backend renders (via
// headless Chrome) into the DOWNLOADED PDF. So the downloaded PDF is layout-identical
// to the print preview — same logo, CSS, fonts, tables, spacing, margins, page breaks,
// headers/footers — and it is a REAL selectable-text PDF (no screenshots, no jsPDF
// re-layout). Multilingual text stays readable because Chrome renders the Unicode fonts.

import { saveAs } from 'file-saver';

import { buildReportHtml, buildTranscriptHtml, type ReportMeta } from './report.js';
import { loadPrintSettings, type PrintScope } from './printSettings';
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
// Inside the mobile WebView there's no browser "Save As", so the PDF blob is
// handed to the React Native shell (base64 over postMessage); the shell writes it
// to a file and opens the native share sheet (Save to Files / Print / WhatsApp…).
async function htmlToPdf(html: string, filename: string): Promise<void> {
  const blob = await renderReportPdf(html, filename);
  const bridge = (window as unknown as {
    ReactNativeWebView?: { postMessage: (m: string) => void };
  }).ReactNativeWebView;
  if (bridge) {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    bridge.postMessage(JSON.stringify({ type: 'pdf', filename, dataUrl }));
    return;
  }
  saveAs(blob, filename);
}

// Running inside the mobile app's WebView shell (React Native).
const inMobileApp = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;

// Inside the app, `window.print()` / popup windows don't work in a WebView (and a
// report opened in the WebView traps the user with no working Back). So Print is
// handed to the React Native shell, which opens the NATIVE Android print dialog
// (expo-print) — that shows any connected printer + "Save as PDF" and has its own
// Cancel/Back. We send the exact same report/transcript HTML the PDF is built from.
function bridgePrint(html: string): void {
  (window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } })
    .ReactNativeWebView?.postMessage(JSON.stringify({ type: 'print', html }));
}

// Print the SAME HTML the PDF is built from, so the print preview and the
// downloaded PDF are the same document.
//
// This used to open a new tab with window.open(). Two problems, both of which a
// clinic hits daily: pop-up blockers silently killed it (Print appeared to do
// nothing), and when it did work the doctor was left with an extra tab to close
// after every prescription.
//
// A hidden same-document iframe has neither problem — nothing to block, nothing
// to close, and the doctor never leaves the consultation. The iframe is removed
// once the print dialog closes; `onafterprint` fires on cancel too, and the
// timeout is a backstop for browsers that don't fire it at all.
function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);

  const cleanup = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      cleanup();
      throw new Error('Unable to prepare the document for printing.');
    }
    win.onafterprint = cleanup;
    // Give fonts and the Unicode/Indic faces a moment to load, or the first page
    // can print with fallback glyphs.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        // Backstop: some browsers never fire onafterprint.
        setTimeout(cleanup, 60_000);
      }
    }, 350);
  };

  const doc = frame.contentDocument;
  if (!doc) {
    cleanup();
    throw new Error('Unable to prepare the document for printing.');
  }
  doc.open();
  doc.write(html);
  doc.close();
}

// ── Public API — the ONLY report/transcript PDF + print entry points ──────────

/**
 * Print the report, laid out for THIS clinic's paper.
 *
 * The device's print settings are applied here rather than at every call site,
 * so paper size, margins and pre-printed-stationery handling can never be
 * forgotten by one button and remembered by another. `scope` overrides the
 * configured default for a one-off (e.g. "print the full record just this once").
 */
export const printReport = (
  report: ReportData,
  meta: ReportMeta = {},
  opts: { scope?: PrintScope } = {},
): void => {
  const print = loadPrintSettings();
  const html = buildReportHtml(report, { ...meta, print }, { scope: opts.scope ?? print.scope });
  return inMobileApp() ? bridgePrint(html) : printHtml(html);
};

export const printTranscript = (text: string, meta: ReportMeta = {}): void => {
  const html = buildTranscriptHtml(text, { ...meta, print: loadPrintSettings() });
  return inMobileApp() ? bridgePrint(html) : printHtml(html);
};

export const downloadReportPdf = (report: ReportData, meta: ReportMeta = {}): Promise<void> =>
  htmlToPdf(buildReportHtml(report, meta), fileName('report', meta, 'pdf'));

export const downloadTranscriptPdf = (text: string, meta: ReportMeta = {}): Promise<void> =>
  htmlToPdf(buildTranscriptHtml(text, meta), fileName('transcript', meta, 'pdf'));
