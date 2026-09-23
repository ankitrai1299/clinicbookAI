// What a patient wrote → which doctor they probably need.
//
// Patients do not write "Paediatrician". They write "bacche ko bukhar hai",
// "ghutne me dard", "daant me dard". The booking flow already matched the
// SPECIALITY NAME and four shorthands (heart/skin/child/bone), so every one of
// those fell through and the patient was asked to pick from a list they had
// just described in their own words.
//
// Three rules this file is built on:
//
//   1. It never diagnoses. It picks a speciality and says which word made it
//      pick. Being wrong out loud is recoverable; being wrong silently is not.
//   2. It is a dictionary, not a model. Instant, free, and readable by whoever
//      has to fix it when a clinic says "our patients say X". AI, if it is ever
//      added, belongs AFTER this returns nothing.
//   3. Some sentences must not become an appointment at all. Chest pain and
//      "saans nahi aa rahi" are not a slot on Thursday. Those are checked
//      first, and they stop the booking flow rather than steering it.
//
// Hindi is written both ways — Latin as patients type it on a phone keyboard,
// and Devanagari for those who switch keyboards.

/** A sentence that must not be answered with an appointment. */
export interface EmergencySignal {
  /** The phrase that triggered it — shown to nobody, logged for tuning. */
  matched: string;
}

/** The speciality a description points at, and why. */
export interface SpecialitySuggestion {
  /** The clinic's OWN speciality string, exactly as stored on its doctors. */
  speciality: string;
  /** The words that decided it, so the patient can see we read them. */
  matched: string;
}

