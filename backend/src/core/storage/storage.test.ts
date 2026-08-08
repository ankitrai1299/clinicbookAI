import { describe, it, expect } from 'vitest';

import { objectKey, clinicOfKey } from './storage.port.js';
import { signedPath, verifySignature } from './index.js';

// Consultation audio is a recording of a patient's visit. It used to be served
// from an unauthenticated static mount, defended only by a filename containing a
// millisecond timestamp. These tests pin the two things that replaced that:
// a URL that proves itself, and a key that names its owner.

const keyOf = (url: string) => decodeURI(url.split('?')[0].replace('/api/mediscribe/audio/', ''));
const param = (url: string, name: string) => new URLSearchParams(url.split('?')[1]).get(name) ?? undefined;

describe('object keys', () => {
  it('scopes every key to a clinic', () => {
    expect(objectKey('c1', 'consultations', 'a.webm')).toBe('clinics/c1/consultations/a.webm');
    expect(clinicOfKey('clinics/c1/consultations/a.webm')).toBe('c1');
  });

  it('refuses to name an owner for a malformed key', () => {
    // The route compares this against the caller's clinic. Returning something
    // hopeful for a key it cannot parse would turn a bad key into an open door.
    expect(clinicOfKey('consultations/a.webm')).toBeNull();
    expect(clinicOfKey('')).toBeNull();
    expect(clinicOfKey('clinics/')).toBeNull();
  });
});

describe('signed audio links', () => {
  it('accepts a link it just issued', () => {
    const url = signedPath('clinics/c1/consultations/a.webm');
    expect(verifySignature(keyOf(url), param(url, 'e'), param(url, 's'))).toBe('ok');
  });

  it('rejects a signature lifted onto a different key', () => {
    // The whole point: holding one valid link must not grant another recording.
    const url = signedPath('clinics/c1/consultations/mine.webm');
    expect(verifySignature('clinics/c2/consultations/theirs.webm', param(url, 'e'), param(url, 's'))).toBe('bad');
  });

  it('rejects a link whose expiry was edited to last longer', () => {
    const url = signedPath('clinics/c1/consultations/a.webm');
    const later = String(Number(param(url, 'e')) + 86_400);
    expect(verifySignature(keyOf(url), later, param(url, 's'))).toBe('bad');
  });

  it('expires, and says so distinctly from a forgery', () => {
    // "Expired" tells the UI to reopen the consultation; "bad" does not. They
    // must never be confused, or a real forgery reads as a stale tab.
    const issued = new Date('2026-08-08T10:00:00Z');
    const url = signedPath('clinics/c1/consultations/a.webm', issued);
    const after = new Date(issued.getTime() + 2 * 60 * 60 * 1000);
    expect(verifySignature(keyOf(url), param(url, 'e'), param(url, 's'), after)).toBe('expired');
  });

  it('rejects a missing or empty signature outright', () => {
    expect(verifySignature('clinics/c1/consultations/a.webm', '99999999999', undefined)).toBe('bad');
    expect(verifySignature('clinics/c1/consultations/a.webm', undefined, 'deadbeef')).toBe('bad');
    expect(verifySignature('clinics/c1/consultations/a.webm', 'not-a-number', 'deadbeef')).toBe('bad');
  });
});
