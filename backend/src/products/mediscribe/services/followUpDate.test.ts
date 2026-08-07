import { describe, it, expect } from 'vitest';

// Follow-up dates go out to PATIENTS on WhatsApp. A wrong weekday on "come back
// on Monday" is not cosmetic — the patient reads the day, not the number.
import { parseFollowUpDate, formatFollowUpLine, toISODate } from './followUpDate';

const VISIT = new Date(2026, 7, 4); // Tue 4 Aug 2026 — the consultation

describe('parseFollowUpDate', () => {
  it('reads the exact string production had wrong', () => {
    // Stored as "Monday, June 11th, 2026". The date is real; the weekday is not.
    expect(parseFollowUpDate('Monday, June 11th, 2026', VISIT)).toBe('2026-06-11');
  });

  it('survives the "Next visit: " prefix the API prepends', () => {
    expect(parseFollowUpDate('Next visit: Monday, June 11th, 2026', VISIT)).toBe('2026-06-11');
  });

  it('reads a month name either way round', () => {
    expect(parseFollowUpDate('11 June 2026', VISIT)).toBe('2026-06-11');
    expect(parseFollowUpDate('June 11, 2026', VISIT)).toBe('2026-06-11');
    expect(parseFollowUpDate('11th Jun 2026', VISIT)).toBe('2026-06-11');
  });

  it('rolls a month with no year forward, never backward', () => {
    // "come in June" said in August means NEXT June — booking a date already
    // gone would be worse than not parsing it at all.
    expect(parseFollowUpDate('11 June', VISIT)).toBe('2027-06-11');
    // …but one still ahead this year stays this year.
    expect(parseFollowUpDate('11 December', VISIT)).toBe('2026-12-11');
  });

  it('counts relative phrases from the VISIT, not from now', () => {
    // The whole point: reading the record weeks later must not move the date.
    expect(parseFollowUpDate('after 3 days', VISIT)).toBe('2026-08-07');
    expect(parseFollowUpDate('in 2 weeks', VISIT)).toBe('2026-08-18');
    expect(parseFollowUpDate('1 month', VISIT)).toBe('2026-09-04');
  });

  it('reads Indian day-first numeric dates', () => {
    expect(parseFollowUpDate('15/08/2026', VISIT)).toBe('2026-08-15');
    expect(parseFollowUpDate('15-08-26', VISIT)).toBe('2026-08-15');
  });

  it('swaps only when the first number cannot be a month', () => {
    expect(parseFollowUpDate('08/15/2026', VISIT)).toBe('2026-08-15');
  });

  it('takes an explicit ISO date as given', () => {
    expect(parseFollowUpDate('2026-09-01', VISIT)).toBe('2026-09-01');
  });

  it('returns null for advice that is not a date', () => {
    // Production has this one. It must NOT become a date.
    expect(parseFollowUpDate('Come with reports after the day', VISIT)).toBeNull();
    expect(parseFollowUpDate('', VISIT)).toBeNull();
    expect(parseFollowUpDate(undefined, VISIT)).toBeNull();
  });
});

describe('formatFollowUpLine', () => {
  it('DERIVES the weekday from the date instead of repeating the text', () => {
    // 11 June 2026 is a Thursday. The model said Monday.
    expect(formatFollowUpLine('Monday, June 11th, 2026', VISIT)).toBe('Thursday, 11 June 2026');
  });

  it('agrees with the calendar on every date it formats', () => {
    for (const iso of ['2026-06-11', '2026-08-15', '2026-09-01', '2027-01-01']) {
      const [y, m, d] = iso.split('-').map(Number);
      const expected = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long' });
      expect(formatFollowUpLine(iso, VISIT)!.startsWith(expected)).toBe(true);
    }
  });

  it('passes non-date advice through untouched', () => {
    expect(formatFollowUpLine('Come with reports after the day', VISIT)).toBe(
      'Come with reports after the day'
    );
  });

  it('returns null when there is nothing to say', () => {
    expect(formatFollowUpLine('', VISIT)).toBeNull();
    expect(formatFollowUpLine(undefined, VISIT)).toBeNull();
  });
});

describe('toISODate', () => {
  it('formats in LOCAL time, so a late-evening visit does not roll to tomorrow', () => {
    expect(toISODate(new Date(2026, 7, 4, 22, 30))).toBe('2026-08-04');
  });
});
