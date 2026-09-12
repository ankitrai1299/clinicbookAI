import { describe, it, expect } from 'vitest';

import { downsample24to16, CAPTURE_RATE, SARVAM_RATE } from './types';
import { sarvamLanguageFor } from './sarvamLive';

// ── Resampling ─────────────────────────────────────────────────────────────
//
// The two providers disagree about sample rate — Sarvam wants exactly 16000,
// OpenAI refuses anything under 24000 ("integer below minimum value", its own
// words) — so capture is 24000 and Sarvam is fed a 3:2 reduction of it. If this
// is wrong the audio is not merely worse, it is a different speed and a
// different pitch, and Sarvam returns confident nonsense rather than an error.

const pcm = (...samples: number[]): Buffer => {
  const b = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => b.writeInt16LE(s, i * 2));
  return b;
};
const samplesOf = (b: Buffer): number[] =>
  Array.from({ length: b.length / 2 }, (_, i) => b.readInt16LE(i * 2));

describe('downsample24to16', () => {
  it('turns every three samples into two', () => {
    expect(samplesOf(downsample24to16(pcm(0, 0, 0)))).toHaveLength(2);
    expect(samplesOf(downsample24to16(pcm(...Array(300).fill(0))))).toHaveLength(200);
  });

  it('keeps one second of audio one second long', () => {
    // The check that catches a wrong ratio: a 24 kHz second must come out as a
    // 16 kHz second, not as a fast or slow one.
    const oneSecond = Buffer.alloc(CAPTURE_RATE * 2);
    expect(downsample24to16(oneSecond).length / 2).toBe(SARVAM_RATE);
  });

  it('holds a constant signal constant', () => {
    // Averaging must not sag on steady input; a drift here would show as a DC
    // offset, which sounds like a click at every buffer boundary.
    const flat = pcm(...Array(30).fill(1000));
    expect(new Set(samplesOf(downsample24to16(flat)))).toEqual(new Set([1000]));
  });

  it('never overflows 16-bit on full-scale input', () => {
    // Averaging cannot exceed its inputs, but the rounding could — and an
    // overflow wraps to the opposite sign, which is an audible crack.
    for (const v of [32767, -32768]) {
      for (const s of samplesOf(downsample24to16(pcm(...Array(30).fill(v))))) {
        expect(s).toBeGreaterThanOrEqual(-32768);
        expect(s).toBeLessThanOrEqual(32767);
      }
    }
  });

  it('ignores a trailing partial group rather than reading past the buffer', () => {
    // Frames arrive on 100 ms boundaries, but a final flush can be any length.
    expect(() => downsample24to16(pcm(1, 2))).not.toThrow();
    expect(samplesOf(downsample24to16(pcm(1, 2)))).toHaveLength(0);
  });

  it('handles an empty buffer', () => {
    expect(downsample24to16(Buffer.alloc(0)).length).toBe(0);
  });
});

// ── Sarvam's language ──────────────────────────────────────────────────────
//
// Sarvam given hi-IN transcribed the sample perfectly. Sarvam given 'auto' heard
// Hindi as Indian English and returned "Doctor, sorry, sorry, sorry…". So this
// function exists to make sure 'auto' can never reach it.

describe('sarvamLanguageFor', () => {
  it('never passes auto through', () => {
    // The measured failure. A fallback that degrades into nonsense is worse than
    // no fallback, because nobody goes looking.
    expect(sarvamLanguageFor('auto')).toBe('hi-IN');
    expect(sarvamLanguageFor('AUTO')).toBe('hi-IN');
  });

  it('defaults to Hindi when told nothing', () => {
    for (const v of ['', '   ', undefined]) expect(sarvamLanguageFor(v)).toBe('hi-IN');
  });

  it('keeps a language it supports', () => {
    expect(sarvamLanguageFor('bn-IN')).toBe('bn-IN');
    expect(sarvamLanguageFor('ta-IN')).toBe('ta-IN');
  });

  it('accepts a bare code and adds the region', () => {
    expect(sarvamLanguageFor('bn')).toBe('bn-IN');
    expect(sarvamLanguageFor('mr')).toBe('mr-IN');
  });

  it('falls back to Hindi for a language it does not list', () => {
    // Bhojpuri, Awadhi and Magahi are not in Sarvam's list. Hindi is their
    // nearest relative — same script, much shared vocabulary — so it degrades
    // rather than collapses, which is what an English model would do.
    for (const v of ['bho', 'bho-IN', 'awa', 'klingon']) {
      expect(sarvamLanguageFor(v), v).toBe('hi-IN');
    }
  });
});
