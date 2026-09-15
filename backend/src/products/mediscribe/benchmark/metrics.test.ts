import { describe, it, expect } from 'vitest';

import {
  wer,
  words,
  termAccuracy,
  dosageAccuracy,
  negationHolds,
  negationAccuracy,
  score
} from './metrics';

// The measuring instruments, measured.
//
// Every judgement about the speech pipeline from here on runs through these
// functions. A metric that is quietly wrong does not produce a wrong number —
// it produces a confident wrong number, and months of work aimed at the wrong
// problem. So they are tested harder than the thing they measure.

describe('words', () => {
  it('drops punctuation and case but not meaning', () => {
    expect(words('Paracetamol, 650 mg.')).toEqual(['paracetamol', '650', 'mg']);
  });

  it('handles the Devanagari full stop', () => {
    expect(words('बुखार है।')).toEqual(['बुखार', 'है']);
  });

  it('never normalises numbers into words or back', () => {
    // "140" and "one forty" must stay different: to a chart they are.
    expect(words('140/90')).not.toEqual(words('one forty by ninety'));
  });
});

describe('wer', () => {
  it('is zero for an exact match', () => {
    expect(wer('bukhar do din se hai', 'bukhar do din se hai')).toBe(0);
  });

  it('counts one wrong word out of five as 0.2', () => {
    expect(wer('bukhar do din se hai', 'bukhar teen din se hai')).toBeCloseTo(0.2);
  });

  it('counts a dropped word', () => {
    expect(wer('bukhar do din se hai', 'bukhar do din hai')).toBeCloseTo(0.2);
  });

  it('is not capped at 1, so a hallucination looks as bad as it is', () => {
    // The measured Sarvam failure: given the wrong language it returned
    // "Doctor, sorry, sorry, sorry, sorry…". A metric that caps at 100% would
    // make that indistinguishable from an ordinary bad transcript.
    const ref = 'namaste doctor';
    const hallucination = 'doctor sorry sorry sorry sorry sorry sorry sorry sorry';
    expect(wer(ref, hallucination)).toBeGreaterThan(1);
  });

  it('is 1 when nothing was transcribed', () => {
    expect(wer('bukhar hai', '')).toBe(1);
  });

  it('is 0 when nothing was said and nothing was heard', () => {
    expect(wer('', '')).toBe(0);
  });
});

describe('termAccuracy — drug names', () => {
  it('accepts a correct name whatever its case', () => {
    expect(termAccuracy(['Paracetamol'], 'paracetamol 650 likh raha hoon')).toBe(1);
  });

  it('finds a name inside a compound', () => {
    expect(termAccuracy(['Amoxicillin'], 'Amoxicillin-Clavulanate 625')).toBe(1);
  });

  it('counts a missing name', () => {
    expect(termAccuracy(['Paracetamol', 'Pantoprazole'], 'Paracetamol 650')).toBe(0.5);
  });

  it('refuses a near-miss, which is the whole point', () => {
    // Metformin and Metronidazole are one fuzzy match apart and treat different
    // organs. A forgiving metric would report success on exactly the failure
    // this number exists to catch.
    expect(termAccuracy(['Metformin'], 'Metronidazole 400 twice daily')).toBe(0);
  });

  it('rejects the Devanagari spelling, because a chart cannot use it', () => {
    expect(termAccuracy(['Paracetamol'], 'पैरासिटामोल 650')).toBe(0);
  });

  it('is null rather than 1 when nothing was expected', () => {
    // Null means "not measured here". Returning 1 would let a corpus of cases
    // with no drugs in them inflate the headline drug accuracy.
    expect(termAccuracy([], 'anything at all')).toBeNull();
  });
});

describe('dosageAccuracy', () => {
  it('accepts an exact dose', () => {
    expect(dosageAccuracy(['5 mg'], 'Amlodipine 5 mg continue karna hai')).toBe(1);
  });

  it('ignores how the spacing fell', () => {
    expect(dosageAccuracy(['5 mg'], 'Amlodipine 5  mg')).toBe(1);
  });

  it('accepts a blood pressure written as a reading', () => {
    expect(dosageAccuracy(['140/90'], 'BP 140/90 aa raha hai')).toBe(1);
  });

  it('refuses the same reading spelled out', () => {
    // "one forty by ninety" is what was said; "140/90" is what the chart needs.
    // Until the pipeline converts it, this must score zero — otherwise the gap
    // is invisible.
    expect(dosageAccuracy(['140/90'], 'BP one forty by ninety aa raha hai')).toBe(0);
  });

  it('has no tolerance, because there is no nearly-right dose', () => {
    expect(dosageAccuracy(['500 mg'], 'Paracetamol 50 mg')).toBe(0);
    expect(dosageAccuracy(['5 mg'], 'Amlodipine 50 mg')).toBe(0);
  });

  it('matches whole words, so a bigger dose cannot contain a smaller one', () => {
    // A plain substring search finds "5 mg" inside "25 mg" and passes a fivefold
    // overdose — from the metric whose only job is to catch that.
    expect(dosageAccuracy(['5 mg'], 'Amlodipine 25 mg')).toBe(0);
    expect(dosageAccuracy(['5 mg'], 'Amlodipine 5 mg')).toBe(1);
  });
});

