import { describe, it, expect } from 'vitest';

import { devanagariToLatin, restoreLatinTerms } from './devanagariTerms';

// Putting drug names back into the alphabet a chart is written in.
//
// The measured case, from a live transcription of code-mixed clinic speech:
//
//   spoken   "BP bhi high hai, Paracetamol 650 likh raha hoon"
//   returned "बीपी भी हाई है, पैरासिटामोल 650 लिख रहा हूं"
//
// Faithful, and useless as a prescription: a pharmacist reads Paracetamol.
//
// The tests that matter most here are the ones asserting that nothing ELSE
// changes. A Devanagari drug name is a nuisance; a wrong drug name is a clinical
// error, and mangled Bhojpuri is a broken promise.

describe('devanagariToLatin', () => {
  it('sounds out a drug name', () => {
    expect(devanagariToLatin('पैरासिटामोल')).toBe('pairasitamola');
  });

  it('gives every consonant its inherent vowel unless silenced', () => {
    // Without the virama rule क्रम and करम become one string, and the skeleton
    // matching downstream would then be comparing the wrong thing.
    expect(devanagariToLatin('करम')).toBe('karama');
    expect(devanagariToLatin('क्रम')).toBe('krama');
  });

  it('reads the nukta forms that carry English sounds', () => {
    // ज़ and फ़ exist in Indian transcription precisely for z and f, which is
    // where drug names live.
    expect(devanagariToLatin('ज़िंक')).toBe('zinka');
    expect(devanagariToLatin('फ़ोलिक')).toBe('folika');
  });
});

describe('restoreLatinTerms — what it fixes', () => {
  it('restores a drug name to the spelling a pharmacist reads', () => {
    expect(restoreLatinTerms('पैरासिटामोल 650 लिख रहा हूं')).toBe('Paracetamol 650 लिख रहा हूं');
  });

  it('restores drug names that survived two scripts and a fuzzy ear', () => {
    expect(restoreLatinTerms('एजिथ्रोमाइसिन 500')).toBe('Azithromycin 500');
    expect(restoreLatinTerms('पैंटोप्राजोल सुबह')).toBe('Pantoprazole सुबह');
  });

  it('restores the abbreviations that are always said in English', () => {
    expect(restoreLatinTerms('बीपी भी हाई है')).toBe('BP भी हाई है');
    expect(restoreLatinTerms('सीबीसी और एलएफटी करा लीजिए')).toBe('CBC और LFT करा लीजिए');
    expect(restoreLatinTerms('एक्सरे भी')).toBe('X-ray भी');
  });

  it('leaves the rest of the sentence exactly as spoken', () => {
    const out = restoreLatinTerms('पेशेंट को दो दिन से फीवर है, पैरासिटामोल 650');
    // Only the drug moved. फीवर and पेशेंट are what the doctor said and a Hindi
    // reader reads them without trouble; "improving" them is how real words get
    // damaged.
    expect(out).toBe('पेशेंट को दो दिन से फीवर है, Paracetamol 650');
  });
});

describe('restoreLatinTerms — what it must not touch', () => {
  it('leaves Bhojpuri completely alone', () => {
    // The whole point of the live transcript is that it keeps the language the
    // patient actually used. A glossary pass that edits their words breaks the
    // one promise this feature makes.
    const line = 'हमरा पेटवा में दू दिन से बहुत दर्द होत बा आ बुखार भी लागल बा';
    expect(restoreLatinTerms(line)).toBe(line);
  });

  it('leaves ordinary Hindi alone', () => {
    const line = 'दो दिन से पेट में तेज़ दर्द है और बुखार भी आ रहा है';
    expect(restoreLatinTerms(line)).toBe(line);
  });

  it('leaves Bengali alone', () => {
    // Not Devanagari at all — it must not even be considered.
    const line = 'আমার দুই দিন ধরে পেটে খুব ব্যথা হচ্ছে';
    expect(restoreLatinTerms(line)).toBe(line);
  });

  it('leaves short words alone', () => {
    // Two or three letters carry too little signal, and Hindi's commonest words
    // are exactly that length.
    for (const w of ['है', 'और', 'को', 'दिन', 'बात']) {
      expect(restoreLatinTerms(w), w).toBe(w);
    }
  });

  it('leaves text with no Devanagari untouched', () => {
    const line = 'Paracetamol 650 mg twice daily after food';
    expect(restoreLatinTerms(line)).toBe(line);
  });

  it('handles empty and whitespace input', () => {
    expect(restoreLatinTerms('')).toBe('');
    expect(restoreLatinTerms('   ')).toBe('   ');
  });
});
