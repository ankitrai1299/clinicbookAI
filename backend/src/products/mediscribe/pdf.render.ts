// Server-side HTML → PDF via headless Chrome (puppeteer-core). The CLIENT builds the
// report/transcript HTML (report.ts buildReportHtml/buildTranscriptHtml — the SAME
// template it prints) and POSTs it here; Chrome's own print engine renders it to a
// REAL, selectable-text PDF. So the downloaded PDF is byte-for-layout identical to
// the print preview (same CSS/fonts/tables/margins/page breaks) — no screenshots,
// no jsPDF re-layout, one template, one pipeline.

import fs from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';

// Resolve the Chromium/Chrome executable. In the Docker image we install chromium and
// set PUPPETEER_EXECUTABLE_PATH; locally we fall back to a common Chrome/Edge path.
function chromeExecutablePath(): string {
  const fromEnv = (process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
  if (fromEnv) return fromEnv;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  throw new Error('No Chromium/Chrome executable found — set PUPPETEER_EXECUTABLE_PATH');
}

/** Render a full HTML document to an A4 PDF (20mm margins, selectable text). */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser: Browser = await puppeteer.launch({
    executablePath: chromeExecutablePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    // 'load' waits for stylesheets/fonts; if the (best-effort) web-font CDN is
    // unreachable the load still settles and system Noto fonts render the scripts.
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 }).catch(() => undefined);
    // Wait for web fonts to settle (string form → runs in the page, not Node).
    await page.evaluate('document.fonts ? document.fonts.ready : true').catch(() => undefined);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
