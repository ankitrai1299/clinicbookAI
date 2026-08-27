import { describe, it, expect } from 'vitest';

// Patient matching is the point in this integration where a mistake hands one
// person another person's medical history. These tests exist to hold the rules
// that stop that, and every one of them is about REFUSING rather than matching.
import { matchPatient, last10, type CandidatePatient } from './abdmDiscovery';

const patient = (over: Partial<CandidatePatient> = {}): CandidatePatient => ({
  id: 'p1',
  name: 'Asha Verma',
  phone: '+919812345678',
  gender: 'F',
  abhaNumber: null,
  abhaAddress: null,
  ...over
});

describe('last10', () => {
  it('treats the same number written four ways as one number', () => {
    // The clinic types one form, ABDM sends another, and they are the same
    // person. Comparing the whole string would make them different.
    for (const form of ['+919812345678', '919812345678', '09812345678', '9812345678']) {
      expect(last10(form)).toBe('9812345678');
    }
  });

  it('refuses anything too short to be a number', () => {
    expect(last10('12345')).toBeNull();
    expect(last10(null)).toBeNull();
    expect(last10('')).toBeNull();
  });
});

describe('matchPatient — what it refuses', () => {
  it('does NOT match on name, gender and year of birth alone', () => {
    // The central rule. Plenty of people share all three, and ABDM has not
    // confirmed any of them belongs to whoever is asking.
    const out = matchPatient(
      { id: 'someone@sbx', name: 'Asha Verma', gender: 'F', yearOfBirth: 1990 },
      [patient()]
    );
    expect(out.status).toBe('none');
  });

  it('does NOT match on an UNVERIFIED mobile number', () => {
    // Unverified means the Consent Manager has not confirmed the patient
    // controls it — anyone could have typed it in.
    const out = matchPatient(
      {
        id: 'someone@sbx',
        name: 'Asha Verma',
        unverifiedIdentifiers: [{ type: 'MOBILE', value: '+919812345678' }]
      },
      [patient()]
    );
    expect(out.status).toBe('none');
  });

  it('reports AMBIGUOUS rather than picking one of two on a shared phone', () => {
    // A family sharing one number is ordinary and innocent. There is no safe
    // way to choose, so the gateway is told to ask the patient instead.
    const out = matchPatient(
      { id: 'x@sbx', verifiedIdentifiers: [{ type: 'MOBILE', value: '9812345678' }] },
      [patient({ id: 'p1', name: 'Asha Verma' }), patient({ id: 'p2', name: 'Ravi Verma' })]
    );
    expect(out.status).toBe('ambiguous');
  });

  it('says none, not ambiguous, when nobody matches at all', () => {
    const out = matchPatient(
      { id: 'x@sbx', verifiedIdentifiers: [{ type: 'MOBILE', value: '9000000000' }] },
      [patient()]
    );
    expect(out.status).toBe('none');
  });
});

describe('matchPatient — what it accepts', () => {
  it('matches on a verified mobile, however the number is written', () => {
    const out = matchPatient(
      { id: 'asha@sbx', verifiedIdentifiers: [{ type: 'MOBILE', value: '09812345678' }] },
      [patient()]
    );
    expect(out.status).toBe('matched');
    if (out.status === 'matched') {
      expect(out.patient.id).toBe('p1');
      expect(out.matchedBy).toContain('MOBILE');
    }
  });

  it('matches on a stored ABHA address', () => {
    const out = matchPatient({ id: 'asha@sbx' }, [patient({ abhaAddress: 'asha@sbx' })]);
    expect(out.status).toBe('matched');
    if (out.status === 'matched') expect(out.matchedBy).toContain('HEALTH_ID');
  });

  it('matches an ABHA number written with and without dashes', () => {
    const out = matchPatient({ id: '12-3456-7890-1234' }, [
      patient({ abhaNumber: '123456789012 34'.replace(' ', '') })
    ]);
    expect(out.status).toBe('matched');
    if (out.status === 'matched') expect(out.matchedBy).toContain('ABHA_NUMBER');
  });

  it('uses the name to separate two people on one phone', () => {
    // The name NARROWS what the verified number already found. It never
    // creates a match by itself — the test above pins that down.
    const out = matchPatient(
      {
        id: 'x@sbx',
        name: 'Ravi Verma',
        verifiedIdentifiers: [{ type: 'MOBILE', value: '9812345678' }]
      },
      [patient({ id: 'p1', name: 'Asha Verma' }), patient({ id: 'p2', name: 'Ravi Verma' })]
    );
    expect(out.status).toBe('matched');
    if (out.status === 'matched') expect(out.patient.id).toBe('p2');
  });

  it('stays ambiguous when the name does not settle it', () => {
    // A misspelt or missing name must not be allowed to empty the pool and
    // turn an ambiguous case into a confident wrong answer.
    const out = matchPatient(
      {
        id: 'x@sbx',
        name: 'Someone Else',
        verifiedIdentifiers: [{ type: 'MOBILE', value: '9812345678' }]
      },
      [patient({ id: 'p1', name: 'Asha Verma' }), patient({ id: 'p2', name: 'Ravi Verma' })]
    );
    expect(out.status).toBe('ambiguous');
  });
});