// ── Emergencies ───────────────────────────────────────────────────────────
//
// Deliberately narrow. Every entry here is a thing that kills people while they
// wait for Thursday. A false positive costs one scary-sounding message; a false
// negative costs the only thing that matters.
const EMERGENCIES: Array<{ name: string; re: RegExp }> = [
  { name: 'chest pain', re: /\b(chest pain|seene? m[ae]i?n? dard|seena dard|chhati m[ae]i?n? dard|heart attack)\b|सीने में दर्द|दिल का दौरा/i },
  { name: 'breathlessness', re: /\b(can'?t breathe|cannot breathe|breathless|saans nahi|saans nhi|saas nahi|dam ghut|suffocat)\w*/i },
  { name: 'unconscious', re: /\b(unconscious|behosh|behoshi|fainted|faint ho|coma|not responding)\b|बेहोश/i },
  { name: 'heavy bleeding', re: /\b(heavy bleeding|bleeding a lot|khoon beh|khoon bah|khun beh|blood loss|bleeding nahi ruk)\w*|खून बह/i },
  { name: 'stroke', re: /\b(stroke|paralysis|lakwa|lakva|face droop|slurred speech)\b|लकवा/i },
  { name: 'serious injury', re: /\b(accident|major injury|head injury|sar p?e?[ ]?chot|serious burn|jal gaya|jal gayi)\b|दुर्घटना/i },
  { name: 'poisoning', re: /\b(poison|zeher|zahar|overdose|snake ?bite|saap ne kata)\b|ज़हर|जहर/i },
  { name: 'self harm', re: /\b(suicide|suicidal|kill myself|end my life|jaan dene|marna chahta|marna chahti|khudkushi|atmahatya)\b|आत्महत्या/i },
  { name: 'convulsions', re: /\b(seizure|fits? aa|convulsion|mirgi|jhatke aa)\w*|मिर्गी/i },
  { name: 'newborn distress', re: /\b(newborn|navjat).{0,20}(not|nahi|nhi)\b/i }
];

/**
 * Does this read like something that needs help now rather than an appointment?
 *
 * Checked before anything else, and it OVERRIDES a speciality match: "seene me
 * dard" would otherwise route neatly to a cardiologist with a slot next week.
 */
export const detectEmergency = (text: string): EmergencySignal | null => {
  const t = (text || '').trim();
  if (!t) return null;
  for (const e of EMERGENCIES) if (e.re.test(t)) return { matched: e.name };
  return null;
};

// ── Symptom → speciality ─────────────────────────────────────────────────
//
// `speciality` matches against the clinic's OWN list, because clinics name the
// same thing differently: Paediatrician / Pediatrics / Child Specialist. We
// suggest only what that clinic actually staffs.
//
// ORDER IS THE LOGIC. "bacche ko bukhar" is a child first and a fever second,
// so age-of-patient rules sit above symptom rules; a fever in a child belongs
// to the paediatrician, not the physician.
interface Rule {
  /** Words a patient might write. */
  re: RegExp;
  /**
   * Which of the clinic's specialities this points at, most specific FIRST.
   *
   * A list rather than one pattern because a stomach complaint belongs to a
   * gastroenterologist if the clinic has one and to the general physician if it
   * does not — and reading that off `available.find()` made the answer depend
   * on the order rows came back from the database.
   *
   * Every pattern is anchored on a word boundary. `/ent/` matched the "ent"
   * inside "Dentist", so a sore throat was sent to the dentist; `/uro/` matches
   * the "uro" inside "Neurology" exactly the same way. Substring matching on
   * speciality names is always wrong.
   */
  speciality: RegExp[];
  /** What to show the patient as the reason. */
  label: string;
}

const RULES: Rule[] = [
  // Who the patient is, before what is wrong with them.
  {
    label: 'a child',
    re: /\b(bac+h*[aeiy]\w*|child|children|kid|baby|infant|newborn|navjat|toddler|beta|beti|son|daughter)\b|बच्च/i,
    speciality: [/p(a)?edia|child/i]
  },
  {
    label: 'pregnancy or women’s health',
    re: /\b(pregnan\w*|garbh\w*|period|periods|mc|menstru\w*|maahwari|mahwari|delivery|labour|labor|conceive|ivf|pcod|pcos|white discharge|safed pani|uterus|bachedani)\b|गर्भ|माहवारी/i,
    speciality: [/gyn|obst/i]
  },

  // Then the part of the body.
  {
    label: 'teeth or gums',
    re: /\b(daant|dant|daanth|tooth|teeth|dental|dentist|masuda|masoodo?a?|gum|gums|cavity|cavities|root canal|braces|jabda)\b|दांत|दाँत/i,
    speciality: [/\bdent/i]
  },
  {
    label: 'skin or hair',
    re: /\b(skin|twacha|khujli|khaj|itch\w*|rash|pimple|pimples|acne|daag|dhabba|fungal|allergy on skin|eczema|psorias\w*|baal jhad|hair fall|hairfall|dandruff|wart|mas+a)\b|त्वचा|खुजली/i,
    speciality: [/derma|\bskin/i]
  },
  {
    label: 'bones or joints',
    re: /\b(ghutn[ae]|knee|joint|joints|jod|jodo?n|kamar|back ?pain|kandha|shoulder|fracture|toot gaya|haddi|bone|slip disc|sciatica|sprain|moch|gardan|neck pain|arthritis|gathiya)\b|घुटन|कमर|हड्डी/i,
    speciality: [/ortho|\bbone/i]
  },
  {
    label: 'ear, nose or throat',
    re: /\b(kaan|kan dard|ear|ears|naak|nose|nak band|gala|throat|tonsil\w*|sinus|sunai nahi|sunayi|hearing|snor\w*|kharaash|kharash|awaz baith)\b|कान|नाक|गला/i,
    speciality: [/\bent\b|otolaryn|\bear\b/i]
  },
  {
    label: 'eyes',
    re: /\b(aankh|ankh|aankho|eye|eyes|vision|dikhai nahi|dikhayi|chashma|spectacle|cataract|motiya|lal aankh)\b|आँख|आंख/i,
    speciality: [/ophthal|\beye/i]
  },
  {
    label: 'the heart',
    re: /\b(heart|dil|cardio|bp|blood ?pressure|cholesterol|dhadkan|palpitation|ecg|chest|seene?|chhati)\b|दिल|रक्तचाप|सीन/i,
    speciality: [/cardio|\bheart/i]
  },
  {
    label: 'stomach or digestion',
    re: /\b(pet|stomach|gas|acidity|acid|ulcer|liver|jigar|constipat\w*|kabz|loose ?motion|dast|diarrho?ea|vomit|ulti|piles|bawasir|bhookh nahi|indigestion|gastric)\b|पेट|कब्ज/i,
    speciality: [/gastro/i, /physician|\bgeneral|medicine/i]
  },
  {
    label: 'mental health',
    re: /\b(depress\w*|anxiety|anxious|tension|stress|neend nahi|nind nahi|insomnia|sleep problem|panic|ghabrahat|ghabra\w*|mood|mental|psychiat\w*|counsel\w*|addiction|nasha)\b|अवसाद|तनाव/i,
    speciality: [/psychia|psycho|mental/i]
  },
  {
    label: 'nerves or the brain',
    re: /\b(migraine|sir dard|sar dard|headache|chakkar|dizzy|dizziness|jhunjhuni|numbness|sunn|tremor|kampan|memory loss|bhool)\b|सिरदर्द|चक्कर/i,
    speciality: [/neuro/i]
  },
  {
    label: 'urinary or kidney',
    re: /\b(peshab|pesab|urine|urinary|kidney|gurda|stone|pathri|burning while|prostate)\b|पेशाब|किडनी/i,
    speciality: [/\buro|nephro/i]
  },
  {
    label: 'diabetes or thyroid',
    re: /\b(sugar|diabet\w*|madhumeh|thyroid|tsh|hormone|obesity|motapa|weight gain|weight loss)\b|मधुमेह|थायराइड/i,
    speciality: [/endocrin|diabet/i, /physician|\bgeneral/i]
  },

  // Last: the everyday complaints that belong to whoever is on general duty.
  {
    label: 'a general complaint',
    re: /\b(bukhar|bukar|fever|temperature|sardi|zukam|jukam|cold|khaansi|khansi|cough|body ?pain|badan dard|kamzori|weakness|thakan|fatigue|infection|viral|dengue|malaria|typhoid|checkup|check ?up|general|routine|blood test|report)\b|बुखार|सर्दी|खांसी/i,
    speciality: [/\bgeneral|physician|family|medicine|\bgp\b/i]
  }
];

/**
 * Suggest a speciality from what the patient wrote.
 *
 * `available` is the clinic's own speciality list; nothing outside it is ever
 * suggested, because offering a dermatologist a clinic does not have is worse
 * than asking the patient to choose.
 */
export const suggestSpeciality = (
  text: string,
  available: string[]
): SpecialitySuggestion | null => {
  const t = (text || '').trim();
  if (!t || !available.length) return null;

  // An exact speciality name beats any guess — a patient who typed
  // "dermatologist" has already answered the question.
  const named = available.find((s) => new RegExp(`\\b${escapeRe(s)}\\b`, 'i').test(t));
  if (named) return { speciality: named, matched: named };

  for (const rule of RULES) {
    if (!rule.re.test(t)) continue;
    for (const want of rule.speciality) {
      const speciality = available.find((s) => want.test(s));
      if (speciality) return { speciality, matched: rule.label };
    }
  }
  return null;
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What we say when a description needs help now, not an appointment. */
export const EMERGENCY_REPLY =
  '⚠️ This sounds serious and should not wait for an appointment.\n\n' +
  'Please call *108* for an ambulance, or go to the nearest emergency room now.\n\n' +
  'If this was a mistake, reply MENU and we will book you normally.';
