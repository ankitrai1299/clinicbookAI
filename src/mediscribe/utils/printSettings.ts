// How this clinic's printer is set up.
//
// A browser cannot talk to an A4 printer directly — that is a hard security
// boundary, not something to work around. What it CAN do is stop getting the page
// wrong, which is where the real complaints come from:
//
//   • Clinics print on their own pre-printed letterhead stationery. Our header
//     lands on top of theirs and the result is unusable, so they print to PDF and
//     re-print by hand. A blank top margin fixes it.
//   • The paper isn't always A4 (Letter in some places), so content is clipped.
//   • The full 18-section report goes out when all the patient needed was the
//     prescription — several pages of paper per visit.
//
// Stored per device, like the rest of the scribe's preferences.

export type PaperSize = 'A4' | 'Letter';
export type LetterheadMode = 'print' | 'preprinted';
export type PrintScope = 'prescription' | 'full';

export interface PrintSettings {
  paper: PaperSize;
  /**
   * 'print'      → we draw the clinic name / doctor letterhead.
   * 'preprinted' → the paper already has it; we leave `topOffsetMm` blank so we
   *                never overprint what the stationery already says.
   */
  letterhead: LetterheadMode;
  /** Blank space reserved at the top of page 1, in mm. Only for 'preprinted'. */
  topOffsetMm: number;
  /** Narrow margins fit more on a page; normal is safer on older printers. */
  margin: 'normal' | 'narrow';
  /** What the Print button sends by default. */
  scope: PrintScope;
}

const KEY = 'mediscribe.printSettings';

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paper: 'A4',
  letterhead: 'print',
  topOffsetMm: 45,
  margin: 'normal',
  // Most visits need the prescription, not the full clinical record. The full
  // report is one click away and is what gets filed/exported.
  scope: 'prescription',
};

export function loadPrintSettings(): PrintSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<PrintSettings>;
    return { ...DEFAULT_PRINT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS };
  }
}

export function savePrintSettings(settings: PrintSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

/**
 * The `@page` rule and page-one top padding for these settings.
 *
 * On pre-printed stationery we keep the normal side/bottom margins and push only
 * the FIRST page's content down — a page-2 continuation should start at the top
 * like any other sheet, because the stationery header is on sheet one.
 */
export function pageCss(s: PrintSettings): string {
  const side = s.margin === 'narrow' ? 12 : 20;
  const top = s.letterhead === 'preprinted' ? Math.max(0, Math.min(120, s.topOffsetMm)) : side;
  return `
  @page { size: ${s.paper}; margin: ${side}mm; }
  @page :first { margin-top: ${top}mm; }
  `;
}
