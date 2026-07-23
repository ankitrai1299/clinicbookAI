// Work out what the doctor just asked.
//
// DESIGN RULE, and the reason this file is separate from the answering code:
// the model is allowed to CLASSIFY the question and nothing else. It never writes
// a word of the answer. Answers are templated from records we actually hold, so a
// hallucinated drug name or an invented allergy is not merely unlikely — there is
// no code path that could produce one.
//
// Matching runs keywords first. Most questions in a clinic are asked the same few
// ways, and a local match costs nothing and returns instantly, which matters when
// the doctor is standing there waiting. The model is only consulted when the
// keywords find nothing.

/** Everything the assistant can answer, plus the two ways it can decline. */
export type AskIntent =
  | 'last_prescription'
  | 'last_visit'
  | 'last_diagnosis'
  | 'allergies'
  | 'current_medications'
  | 'patient_summary'
  | 'my_drafts'
  // Understood, but we hold no data for it — say so plainly instead of guessing.
  | 'unsupported'
  | 'unknown';

export interface ParsedQuestion {
  intent: AskIntent;
  /** A patient name mentioned in the question, if any. */
  patientName?: string;
  /** Why an `unsupported` question can't be answered — shown to the doctor. */
  unsupportedReason?: string;
}

// Hindi, English and the Hinglish mix people actually speak. Devanagari included
// because the transcript comes back in the script the question was asked in.
// IMPORTANT about Devanagari and `\b`.
// JavaScript's `\b` word boundary is defined over [A-Za-z0-9_] only. Devanagari
// characters are not "word" characters to it, so a pattern like /\bकब आया\b/
// NEVER matches — which is exactly why "ये पेशेंट कब आया था" fell through to
// "I didn't catch that". Hindi patterns below therefore use plain substring
// matching (no `\b`); only the romanised/English ones use `\b`.
const PATTERNS: { intent: AskIntent; any: RegExp[] }[] = [
  {
    intent: 'allergies',
    any: [/\ballerg/i, /एलर्जी/, /एलर्जि/, /रिएक्शन/],
  },
  {
    intent: 'current_medications',
    any: [
      /\b(abhi|currently|already|pehle se)\b.{0,25}(le raha|le rahi|leti|leta|taking|medicine|dawa|dawai)/i,
      /\bcurrent (medication|medicine)/i,
      /\bchal rah[ie]\b.{0,15}(dawa|dawai|medicine)/i,
      /(पहले से|अभी|इस समय).{0,25}(दवा|दवाई|दबा|दबाई|ले रह|खा रह)/,
      /(दवा|दवाई|दबा|दबाई).{0,15}(ले रह|खा रह|चल रह)/,
      /\bmedication history\b/i,
    ],
  },
  {
    intent: 'last_prescription',
    any: [
      /\b(kya|what).{0,25}(diya|likha|prescrib)/i,
      /\b(last|pichhli|pichli|previous).{0,20}(prescription|dawa|dawai|medicine)/i,
      /\bprescription\b/i,
      /\bparcha\b/i,
      /पर्चा|पर्ची/,
      // दवा / दवाई, plus the दबा / दबाई the STT often mishears them as (व and ब
      // sound alike). "कौन सा दबा दिया था" IS "कौन सी दवा दी थी".
      /(दवा|दवाई|दबा|दबाई)/,
      // "पिछली बार … दिया/दी/मिला" — the classic "what did we give last time",
      // even when the word दवा was dropped or misheard entirely.
      /पिछली बार.{0,40}(दिया|दी|मिला|मिली)/,
      /कौन ?स[ाी].{0,25}(दिया|दी|मिला|मिली|दवा|दवाई|दबा|दबाई)/,
      /क्या (दिया|दी|लिखा|लिख)/,
    ],
  },
  {
    intent: 'last_visit',
    any: [
      /\b(kab|when).{0,25}(aaya|aayi|aae|visit|came|aaya tha|aayi thi)/i,
      /\blast visit\b/i,
      /\b(pichhli|pichli) baar kab\b/i,
      // "कब आया/आयी/आये" — the visit question. Kept tight (must contain कब or
      // an explicit "visit") so a prescription question that merely opens with
      // "पिछली बार" is NOT swallowed here — that one is caught above.
      /कब.{0,20}(आया|आयी|आई|आये|aya|aaya)/,
      /कब.{0,15}(विजिट|visit|मिल|दिखा)/,
      /पिछली.{0,10}(विजिट|visit)/,
      /पिछली बार कब/,
    ],
  },
  {
    intent: 'last_diagnosis',
    any: [
      /\bdiagnos/i,
      /\b(kya|what).{0,20}(hua tha|bimari|bimaari|problem thi)/i,
      /\bassessment\b/i,
      /निदान/,
      /क्या (बीमारी|बिमारी|रोग|प्रॉब्लम|problem|हुआ था)/i,
      /बीमारी क्या/,
    ],
  },
  {
    intent: 'my_drafts',
    any: [
      /\b(draft|drafts)\b/i,
      /\b(adhoor|adhur|incomplete|pending|baaki)\b.{0,20}(note|report|consultation)/i,
      /\b(note|report)s?\b.{0,20}(pending|incomplete|adhoor)/i,
      /अधूर[ेाी]/,
      /(कितने|कितनी).{0,15}(अधूर|पेंडिंग|बाकी|draft)/i,
    ],
  },
  {
    intent: 'patient_summary',
    any: [
      /\b(history|summary|itihaas)\b/i,
      /\b(batao|bataiye|tell me).{0,25}(about|ke baare|ki poori)/i,
      /पूरी (हिस्ट्री|जानकारी|डिटेल|history)/i,
      /(हिस्ट्री|इतिहास|समरी|जानकारी)/,
      /इस (पेशेंट|मरीज़|मरीज).{0,15}(बारे|बारें|के बारे)/,
    ],
  },
];

