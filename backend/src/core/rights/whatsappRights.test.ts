import { describe, it, expect } from 'vitest';

import { detectRightsRequest } from './whatsappRights.js';

// These phrases sit in front of the booking FSM. That is what makes them useful
// — a patient asking about their record must not have it read as a menu choice —
// and it is also the entire risk: a rights keyword that fires on "1" or on
// "please don't delete my appointment" breaks booking for every patient in every
// clinic, to serve a request nobody made.
//
// So most of this file is about what must NOT be detected.

describe('recognising a rights request', () => {
  it('recognises an access request in both languages', () => {
    for (const text of ['my data', 'My Data', ' my information ', 'mera data', 'meri jankari', 'मेरा डेटा']) {
      expect(detectRightsRequest(text), text).toBe('access');
    }
  });

  it('recognises an erasure request', () => {
    for (const text of ['delete my data', 'erase my data', 'mera data delete karo', 'मेरा डेटा हटाओ']) {
      expect(detectRightsRequest(text), text).toBe('erasure');
    }
  });

  it('recognises a correction request', () => {
    expect(detectRightsRequest('my data is wrong')).toBe('correction');
    expect(detectRightsRequest('mera data galat hai')).toBe('correction');
  });

  it('recognises a complaint', () => {
    expect(detectRightsRequest('complaint')).toBe('grievance');
    expect(detectRightsRequest('shikayat')).toBe('grievance');
    expect(detectRightsRequest('शिकायत')).toBe('grievance');
  });

  it('ignores trailing punctuation and stray spacing, which is how people type', () => {
    expect(detectRightsRequest('my data?')).toBe('access');
    expect(detectRightsRequest('  delete my data.  ')).toBe('erasure');
  });
});

describe('what must NOT be read as a rights request', () => {
  it('never fires on a booking menu selection', () => {
    // The overwhelming majority of inbound messages are these.
    for (const text of ['1', '2', '3', '4', 'yes', 'no', 'ok', 'hi', 'hello']) {
      expect(detectRightsRequest(text), text).toBeNull();
    }
  });

  it('never fires on ordinary booking language', () => {
    for (const text of [
      'book appointment',
      'cancel my appointment',
      'delete my appointment',
      'reschedule',
      'my appointment kab hai',
      'doctor available hai kya'
    ]) {
      expect(detectRightsRequest(text), text).toBeNull();
    }
  });

  it('never fires because a phrase appears INSIDE a longer message', () => {
    // Substring matching here would be catastrophic and completely invisible:
    // the patient would get a data-rights reply instead of their booking, and
    // would have no way to describe the bug.
    for (const text of [
      'please do not delete my data thanks',
      'is my data safe with you',
      'i have a complaint about the waiting time',
      'mera data galat hai kya aap check karenge'
    ]) {
      expect(detectRightsRequest(text), text).toBeNull();
    }
  });

  it('never fires on clinical questions that mention deletion or records', () => {
    for (const text of ['my records', 'medical record chahiye', 'report bhejo', 'prescription bhejo']) {
      expect(detectRightsRequest(text), text).toBeNull();
    }
  });

  it('is silent on an empty or whitespace message', () => {
    expect(detectRightsRequest('')).toBeNull();
    expect(detectRightsRequest('   ')).toBeNull();
  });

  it('does not collide with the consent keywords', () => {
    // STOP and START are handled before this and must stay unambiguous.
    for (const text of ['stop', 'start', 'band karo', 'chalu karo']) {
      expect(detectRightsRequest(text), text).toBeNull();
    }
  });
});
