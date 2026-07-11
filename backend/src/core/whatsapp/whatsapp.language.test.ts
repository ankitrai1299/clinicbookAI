import { describe, it, expect, afterEach } from 'vitest';

import { detectLang, storedLangToCode, codeToLangName, isTranslateEnabledFor } from './whatsapp.language.js';

describe('detectLang (by script)', () => {
  it('detects Indian-language scripts', () => {
    expect(detectLang('मुझे appointment चाहिए')).toBe('hi'); // Devanagari
    expect(detectLang('எனக்கு உதவி வேண்டும்')).toBe('ta'); // Tamil
    expect(detectLang('నాకు అపాయింట్‌మెంట్ కావాలి')).toBe('te'); // Telugu
    expect(detectLang('আমার একটি অ্যাপয়েন্টমেন্ট দরকার')).toBe('bn'); // Bengali
  });

  it('treats Latin / English / Hinglish as English', () => {
    expect(detectLang('mujhe appointment chahiye')).toBe('en');
    expect(detectLang('book appointment')).toBe('en');
    expect(detectLang('10:00 AM')).toBe('en');
  });
});

describe('language name/code mapping', () => {
  it('round-trips names and codes', () => {
    expect(storedLangToCode('Hindi')).toBe('hi');
    expect(storedLangToCode('tamil')).toBe('ta');
    expect(storedLangToCode(undefined)).toBe('en');
    expect(codeToLangName('hi')).toBe('Hindi');
  });
});

describe('isTranslateEnabledFor (gate)', () => {
  afterEach(() => {
    delete process.env.WHATSAPP_TRANSLATE_NUMBERS;
  });

  it('is OFF by default (blank/off)', () => {
    expect(isTranslateEnabledFor('919876543210')).toBe(false);
    process.env.WHATSAPP_TRANSLATE_NUMBERS = 'off';
    expect(isTranslateEnabledFor('919876543210')).toBe(false);
  });

  it('all/* enables everyone', () => {
    process.env.WHATSAPP_TRANSLATE_NUMBERS = 'all';
    expect(isTranslateEnabledFor('919876543210')).toBe(true);
  });

  it('matches a specific number (suffix-tolerant)', () => {
    process.env.WHATSAPP_TRANSLATE_NUMBERS = '9876543210';
    expect(isTranslateEnabledFor('+91 98765 43210')).toBe(true);
    expect(isTranslateEnabledFor('919999999999')).toBe(false);
  });
});
