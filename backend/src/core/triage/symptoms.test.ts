import { describe, it, expect } from 'vitest';

import { detectEmergency, suggestSpeciality } from './symptoms';

// The clinic this was built against, so the tests suggest only what it staffs.
const ANVAYA = [
  'General Physician',
  'Gynaecologist',
  'Paediatrician',
  'Dermatologist',
  'Orthopaedic',
  'Dentist',
  'ENT',
  'Cardiologist',
  'Psychiatrist'
];

const of = (text: string) => suggestSpeciality(text, ANVAYA)?.speciality ?? null;

describe('suggestSpeciality — what patients actually type', () => {
  it('reads the everyday complaints', () => {
    expect(of('bukhar hai')).toBe('General Physician');
    expect(of('fever and cold')).toBe('General Physician');
    expect(of('खांसी और बुखार')).toBe('General Physician');
    expect(of('body pain aur kamzori')).toBe('General Physician');
  });

  it('reads Hinglish body parts', () => {
    expect(of('daant me dard')).toBe('Dentist');
    expect(of('ghutne me dard')).toBe('Orthopaedic');
    expect(of('kaan me dard')).toBe('ENT');
    expect(of('gale me kharash')).toBe('ENT');
    expect(of('kamar dard')).toBe('Orthopaedic');
    expect(of('khujli ho rahi hai')).toBe('Dermatologist');
  });

  it('reads Devanagari', () => {
    expect(of('दांत में दर्द')).toBe('Dentist');
    expect(of('घुटने में दर्द')).toBe('Orthopaedic');
    expect(of('पेट में दर्द')).toBe('General Physician');
  });

  // The ordering rule, and the reason it exists: a fever in a child belongs to
  // the paediatrician, and "bukhar" would otherwise win on its own.
  it('sends a child to the paediatrician even when the symptom is general', () => {
    expect(of('bacche ko bukhar hai')).toBe('Paediatrician');
    expect(of('my baby has fever')).toBe('Paediatrician');
    expect(of('बच्चे को खांसी')).toBe('Paediatrician');
  });

  it('respects a speciality the patient named outright', () => {
    expect(of('I want to see a Dermatologist')).toBe('Dermatologist');
    expect(of('Cardiologist se milna hai')).toBe('Cardiologist');
  });

  it('routes women’s health', () => {
    expect(of('period problem')).toBe('Gynaecologist');
    expect(of('pregnancy checkup')).toBe('Gynaecologist');
  });

  it('routes mental health', () => {
    expect(of('neend nahi aa rahi, tension hai')).toBe('Psychiatrist');
    expect(of('depression')).toBe('Psychiatrist');
  });

  // Never invent a speciality the clinic does not have. A dentist-only clinic
  // asking a patient with a fever to see a dentist is worse than asking them to
  // choose for themselves.
  it('suggests nothing outside the clinic’s own list', () => {
    expect(suggestSpeciality('ghutne me dard', ['Dentist'])).toBeNull();
    expect(suggestSpeciality('bukhar', ['Dentist', 'ENT'])).toBeNull();
    expect(suggestSpeciality('daant me dard', ['Dentist'])?.speciality).toBe('Dentist');
  });

  it('says nothing rather than guessing', () => {
    expect(of('')).toBeNull();
    expect(of('hello')).toBeNull();
    expect(of('kuch samajh nahi aa raha')).toBeNull();
    expect(suggestSpeciality('bukhar', [])).toBeNull();
  });

  it('names the reason it chose, so a wrong guess is visible', () => {
    expect(suggestSpeciality('bacche ko bukhar', ANVAYA)?.matched).toBe('a child');
    expect(suggestSpeciality('daant me dard', ANVAYA)?.matched).toBe('teeth or gums');
  });
});

// The half that matters more. Each of these is a thing that kills people while
// they wait for Thursday, so none of them may become a booking.
describe('detectEmergency — descriptions that must not become an appointment', () => {
  it('catches the ones that cannot wait', () => {
    expect(detectEmergency('seene me dard ho raha hai')).not.toBeNull();
    expect(detectEmergency('chest pain since morning')).not.toBeNull();
    expect(detectEmergency('saans nahi aa rahi')).not.toBeNull();
    expect(detectEmergency('khoon beh raha hai')).not.toBeNull();
    expect(detectEmergency('papa behosh ho gaye')).not.toBeNull();
    expect(detectEmergency('accident ho gaya hai')).not.toBeNull();
    expect(detectEmergency('सीने में दर्द')).not.toBeNull();
    expect(detectEmergency('I want to kill myself')).not.toBeNull();
    expect(detectEmergency('mirgi ke jhatke aa rahe hain')).not.toBeNull();
  });

  // An emergency must beat a tidy speciality match. "seene me dard" reads as a
  // cardiologist, and a cardiologist has a slot next Tuesday.
  it('is checked before the speciality, not after', () => {
    expect(of('seene me dard')).toBe('Cardiologist');
    expect(detectEmergency('seene me dard')).not.toBeNull();
  });

  it('does not cry wolf over ordinary complaints', () => {
    expect(detectEmergency('bukhar hai')).toBeNull();
    expect(detectEmergency('daant me dard')).toBeNull();
    expect(detectEmergency('ghutne me dard')).toBeNull();
    expect(detectEmergency('routine checkup')).toBeNull();
    expect(detectEmergency('')).toBeNull();
  });
});