describe('negationHolds', () => {
  it('sees a negation that survived', () => {
    expect(negationHolds('Penicillin se allergy nahi hai', 'allergy', true)).toBe(true);
  });

  it('catches a negation that was dropped — the dangerous failure', () => {
    // One word out of five. To WER this is a rounding error; to a patient it is
    // the difference between a safe prescription and anaphylaxis.
    expect(negationHolds('Penicillin se allergy hai', 'allergy', true)).toBe(false);
  });

  it('catches a negation that was invented', () => {
    expect(negationHolds('Penicillin se allergy nahi hai', 'allergy', false)).toBe(false);
  });

  it('reads English negation too', () => {
    expect(negationHolds('patient denies any chest pain', 'chest pain', true)).toBe(true);
    expect(negationHolds('patient has chest pain', 'chest pain', false)).toBe(true);
  });

  it('reads Devanagari negation', () => {
    expect(negationHolds('पेनिसिलिन से एलर्जी नहीं है', 'एलर्जी', true)).toBe(true);
    expect(negationHolds('पेनिसिलिन से एलर्जी है', 'एलर्जी', true)).toBe(false);
  });

  it('is null when the term itself was lost', () => {
    // Unanswerable, not wrong. Counting it as a negation failure would report
    // one mistake as two and hide how many distinct things actually broke.
    expect(negationHolds('Penicillin se koi dikkat nahi', 'allergy', true)).toBeNull();
  });

  it('does not reach into the next clause, even an adjacent one', () => {
    // The failure a fixed window has: "nahi" belongs to the allergy, and four
    // words is enough to hang it on the sugar standing right beside it.
    const near = 'allergy nahi hai aur sugar hai';
    expect(negationHolds(near, 'allergy', true)).toBe(true);
    expect(negationHolds(near, 'sugar', false)).toBe(true);
  });

  it('does not reach across a distant clause either', () => {
    const far = 'allergy hai aur patient ko bukhar bhi hai lekin sugar nahi hai';
    expect(negationHolds(far, 'allergy', false)).toBe(true);
    expect(negationHolds(far, 'sugar', true)).toBe(true);
  });
});

describe('negationAccuracy', () => {
  it('scores each expectation', () => {
    const hyp = 'Penicillin se allergy nahi hai aur sugar hai';
    expect(
      negationAccuracy(
        [
          { term: 'allergy', negated: true },
          { term: 'sugar', negated: false }
        ],
        hyp
      )
    ).toBe(1);
  });

  it('scores zero when every term was lost', () => {
    // The flattering reading would be "nothing we could check was wrong".
    // A transcript that lost all the clinical terms has not earned 100%.
    expect(negationAccuracy([{ term: 'allergy', negated: true }], 'kuch samajh nahi aaya')).toBe(0);
  });

  it('is null when there was nothing to check', () => {
    expect(negationAccuracy([], 'anything')).toBeNull();
  });
});

describe('score', () => {
  it('reports every dimension of one transcript', () => {
    const s = score(
      {
        reference: 'Patient ko Amlodipine 5 mg continue karna hai, allergy nahi hai',
        drugs: ['Amlodipine'],
        dosages: ['5 mg'],
        negations: [{ term: 'allergy', negated: true }]
      },
      'Patient ko Amlodipine 5 mg continue karna hai, allergy nahi hai'
    );
    expect(s.wer).toBe(0);
    expect(s.drugAccuracy).toBe(1);
    expect(s.dosageAccuracy).toBe(1);
    expect(s.negationAccuracy).toBe(1);
  });

  it('shows a low WER hiding a clinical failure', () => {
    // The case this whole file exists for: one word out of twelve is 8% WER,
    // which reads as a good transcript. The negation score reads 0.
    const s = score(
      {
        reference: 'Patient ko Penicillin se allergy nahi hai isliye Amoxicillin de sakte hain',
        drugs: ['Penicillin', 'Amoxicillin'],
        negations: [{ term: 'allergy', negated: true }]
      },
      'Patient ko Penicillin se allergy hai isliye Amoxicillin de sakte hain'
    );
    expect(s.wer).toBeLessThan(0.1);
    expect(s.drugAccuracy).toBe(1);
    expect(s.negationAccuracy).toBe(0);
  });
});
