import { describe, it, expect } from 'vitest';

// The recogniser that decides whether a WhatsApp message is an ABHA.
//
// Most of these tests are about NOT matching. This runs before the booking FSM
// on every inbound message, so a false positive steals a turn the booking
// needed and answers it with something about health ids — which is a worse
// failure than missing an ABHA, because booking is why people are here.
import { detectAbhaMessage } from './whatsapp.abha';

describe('detectAbhaMessage — leaves ordinary messages alone', () => {
  it('ignores the things people actually type', () => {
    for (const text of [
      'hi',
      'book appointment',
      '1',
      '2',
      'yes',
      'kal 11 baje',
      'Dr Rai se milna hai',
      'thank you'
    ]) {
      expect(detectAbhaMessage(text), text).toBeNull();
    }
  });

  it('ignores a phone number', () => {
    // Ten digits belong to the FSM. Claiming them here would break the flow
    // that asks a patient to confirm their number.
    expect(detectAbhaMessage('9812345678')).toBeNull();
    expect(detectAbhaMessage('+91 98123 45678')).toBeNull();
  });

  it('ignores an ordinary email address', () => {
    // Someone sharing an email is not sending an ABHA. Only the consent
    // manager's own suffixes count.
    expect(detectAbhaMessage('asha@gmail.com')).toBeNull();
    expect(detectAbhaMessage('me@clinic.in')).toBeNull();
  });

  it('ignores a long message that happens to contain digits', () => {
    expect(detectAbhaMessage('my number is 12345678901234 i think')).toBeNull();
  });
});

describe('detectAbhaMessage — recognises an ABHA', () => {
  it('reads an ABHA address', () => {
    expect(detectAbhaMessage('asha@abdm')).toEqual({ kind: 'address', value: 'asha@abdm' });
    expect(detectAbhaMessage('asha.verma@sbx')).toEqual({ kind: 'address', value: 'asha.verma@sbx' });
  });

  it('lower-cases and trims what was typed', () => {
    // ABDM compares the address as-is in discovery, so a capital letter here
    // would create a patient who silently never matches.
    expect(detectAbhaMessage('  Asha@ABDM  ')).toEqual({ kind: 'address', value: 'asha@abdm' });
  });

  it('reads a 14-digit ABHA number however it is spaced', () => {
    for (const typed of ['12345678901234', '12-3456-7890-1234', '12 3456 7890 1234']) {
      expect(detectAbhaMessage(typed), typed).toEqual({ kind: 'number', value: '12345678901234' });
    }
  });
});

describe('detectAbhaMessage — catches an Aadhaar so it can be refused', () => {
  it('recognises twelve digits as an Aadhaar, not an ABHA', () => {
    // Asked for "your ABHA", people send an Aadhaar — they are both government
    // numbers and most people do not distinguish them. It is spotted precisely
    // so it can be turned away: a WhatsApp thread is no place for one.
    expect(detectAbhaMessage('123456789012')).toEqual({ kind: 'aadhaar' });
    expect(detectAbhaMessage('1234 5678 9012')).toEqual({ kind: 'aadhaar' });
  });

  it('does not confuse the two lengths', () => {
    // 12 digits is refused, 14 is stored. Getting this backwards would store
    // an Aadhaar in the ABHA column — the exact thing this must never do.
    expect(detectAbhaMessage('123456789012')).toEqual({ kind: 'aadhaar' });
    expect(detectAbhaMessage('12345678901234')).toEqual({ kind: 'number', value: '12345678901234' });
  });
});
