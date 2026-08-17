import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let status: 'granted' | 'withdrawn' | null = null;
vi.mock('./consent.service.js', () => ({
  consentStatus: async () => status
}));

const { requireRecordingConsent, recordingConsentEnforced } = await import('./recordingConsent.js');

const original = process.env.CONSENT_ENFORCE_RECORDING_CLINICS;

beforeEach(() => {
  status = null;
  delete process.env.CONSENT_ENFORCE_RECORDING_CLINICS;
});
afterEach(() => {
  if (original === undefined) delete process.env.CONSENT_ENFORCE_RECORDING_CLINICS;
  else process.env.CONSENT_ENFORCE_RECORDING_CLINICS = original;
});

describe('the recording-consent gate rolls out per clinic', () => {
  it('is off when nothing is configured, so nobody breaks on the day it ships', async () => {
    // The native MediScribe app is reproduced verbatim and has no consent
    // screen. Enforcing globally would stop every doctor using it from
    // recording anything. The web scribe captures consent regardless; this flag
    // is only about REFUSING.
    expect(recordingConsentEnforced('c1')).toBe(false);
    await expect(requireRecordingConsent('c1', 'p1')).resolves.toBeUndefined();
  });

  it('is on for the clinics named', () => {
    process.env.CONSENT_ENFORCE_RECORDING_CLINICS = 'c1, c3';
    expect(recordingConsentEnforced('c1')).toBe(true);
    expect(recordingConsentEnforced('c3')).toBe(true);
    expect(recordingConsentEnforced('c2')).toBe(false);
  });

  it('is on everywhere for "all"', () => {
    process.env.CONSENT_ENFORCE_RECORDING_CLINICS = 'all';
    expect(recordingConsentEnforced('any-clinic')).toBe(true);
  });

  it('is read per call, so switching a clinic on needs no code change', () => {
    expect(recordingConsentEnforced('c1')).toBe(false);
    process.env.CONSENT_ENFORCE_RECORDING_CLINICS = 'c1';
    expect(recordingConsentEnforced('c1')).toBe(true);
  });
});

describe('what the gate refuses once it is on', () => {
  beforeEach(() => {
    process.env.CONSENT_ENFORCE_RECORDING_CLINICS = 'all';
  });

  it('allows a patient who consented', async () => {
    status = 'granted';
    await expect(requireRecordingConsent('c1', 'p1')).resolves.toBeUndefined();
  });

  it('refuses a patient who has not been asked, and says what to do', async () => {
    status = null;
    await expect(requireRecordingConsent('c1', 'p1')).rejects.toThrow(/Confirm the patient has been told/);
  });

  it('refuses a patient who withdrew, and says so distinctly', async () => {
    // "Never asked" and "said no" need different messages: one is a step the
    // doctor can take, the other is a decision they must respect.
    status = 'withdrawn';
    await expect(requireRecordingConsent('c1', 'p1')).rejects.toThrow(/withdrawn consent/);
  });

  it('lets a walk-in with no patient record through', async () => {
    // A doctor recording before the patient row exists has nobody who could have
    // consented. Refusing would block a real clinical workflow to satisfy a
    // check that cannot be answered; the consent is captured when the note is
    // attached to a patient.
    status = null;
    await expect(requireRecordingConsent('c1', null)).resolves.toBeUndefined();
    await expect(requireRecordingConsent('c1', undefined)).resolves.toBeUndefined();
  });
});

// ── Structural: the outbound path cannot forget the opt-out check ───────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE = path.resolve(__dirname, '../whatsapp/whatsapp.service.ts');

describe('every outbound path checks the opt-out', () => {
  const src = fs.readFileSync(SERVICE, 'utf8');

  it('guards every send function, directly or through one that is guarded', () => {
    // A new send path that skips this would message a patient who said STOP and
    // nothing else in the system would notice. Each exported sender must either
    // call the guard itself, or delegate to a sender that does —
    // sendTemplatedOrSession is the second kind: it picks between the template
    // and session senders, both of which are guarded.
    const bodies = src.split(/(?=export const send\w+ = async)/).filter((b) => /^export const send/.test(b));
    expect(bodies.length).toBeGreaterThanOrEqual(4);

    const unguarded = bodies
      .map((body) => ({ name: body.match(/export const (send\w+)/)?.[1] ?? '?', body }))
      .filter(({ body }) => !/optOutIntercept\(/.test(body) && !/send\w+\(\s*\{/.test(body))
      .map(({ name }) => name);

    expect(
      unguarded,
      `these send paths never check whether the patient opted out:\n  ${unguarded.join('\n  ')}`
    ).toEqual([]);
  });

  it('runs the opt-out check before the daily cap', () => {
    // A suppressed message must not consume the clinic's paid send quota.
    expect(src.indexOf('optOutIntercept(')).toBeLessThan(src.indexOf('dailyCapIntercept('));
  });

  it('still delivers the confirmation that opting out worked', () => {
    // A silent STOP reads as a broken system: the patient has no way to know it
    // took effect, and will keep waiting for messages that will never come.
    expect(src).toContain("OPT_OUT_EXEMPT_TYPES = new Set(['optout_confirmation', 'optin_confirmation'])");
  });
});
