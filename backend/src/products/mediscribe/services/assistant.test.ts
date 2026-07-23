import { describe, it, expect } from 'vitest';
import { parseQuestionLocally, extractPatientName } from './assistant.intent.js';
import { buildAnswer } from './assistant.answer.js';
import { matchPatients } from './assistant.js';
import type { ConsultationHistoryItem } from './patientHistory.js';
import type { ScribePatient } from '../clinicData.js';

const visit = (over: Partial<ConsultationHistoryItem> = {}): ConsultationHistoryItem => ({
  consultationId: 'c1',
  visitDateTime: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  doctorName: 'Dr. Rao',
  chiefComplaints: [],
  diagnosis: [],
  medicines: [],
  allergies: [],
  currentMedications: [],
  reportStatus: 'Completed',
  followUp: '',
  reportId: null,
  transcriptId: null,
  hasReport: true,
  transcriptText: '',
  ...over,
});

describe('question classification', () => {
  it.each([
    ['What did I prescribe last time?', 'last_prescription'],
    ['Priya ko pichhli baar kya diya tha?', 'last_prescription'],
    ['पिछली बार क्या दवा दी थी?', 'last_prescription'],
    ['When did she last visit?', 'last_visit'],
    ['Ramesh kab aaya tha?', 'last_visit'],
    ['What was the diagnosis?', 'last_diagnosis'],
    ['Does this patient have any allergies?', 'allergies'],
    ['इसको कोई एलर्जी है?', 'allergies'],
    // Real transcripts from the phone — Devanagari, as STT returns them. These
    // are the exact shapes that fell through to "I didn't catch that" because
    // `\b` doesn't work on Devanagari.
    ['ये पेशेंट कब आया था यहां पे?', 'last_visit'],
    ['इस मरीज़ को पिछली बार क्या दिया था?', 'last_prescription'],
    ['इसको क्या बीमारी थी?', 'last_diagnosis'],
    ['अभी ये कौनसी दवा ले रहा है?', 'current_medications'],
    ['इस पेशेंट की पूरी हिस्ट्री बताओ', 'patient_summary'],
    // STT mishears दवा (medicine) as दबा (press) — व/ब sound alike. This exact
    // transcript was returned as a summary because नो pattern caught "दबा".
    ['पिछली बार हमने इसे कौन सा दबा दिया था?', 'last_prescription'],
    ['इसको कौन सी दवाई दी थी?', 'last_prescription'],
    ['पिछली बार क्या दवा मिली थी?', 'last_prescription'],
    // "पिछली बार" alone must NOT hijack a prescription question into last_visit.
    ['पिछली बार कब आया था?', 'last_visit'],
    ['What is he currently taking?', 'current_medications'],
    ['abhi kya dawa le raha hai?', 'current_medications'],
    ['How many drafts do I have?', 'my_drafts'],
    ['kitne note adhoore hain?', 'my_drafts'],
    ['Tell me about this patient history', 'patient_summary'],
  ])('%s → %s', (question, expected) => {
    expect(parseQuestionLocally(question).intent).toBe(expected);
  });

  // These have no real data behind them. Answering would mean stating a
  // confident falsehood, so they must be declined, not near-matched.
  it.each([
    ['What is my average consultation duration?', 'consultation length'],
    ['How many patients are waiting?', 'arrived'],
    ['Who missed their follow-up?', 'missed follow-ups'],
    ['Show me my top ICD codes', "isn't recorded"],
  ])('declines: %s', (question, reasonFragment) => {
    const parsed = parseQuestionLocally(question);
    expect(parsed.intent).toBe('unsupported');
    expect(parsed.unsupportedReason).toContain(reasonFragment);
  });

  it('returns unknown rather than guessing', () => {
    expect(parseQuestionLocally('what is the weather today').intent).toBe('unknown');
    expect(parseQuestionLocally('').intent).toBe('unknown');
  });

  it('extracts a patient name only from an explicit cue', () => {
    expect(extractPatientName('Did Priya Patel have any allergies?')).toBe('Priya Patel');
    expect(extractPatientName('patient Ramesh ka last visit')).toBe('Ramesh');
    // Sentence-initial question words must not be mistaken for a name.
    expect(extractPatientName('What was the diagnosis?')).toBeUndefined();
    expect(extractPatientName('Show me the drafts')).toBeUndefined();
  });
});

