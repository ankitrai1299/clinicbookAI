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
const PATTERNS: { intent: AskIntent; any: RegExp[] }[] = [
  {
    intent: 'allergies',
    any: [/\ballerg/i, /एलर्जी/, /\bस्किन रिएक्शन/],
  },
  {
    intent: 'current_medications',
    any: [
      /\b(abhi|currently|already|pehle se)\b.{0,25}\b(le raha|le rahi|leti|leta|taking|medicine|dawa|dawai)/i,
      /\bcurrent (medication|medicine)/i,
      /\bchal rah[ie]\b.{0,15}\b(dawa|dawai|medicine)/i,
      /\b(पहले से|अभी).{0,20}(दवा|दवाई)/,
      /\bmedication history\b/i,
    ],
  },
  {
    intent: 'last_prescription',
    any: [
      /\b(kya|what).{0,25}\b(diya|likha|prescrib)/i,
      /\b(last|pichhli|pichli|previous).{0,20}\b(prescription|dawa|dawai|medicine)/i,
      /\bprescription\b/i,
      /\bparcha\b/i,
      /(पिछली|पिछले).{0,20}(दवा|दवाई|पर्चा)/,
      /\bक्या दिया\b/,
    ],
  },
  {
    intent: 'last_visit',
    any: [
      /\b(kab|when).{0,25}\b(aaya|aayi|aae|visit|came|aaya tha|aayi thi)/i,
      /\blast visit\b/i,
      /\b(pichhli|pichli) baar kab\b/i,
      /\bकब आय[ाी]\b/,
    ],
  },
  {
    intent: 'last_diagnosis',
    any: [
      /\bdiagnos/i,
      /\b(kya|what).{0,20}\b(hua tha|bimari|bimaari|problem thi)/i,
      /\bassessment\b/i,
      /\bनिदान\b/,
      /\bक्या बीमारी\b/,
    ],
  },
  {
    intent: 'my_drafts',
    any: [
      /\b(draft|drafts)\b/i,
      /\b(adhoor|adhur|incomplete|pending|baaki)\b.{0,20}\b(note|report|consultation)/i,
      /\b(note|report)s?\b.{0,20}\b(pending|incomplete|adhoor)/i,
      /\bअधूर[ेा]\b/,
    ],
  },
  {
    intent: 'patient_summary',
    any: [
      /\b(history|summary|itihaas)\b/i,
      /\b(batao|bataiye|tell me).{0,25}\b(about|ke baare|ki poori)/i,
      /\bपूरी (हिस्ट्री|जानकारी)\b/,
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
