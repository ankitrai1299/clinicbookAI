import { describe, it, expect } from 'vitest';

import { parseFollowUpDate as backendParse, toISODate as backendIso } from './followUpDate.js';
// The BROWSER copy. Two builds, two module systems, one piece of logic — the
// phone app and the WhatsApp reply each parse the doctor's follow-up text with
// their own copy of this parser.
import {
  parseFollowUpDate as frontendParse,
  toISODate as frontendIso
} from '../../../../../src/mediscribe/utils/followUpDate.js';

// Why this test exists rather than a shared module: the two live in separate
// builds (Node/NodeNext and Vite/browser) and merging them means build surgery
// on both. The thing that actually matters is that they never DISAGREE — a
// doctor writing "after 2 weeks" must not see one date in the app while the
// patient is told another on WhatsApp. So the duplication is allowed and the
// divergence is what fails the build.

const FROM = new Date('2026-06-04T00:00:00Z'); // a Thursday

const CASES = [
  // relative
  'after 7 days', 'in 3 days', 'tomorrow', 'review in 10 days',
  '1 week', '2 weeks', '6 weeks', '1 month', 'after 1 month', '3 months',
  // absolute
  '11 June', 'June 11', '11 June 2026', '15/06/2026', '2026-06-11',
  // things that are NOT a date, and must stay null in both
  '', '   ', 'SOS', 'as needed', 'agle hafte', 'next monday', 'after two weeks',
  'when required', 'PRN', 'follow up if symptoms persist'
];

describe('the two follow-up parsers agree', () => {
  it.each(CASES)('parses %j the same on both sides', (text) => {
    expect(frontendParse(text, FROM)).toBe(backendParse(text, FROM));
  });

  it('agrees on a date that has not been written yet', () => {
    // Guards against one side drifting on month rollover / leap handling.
    for (const days of [1, 27, 28, 29, 30, 31, 59, 60, 365, 366]) {
      const from = new Date('2026-01-31T00:00:00Z');
      const text = `after ${days} days`;
      expect(frontendParse(text, from), text).toBe(backendParse(text, from));
    }
  });

  it('formats an ISO date identically', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-06-11', '2026-12-31']) {
      const d = new Date(`${iso}T00:00:00Z`);
      expect(frontendIso(d)).toBe(backendIso(d));
    }
  });

  it('covers enough ground to mean something', () => {
    // A parity test that runs three trivial cases passes forever and proves
    // nothing; keep it honest if someone trims the list.
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });
});
