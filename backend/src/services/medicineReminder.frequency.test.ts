import { describe, it, expect } from 'vitest';

import { parseFrequencyTimes, parseDurationDays, medicineLabel } from './medicineReminder.frequency.js';

describe('parseFrequencyTimes', () => {
  it('maps standard shorthand to N daily times', () => {
    expect(parseFrequencyTimes('OD')).toEqual(['09:00']);
    expect(parseFrequencyTimes('BD')).toEqual(['09:00', '21:00']);
    expect(parseFrequencyTimes('TDS')).toEqual(['08:00', '14:00', '20:00']);
    expect(parseFrequencyTimes('QID')).toEqual(['08:00', '12:00', '16:00', '20:00']);
    expect(parseFrequencyTimes('twice a day')).toEqual(['09:00', '21:00']);
  });

  it('parses "1-0-1" morning/afternoon/night patterns', () => {
    expect(parseFrequencyTimes('1-0-1')).toEqual(['08:00', '20:00']);
    expect(parseFrequencyTimes('1-1-1')).toEqual(['08:00', '14:00', '20:00']);
    expect(parseFrequencyTimes('0-0-1')).toEqual(['20:00']);
    expect(parseFrequencyTimes('1-0-1-1')).toEqual(['08:00', '20:00', '22:00']);
  });

  it('handles "every N hours" and bedtime', () => {
    expect(parseFrequencyTimes('every 8 hours')).toEqual(['08:00', '14:00', '20:00']);
    expect(parseFrequencyTimes('every 12 hours')).toEqual(['09:00', '21:00']);
    expect(parseFrequencyTimes('HS')).toEqual(['22:00']);
  });

  it('schedules NOTHING for as-needed or unknown', () => {
    expect(parseFrequencyTimes('SOS')).toEqual([]);
    expect(parseFrequencyTimes('PRN')).toEqual([]);
    expect(parseFrequencyTimes('as needed')).toEqual([]);
    expect(parseFrequencyTimes('')).toEqual([]);
    expect(parseFrequencyTimes('when required')).toEqual([]);
    expect(parseFrequencyTimes('gargle')).toEqual([]);
  });
});

describe('parseDurationDays', () => {
  it('parses days/weeks/months and bare numbers', () => {
    expect(parseDurationDays('5 days')).toBe(5);
    expect(parseDurationDays('1 week')).toBe(7);
    expect(parseDurationDays('2 weeks')).toBe(14);
    expect(parseDurationDays('1 month')).toBe(30);
    expect(parseDurationDays('7')).toBe(7);
    expect(parseDurationDays('ongoing')).toBeNull();
    expect(parseDurationDays('')).toBeNull();
  });
});

describe('medicineLabel', () => {
  it('builds a readable one-liner', () => {
    expect(medicineLabel({ medicine: 'Paracetamol', strength: '500mg', dose: '1 tablet', timing: 'after food' }))
      .toBe('Paracetamol 500mg — 1 tablet, after food');
    expect(medicineLabel({ medicine: 'Amoxicillin' })).toBe('Amoxicillin');
    expect(medicineLabel({})).toBe('your medicine');
  });
});
