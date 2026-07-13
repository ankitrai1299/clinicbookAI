import { describe, it, expect } from 'vitest';

import { extractJoinCode } from './whatsapp.binding.js';

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