// Questions we understand but hold no real data for. Being explicit here is the
// whole point: each of these maps to a field that is permanently empty or faked
// (consultation duration is never written, arrival is never recorded, ICD codes
// are never populated). An assistant answering from them would state a confident
// falsehood, which is worse than declining.
const UNSUPPORTED: { any: RegExp[]; reason: string }[] = [
  {
    any: [/\b(average|avg|kitni der|kitna time|duration)\b.{0,25}\b(consult|visit|session)/i,
          /\bconsultation (duration|length|time)\b/i],
    reason: "consultation length isn't recorded yet",
  },
  {
    any: [/\b(wait|waiting|queue|intezaar|intzaar)\b/i, /\bkitne (log )?(baithe|wait)/i],
    reason: "the app doesn't track who has arrived at the clinic yet",
  },
  {
    any: [/\b(missed|nahi aaya|nahi aaye|didn'?t come|skip)\b.{0,25}\bfollow.?up/i,
          /\bfollow.?up\b.{0,25}\b(missed|nahi aaya|nahi aaye)/i],
    reason: "missed follow-ups aren't tracked yet",
  },
  {
    any: [/\bicd\b/i, /\bloinc\b/i, /\bbilling\b/i, /\brevenue\b/i, /\bkamai\b/i],
    reason: "that isn't recorded in the app",
  },
];

const looksLike = (text: string, patterns: RegExp[]): boolean => patterns.some((re) => re.test(text));

/**
 * Pull a patient's name out of the question.
 *
 * Deliberately conservative — a wrong name is worse than no name, because the
 * caller falls back to "which patient?" rather than confidently answering about
 * somebody else. Only capitalised words following an explicit cue are taken.
 */
export function extractPatientName(question: string): string | undefined {
  const cues = [
    /\b(?:patient|mareez|marij)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:ko|ka|ki|ke|was|has|had|have)\b/,
    /\bfor\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
  ];
  for (const re of cues) {
    const m = question.match(re);
    if (m?.[1]) {
      const name = m[1].trim();
      // Filter out capitalised words that are ordinary English, not names — the
      // cue "X ka/was/had" happily matches "Tab was prescribed" → "Tab", which
      // then prefix-matches a real patient like "Tabassum".
      const STOP = /^(What|When|Which|Who|How|Did|Does|Is|Are|Was|Were|Has|Have|Had|The|This|That|My|Show|Tell|Tab|Give|Last|Any|No|Yes|And|For|About)$/i;
      const words = name.split(/\s+/);
      if (!words.some((w) => STOP.test(w))) {
        return name;
      }
    }
  }
  return undefined;
}

/**
 * Classify without calling the model. Returns `unknown` when nothing matches, so
 * the caller can decide whether the round trip is worth it.
 */
export function parseQuestionLocally(question: string): ParsedQuestion {
  const q = (question || '').trim();
  if (!q) return { intent: 'unknown' };

  // Unsupported is checked FIRST. "How long did the consultation take" contains
  // "consultation", and we would rather decline honestly than match a
  // near-miss intent and answer a question that wasn't asked.
  for (const u of UNSUPPORTED) {
    if (looksLike(q, u.any)) return { intent: 'unsupported', unsupportedReason: u.reason };
  }

  for (const p of PATTERNS) {
    if (looksLike(q, p.any)) {
      return { intent: p.intent, patientName: extractPatientName(q) };
    }
  }
  return { intent: 'unknown', patientName: extractPatientName(q) };
}

/** The intent names the model is allowed to return — nothing else is accepted. */
export const MODEL_INTENTS: AskIntent[] = [
  'last_prescription',
  'last_visit',
  'last_diagnosis',
  'allergies',
  'current_medications',
  'patient_summary',
  'my_drafts',
  'unknown',
];

export const CLASSIFIER_PROMPT = `You label a doctor's spoken question with ONE intent.
Reply with ONLY the label, nothing else. Valid labels:

last_prescription  - what medicines were given to a patient last time
last_visit         - when a patient last came
last_diagnosis     - what the diagnosis/assessment was
allergies          - whether a patient has recorded allergies
current_medications- what a patient is already taking
patient_summary    - a general summary of a patient's history
my_drafts          - the doctor's unfinished/draft notes
unknown            - anything else

The question may be in Hindi, English or a mix. Output the label only.`;
