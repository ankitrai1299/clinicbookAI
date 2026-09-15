// What the benchmark says out loud.
//
// ── How the audio is made, and what that costs ────────────────────────────
//
// Synthesised with Sarvam's text-to-speech, because there are no consented real
// consultation recordings yet and there will not be for months. That is a real
// limitation and it runs in ONE direction: TTS speech is cleaner, slower and
// better articulated than a patient talking across a desk fan in an OPD. So
// every absolute number here is OPTIMISTIC. Nobody should quote these as "our
// accuracy".
//
// What survives the limitation is comparison. OpenAI against Sarvam, the raw
// model against the full pipeline, today against next month — all of those are
// run on identical audio, so the differences between them are real even when the
// absolute figures are flattering. Comparison is what this is for.
//
// When consented recordings exist, the same cases get re-cut against them and
// the absolute numbers become worth quoting.
//
// ── About word error rate on code-mixed cases ─────────────────────────────
//
// A doctor says "Patient ko two days se fever hai". Every engine returns it in
// Devanagari — "पेशेंट को टू डेज से फीवर है" — which is a faithful record of
// what was said and perfectly readable to the doctor who said it. Measured
// against a Latin reference that scores as near-total failure.
//
// So WER on code-mixed cases measures SCRIPT, not correctness, and is reported
// under its own tag rather than folded into the headline. The numbers that
// matter for these cases are the drug, dosage and negation accuracies, and
// those are script-aware on purpose: a drug name must come back in Latin
// because that is what a chart and a pharmacist need.

import type { Expectations } from './metrics.js';

export interface Case extends Expectations {
  id: string;
  /** Spoken aloud by the TTS. */
  say: string;
  /** Sarvam TTS language for synthesis — the VOICE, not a hint to the ASR. */
  voice: string;
  tags: string[];
}