describe('answers are built only from records', () => {
  it('reports the last prescription with its date', () => {
    const a = buildAnswer({
      intent: 'last_prescription',
      patientName: 'Priya',
      visits: [visit({ medicines: [{ medicine: 'Paracetamol', strength: '650mg', dose: '1 tab', frequency: 'TDS', duration: '3 days', instructions: '' }] })],
    });
    expect(a.text).toContain('Paracetamol');
    expect(a.text).toContain('650mg');
    expect(a.text).toContain('3 days ago');
  });

  it('looks past the latest visit to find the last one with a prescription', () => {
    const a = buildAnswer({
      intent: 'last_prescription',
      patientName: 'Priya',
      visits: [
        visit({ visitDateTime: new Date().toISOString() }), // today, no medicines
        visit({ medicines: [{ medicine: 'Amoxicillin', strength: '500mg', dose: '', frequency: 'BD', duration: '', instructions: '' }] }),
      ],
    });
    expect(a.text).toContain('Amoxicillin');
  });

  it('finds an allergy recorded at ANY past visit, not just the last', () => {
    const a = buildAnswer({
      intent: 'allergies',
      patientName: 'Priya',
      visits: [
        visit({ visitDateTime: new Date().toISOString() }),
        visit({ allergies: [{ allergy: 'Penicillin', reaction: 'rash', severity: 'moderate' }] }),
      ],
    });
    expect(a.text).toContain('Penicillin');
    expect(a.isAbsence).toBeFalsy();
  });

  it('has no previous visits to report', () => {
    const a = buildAnswer({ intent: 'last_visit', patientName: 'Priya', visits: [] });
    expect(a.text).toContain('No previous visits');
    expect(a.isAbsence).toBe(true);
  });

  it('counts unfinished notes', () => {
    expect(buildAnswer({ intent: 'my_drafts', patientName: '', visits: [], draftCount: 0 }).text)
      .toContain('No unfinished notes');
    expect(buildAnswer({ intent: 'my_drafts', patientName: '', visits: [], draftCount: 3 }).text)
      .toContain('3 unfinished notes');
  });
});

