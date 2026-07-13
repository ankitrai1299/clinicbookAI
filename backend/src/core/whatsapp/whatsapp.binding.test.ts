import { describe, it, expect } from 'vitest';

import { extractJoinCode, phoneKey } from './whatsapp.binding.js';

describe('phoneKey (prevents cross-clinic mixing by phone format)', () => {
  it('collapses country-coded and national forms to the SAME key', () => {
    // The exact bug: a patient stored as 917903884686 in one clinic and
    // 7903884686 in another must resolve to one binding, not two.
    expect(phoneKey('917903884686')).toBe('7903884686');
    expect(phoneKey('7903884686')).toBe('7903884686');
    expect(phoneKey('+91 79038 84686')).toBe('7903884686');
    expect(phoneKey('91-7903884686')).toBe('7903884686');
    expect(phoneKey('917903884686')).toBe(phoneKey('7903884686'));
  });

  it('leaves short/empty input as-is', () => {
    expect(phoneKey('')).toBe('');
    expect(phoneKey(null)).toBe('');
    expect(phoneKey('12345')).toBe('12345');
  });
});

describe('extractJoinCode', () => {
  it('reads a tagged code (join/clinic/code/start CODE)', () => {
    expect(extractJoinCode('join SUNRISE')).toBe('SUNRISE');
    expect(extractJoinCode('clinic city12')).toBe('CITY12');
    expect(extractJoinCode('CODE abc9')).toBe('ABC9');
    expect(extractJoinCode('start Xy7z')).toBe('XY7Z');
  });

  it('reads a bare code (whole message is the code)', () => {
    expect(extractJoinCode('SUNRISE')).toBe('SUNRISE');
    expect(extractJoinCode('  a98epx ')).toBe('A98EPX');
  });

  it('returns null for ordinary messages', () => {
    expect(extractJoinCode('mujhe appointment chahiye')).toBeNull();
    expect(extractJoinCode('hi')).toBeNull(); // too short to be a code
    expect(extractJoinCode('meri report bhejo')).toBeNull();
    expect(extractJoinCode('')).toBeNull();
  });
});
