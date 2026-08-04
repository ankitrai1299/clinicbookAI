import { describe, it, expect } from 'vitest';

// The deterministic classifier the booking FSM runs for EVERY patient (no AI, no
// rollout gate). Import without a .js extension so Vite resolves the .ts source.
import { classifyIntent } from './whatsapp.intent';

const SPECIALITIES = ['Cardiologist', 'Dermatologist', 'Pediatrician', 'Orthopedic'];
const intentOf = (msg: string) => classifyIntent(msg, SPECIALITIES).intent;

describe('classifyIntent — prescription requests', () => {
  it('recognises English asks', () => {
    expect(intentOf('send my prescription')).toBe('prescription');
    expect(intentOf('what did the doctor prescribe')).toBe('prescription');
    expect(intentOf('my medicines please')).toBe('prescription');
  });

  it('recognises Hinglish asks', () => {
    expect(intentOf('meri dawai batao')).toBe('prescription');
    expect(intentOf('mera prescription bhejo')).toBe('prescription');
    expect(intentOf('meri parchi chahiye')).toBe('prescription');
    expect(intentOf('nuskha bhej do')).toBe('prescription');
    expect(intentOf('goli konsi leni hai')).toBe('prescription');
  });

  it('does NOT start a booking when the ask happens to name the doctor', () => {
    // The booking rule matches the bare word "doctor". Ordered after it, a
    // patient asking what they were prescribed was pushed into a booking flow —
    // the exact misfire this ordering exists to prevent.
    expect(intentOf('doctor ne kya likha hai')).toBe('prescription');
    expect(intentOf('doctor ne kya diya tha')).toBe('prescription');
  });
});

describe('classifyIntent — the booking flow is unchanged', () => {
  it('still books', () => {
    expect(intentOf('book an appointment')).toBe('book');
    expect(intentOf('I want to see a doctor')).toBe('book');
    expect(intentOf('need a cardiologist')).toBe('book');
  });

  it('still cancels', () => {
    expect(intentOf('cancel my appointment')).toBe('cancel');
  });

  it('still greets', () => {
    expect(intentOf('hi')).toBe('menu');
  });

  it('leaves unrelated text unknown', () => {
    expect(intentOf('where are you located')).toBe('unknown');
  });

  it('cancelling a medicine order is still a cancel, not a prescription ask', () => {
    // 'cancel' is matched first on purpose — an abort must always win.
    expect(intentOf('cancel the medicine reminder')).toBe('cancel');
  });

  it('routes a reschedule request to reschedule, not to a NEW booking', () => {
    // The old pattern ended the alternation with \b, so "reschedul" could never
    // match (the next letter is "e") and every one of these fell through to the
    // booking rule on the word "appointment" — a patient trying to move their
    // visit was quietly given a second one.
    expect(intentOf('reschedule my appointment')).toBe('reschedule');
    expect(intentOf('reschedule')).toBe('reschedule');
    expect(intentOf('rescheduling my visit')).toBe('reschedule');
    expect(intentOf('postponing my appointment')).toBe('reschedule');
    expect(intentOf('change my appointment')).toBe('reschedule');
    expect(intentOf('move my appointment')).toBe('reschedule');
    expect(intentOf('change appointment timing')).toBe('reschedule');
    expect(intentOf('appointment reschedule karna hai')).toBe('reschedule');
  });

  it('does not mistake an unrelated "change" for a reschedule', () => {
    // "change my medicine" is a prescription question, not a slot move.
    expect(intentOf('I want to change my medicine')).toBe('prescription');
  });

  it('still extracts the speciality alongside a booking', () => {
    expect(classifyIntent('need a skin doctor', SPECIALITIES)).toEqual({
      intent: 'book',
      speciality: 'Dermatologist'
    });
  });
});