// The rest of the suite can be wrong and cost a doctor a re-ask. These can cost a
// patient. An empty allergy list means "nothing was written down", and the answer
// must never let that be heard as "this patient is safe to prescribe for".
describe('SAFETY: absence is never stated as a clinical fact', () => {
  it('never claims the patient has no allergies', () => {
    const a = buildAnswer({ intent: 'allergies', patientName: 'Priya', visits: [visit()] });

    expect(a.isAbsence).toBe(true);
    // Says what the RECORD lacks…
    expect(a.text).toMatch(/no allergies are recorded/i);
    // …explains that this is not a clinical clearance…
    expect(a.text).toMatch(/only means none were noted/i);
    // …and hands the judgement back to the doctor.
    expect(a.text).toMatch(/confirm with the patient/i);

    // Must never assert the patient IS free of allergies.
    expect(a.text).not.toMatch(/\b(has no allergies|no known allergies|is not allergic|allergy free)\b/i);
  });

  it('applies the same caution to ongoing medicines', () => {
    const a = buildAnswer({ intent: 'current_medications', patientName: 'Priya', visits: [visit()] });
    expect(a.isAbsence).toBe(true);
    expect(a.text).toMatch(/confirm with the patient/i);
    expect(a.text).not.toMatch(/\b(is not taking|takes nothing|no medications)\b/i);
  });

  it('carries the caution into the summary when nothing is recorded', () => {
    const a = buildAnswer({ intent: 'patient_summary', patientName: 'Priya', visits: [visit()] });
    expect(a.text).toMatch(/no allergies recorded/i);
    expect(a.text).toMatch(/confirm with the patient/i);
  });

  it('declines unanswerable questions instead of guessing', () => {
    const a = buildAnswer({
      intent: 'unsupported',
      patientName: '',
      visits: [],
      unsupportedReason: "consultation length isn't recorded yet",
    });
    expect(a.text).toMatch(/can't answer that/i);
    expect(a.text).toContain("consultation length isn't recorded yet");
  });

  // A summary must never drop an allergy just because a newer visit didn't
  // re-mention it. This was a real bug: it took only the newest visit that had
  // any allergy and printed that visit's list as if complete.
  it('SAFETY: summary unions allergies across all visits', () => {
    const a = buildAnswer({
      intent: 'patient_summary',
      patientName: 'Sunita',
      visits: [
        visit({ visitDateTime: new Date().toISOString(), allergies: [{ allergy: 'Dust', reaction: '', severity: '' }] }),
        visit({ allergies: [{ allergy: 'Penicillin', reaction: 'anaphylaxis', severity: 'severe' }] }),
      ],
    });
    expect(a.text).toContain('Penicillin'); // the old visit's allergy must survive
    expect(a.text).toContain('Dust');
  });

  it('skips visits whose medicine rows render blank', () => {
    const a = buildAnswer({
      intent: 'last_prescription',
      patientName: 'Priya',
      visits: [
        // A legacy row with only a non-rendered field — must not become "Last prescribed: ."
        visit({ visitDateTime: new Date().toISOString(), medicines: [{ medicine: '', strength: '', dose: '', frequency: '', duration: '', instructions: '' }] }),
        visit({ medicines: [{ medicine: 'Azithromycin', strength: '500mg', dose: '', frequency: 'OD', duration: '3 days', instructions: '' }] }),
      ],
    });
    expect(a.text).toContain('Azithromycin');
    expect(a.text).not.toMatch(/prescribed[^:]*:\s*\./); // no empty "…: ."
  });
});

describe('patient name matching is conservative', () => {
  const p = (id: string, name: string): ScribePatient => ({ id, name, age: 30, gender: 'F', phone: '' });

  it('does not let a shorter stored name swallow a longer spoken one', () => {
    // "Ramesh" spoken, only "Ram" on file → must NOT match Ram.
    const matches = matchPatients([p('1', 'Ram')], 'Ramesh');
    expect(matches).toHaveLength(0);
  });

  it('still matches a spoken first name to a fuller stored name', () => {
    const matches = matchPatients([p('1', 'Priya Sharma')], 'Priya');
    expect(matches.map((m) => m.id)).toEqual(['1']);
  });

  it('returns ALL patients sharing a spoken name so the caller disambiguates', () => {
    const matches = matchPatients([p('1', 'Priya Sharma'), p('2', 'Priya Patel')], 'Priya');
    expect(matches).toHaveLength(2);
  });

  it('a mid-name fragment does not match by word', () => {
    // "assum" is a fragment of "Tabassum", not a prefix and not a whole word →
    // no match. (A genuine spoken prefix like "Tab" legitimately WOULD match
    // Tabassum; the defence against a stray word "Tab" is at name extraction.)
    expect(matchPatients([p('1', 'Tabassum')], 'assum')).toHaveLength(0);
  });
});

describe('name extraction rejects ordinary words', () => {
  it('does not treat "Tab" in "Which Tab was prescribed" as a name', () => {
    expect(extractPatientName('Which Tab was prescribed')).toBeUndefined();
  });
  it('does not treat a trailing verb phrase as part of the name', () => {
    // "Ramesh was" → "Ramesh", never "Ramesh Was".
    expect(extractPatientName('Ramesh was here yesterday')).toBe('Ramesh');
  });
});