export const CORPUS: Case[] = [
  // ── Plain Hindi ─────────────────────────────────────────────────────────
  {
    id: 'hi-fever',
    say: 'नमस्ते डॉक्टर साहब, पिछले दस दिन से मुझे तेज़ बुखार आ रहा है और शरीर में बहुत दर्द रहता है',
    voice: 'hi-IN',
    tags: ['hindi'],
    reference: 'नमस्ते डॉक्टर साहब, पिछले दस दिन से मुझे तेज़ बुखार आ रहा है और शरीर में बहुत दर्द रहता है'
  },
  {
    id: 'hi-breathless',
    say: 'डॉक्टर साहब, सांस लेने में थोड़ी दिक्कत होती है, रात में ज़्यादा होती है',
    voice: 'hi-IN',
    tags: ['hindi'],
    reference: 'डॉक्टर साहब, सांस लेने में थोड़ी दिक्कत होती है, रात में ज़्यादा होती है'
  },
  {
    id: 'hi-stomach',
    say: 'दो दिन से पेट में तेज़ दर्द है और उल्टी भी हुई है',
    voice: 'hi-IN',
    tags: ['hindi'],
    reference: 'दो दिन से पेट में तेज़ दर्द है और उल्टी भी हुई है'
  },

  // ── Bhojpuri ────────────────────────────────────────────────────────────
  //
  // Not a language either provider lists. It is what a large share of patients
  // in this market actually speak, and the measured result was that the grammar
  // survives — होत बा, लागल बा — rather than being flattened into Hindi. These
  // cases exist so that stays true.
  {
    id: 'bho-stomach',
    say: 'हमरा पेटवा में दू दिन से बहुत दरद होता बा, आ बोखार भी लागल बा',
    voice: 'hi-IN',
    tags: ['bhojpuri'],
    reference: 'हमरा पेटवा में दू दिन से बहुत दर्द होत बा, आ बुखार भी लागल बा'
  },
  {
    id: 'bho-cough',
    say: 'खांसी दस दिन से होता बा आ रात में सांस फूलेला',
    voice: 'hi-IN',
    tags: ['bhojpuri'],
    reference: 'खांसी दस दिन से होत बा आ रात में सांस फूलेला'
  },

  // ── Bengali ─────────────────────────────────────────────────────────────
  {
    id: 'bn-stomach',
    say: 'আমার দুই দিন ধরে পেটে খুব ব্যথা হচ্ছে আর জ্বরও আসছে',
    voice: 'bn-IN',
    tags: ['bengali'],
    reference: 'আমার দুই দিন ধরে পেটে খুব ব্যথা হচ্ছে আর জ্বরও আসছে'
  },

  // ── Code-mixed, which is how a clinic actually talks ────────────────────
  //
  // WER here measures script, not correctness — see the note at the top. The
  // drug and dosage columns are the ones to read.
  {
    id: 'mix-fever-bp',
    say: 'Patient ko two days se fever hai, BP bhi high chal raha hai, Paracetamol 650 likh raha hoon',
    voice: 'hi-IN',
    tags: ['code-mix', 'drugs'],
    reference: 'Patient ko two days se fever hai, BP bhi high chal raha hai, Paracetamol 650 likh raha hoon',
    drugs: ['Paracetamol'],
    dosages: ['650']
  },
  {
    id: 'mix-diabetes',
    say: 'Patient ko sugar ka problem hai, Metformin 500 mg subah aur shaam chal raha hai',
    voice: 'hi-IN',
    tags: ['code-mix', 'drugs', 'dosage'],
    reference: 'Patient ko sugar ka problem hai, Metformin 500 mg subah aur shaam chal raha hai',
    drugs: ['Metformin'],
    dosages: ['500 mg']
  },
  {
    id: 'mix-amlodipine',
    say: 'Patient ko Amlodipine five mg continue karna hai aur Telmisartan forty mg raat ko',
    voice: 'hi-IN',
    tags: ['code-mix', 'drugs', 'dosage', 'spoken-numbers'],
    reference: 'Patient ko Amlodipine 5 mg continue karna hai aur Telmisartan 40 mg raat ko',
    drugs: ['Amlodipine', 'Telmisartan'],
    dosages: ['5 mg', '40 mg']
  },
  {
    id: 'mix-antibiotic',
    say: 'Azithromycin 500 teen din aur Pantoprazole subah khali pet',
    voice: 'hi-IN',
    tags: ['code-mix', 'drugs'],
    reference: 'Azithromycin 500 teen din aur Pantoprazole subah khali pet',
    drugs: ['Azithromycin', 'Pantoprazole'],
    dosages: ['500']
  },
  {
    id: 'mix-tests',
    say: 'CBC aur LFT kara lijiye, X-ray bhi karwa lena chest ka',
    voice: 'hi-IN',
    tags: ['code-mix', 'drugs'],
    reference: 'CBC aur LFT kara lijiye, X-ray bhi karwa lena chest ka',
    drugs: ['CBC', 'LFT', 'X-ray']
  },
  {
    id: 'mix-slurred-drug',
    say: 'Patient metfor... metformin wala tablet subah lete hain',
    voice: 'hi-IN',
    tags: ['code-mix', 'drugs', 'disfluency'],
    reference: 'Patient metformin wala tablet subah lete hain',
    drugs: ['Metformin']
  },

  // ── Numbers said as words, which is how they are said ───────────────────
  //
  // "one forty by ninety" is what comes out of a doctor's mouth; "140/90" is
  // what a chart needs. Nothing converts these yet, so these cases are expected
  // to fail today — that is the point of putting them in. A benchmark only
  // showing what already works measures nothing.
  {
    id: 'num-bp',
    say: 'BP kal se one forty by ninety aa raha hai',
    voice: 'hi-IN',
    tags: ['spoken-numbers', 'dosage'],
    reference: 'BP kal se 140/90 aa raha hai',
    dosages: ['140/90']
  },
  {
    id: 'num-sugar',
    say: 'Fasting sugar one hundred forty aur post prandial two hundred ten',
    voice: 'hi-IN',
    tags: ['spoken-numbers', 'dosage'],
    reference: 'Fasting sugar 140 aur post prandial 210',
    dosages: ['140', '210']
  },

  // ── Negation: the clinical-safety cases ─────────────────────────────────
  //
  // Each is paired with its opposite. A pipeline that simply never writes "nahi"
  // would pass half of these and fail the other half, which is exactly what the
  // pairing is for — a one-sided test can be gamed by a broken system.
  {
    id: 'neg-allergy-yes',
    say: 'Patient ko Penicillin se allergy hai, isliye Amoxicillin mat dena',
    voice: 'hi-IN',
    tags: ['negation', 'drugs'],
    reference: 'Patient ko Penicillin se allergy hai, isliye Amoxicillin mat dena',
    drugs: ['Penicillin', 'Amoxicillin'],
    negations: [{ term: 'allergy', negated: false }]
  },
  {
    id: 'neg-allergy-no',
    say: 'Patient ko Penicillin se allergy nahi hai, Amoxicillin de sakte hain',
    voice: 'hi-IN',
    tags: ['negation', 'drugs'],
    reference: 'Patient ko Penicillin se allergy nahi hai, Amoxicillin de sakte hain',
    drugs: ['Penicillin', 'Amoxicillin'],
    negations: [{ term: 'allergy', negated: true }]
  },
  {
    id: 'neg-fever-hi',
    say: 'खांसी है लेकिन बुखार नहीं है',
    voice: 'hi-IN',
    tags: ['negation', 'hindi'],
    reference: 'खांसी है लेकिन बुखार नहीं है',
    negations: [
      { term: 'बुखार', negated: true },
      { term: 'खांसी', negated: false }
    ]
  },
  {
    id: 'neg-chestpain',
    say: 'Chest pain nahi hai, sirf saans phoolti hai chalne par',
    voice: 'hi-IN',
    tags: ['negation'],
    reference: 'Chest pain nahi hai, sirf saans phoolti hai chalne par',
    negations: [{ term: 'chest pain', negated: true }]
  },
  {
    id: 'neg-smoking',
    say: 'Patient smoking nahi karta lekin alcohol lete hain kabhi kabhi',
    voice: 'hi-IN',
    tags: ['negation'],
    reference: 'Patient smoking nahi karta lekin alcohol lete hain kabhi kabhi',
    negations: [
      { term: 'smoking', negated: true },
      { term: 'alcohol', negated: false }
    ]
  },

  // ── Two speakers in one recording ───────────────────────────────────────
  //
  // Nothing separates them today. These cases exist so that when diarization is
  // added there is a before to compare against, and so the transcript quality of
  // a real back-and-forth — with its interruptions and short turns — is measured
  // rather than assumed from single-speaker cases.
  {
    id: 'turns-cough',
    say: 'आपको दिक्कत कब से है? डॉक्टर साहब, मुझे दस दिन से खांसी है। बुखार भी है? हाँ, कल से बुखार है।',
    voice: 'hi-IN',
    tags: ['two-speaker', 'hindi'],
    reference:
      'आपको दिक्कत कब से है? डॉक्टर साहब, मुझे दस दिन से खांसी है। बुखार भी है? हाँ, कल से बुखार है।'
  },
  {
    id: 'turns-diabetes',
    say: 'Sugar kab se hai aapko? Do saal se hai doctor sahab. Metformin le rahe hain? Haan, subah shaam.',
    voice: 'hi-IN',
    tags: ['two-speaker', 'code-mix', 'drugs'],
    reference:
      'Sugar kab se hai aapko? Do saal se hai doctor sahab. Metformin le rahe hain? Haan, subah shaam.',
    drugs: ['Metformin']
  }
];

/** Every tag in the corpus, for per-tag reporting. */
export const TAGS = [...new Set(CORPUS.flatMap((c) => c.tags))].sort();
