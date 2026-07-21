// The same consultation, spoken in different languages — used by every NovaScribe
// demo surface so the site and the recorded footage never drift apart.
//
// The transcript is written in the language's OWN script, because that is what the
// product actually produces: speech is transcribed in the script it was spoken in,
// not romanised. The clinical note stays in English (that is what goes into the
// record), while the patient's copy is sent back in their language.

export type Turn = { who: 'Doctor' | 'Patient'; text: string };

export type Scene = {
  /** ISO code used by the transcription settings. */
  code: string;
  /** How the language names itself. */
  native: string;
  /** English name, for the smaller caption. */
  english: string;
  transcript: Turn[];
  /** The patient-facing summary, in the patient's own language. */
  patientLine: string;
};

// Font stack that covers every Indic script we transcribe. Windows ships Nirmala UI,
// Android and most Linux ship the Noto family, macOS has its own per-script faces —
// listing all three keeps the text from falling back to tofu boxes.
export const INDIC_FONT =
  "'Noto Sans','Noto Sans Devanagari','Noto Sans Tamil','Noto Sans Bengali'," +
  "'Noto Sans Telugu','Noto Sans Gujarati','Noto Sans Kannada','Noto Sans Malayalam'," +
  "'Noto Sans Gurmukhi','Nirmala UI','Kohinoor Devanagari',system-ui,sans-serif";

export const SCENES: Scene[] = [
  {
    code: 'hi',
    native: 'हिन्दी',
    english: 'Hindi',
    transcript: [
      { who: 'Doctor', text: 'बताइए, क्या तकलीफ़ हो रही है?' },
      { who: 'Patient', text: 'दो दिन से गले में दर्द है, बुख़ार भी आ रहा है।' },
      { who: 'Doctor', text: 'खाँसी या साँस में दिक़्क़त?' },
      { who: 'Patient', text: 'हल्की खाँसी है। साँस ठीक है।' },
    ],
    patientLine: 'गले का संक्रमण है। पैरासिटामोल खाने के बाद लें और गरारे करें।',
  },
  {
    code: 'ta',
    native: 'தமிழ்',
    english: 'Tamil',
    transcript: [
      { who: 'Doctor', text: 'சொல்லுங்க, என்ன பிரச்சனை?' },
      { who: 'Patient', text: 'ரெண்டு நாளா தொண்டை வலிக்குது, காய்ச்சலும் இருக்கு.' },
      { who: 'Doctor', text: 'இருமல் இருக்கா? மூச்சு விட சிரமமா?' },
      { who: 'Patient', text: 'லேசா இருமல் இருக்கு. மூச்சு நல்லா இருக்கு.' },
    ],
    patientLine: 'தொண்டை தொற்று. பாராசிட்டமால் சாப்பாட்டுக்குப் பிறகு எடுத்துக்கொள்ளுங்கள்.',
  },
  {
    code: 'bn',
    native: 'বাংলা',
    english: 'Bengali',
    transcript: [
      { who: 'Doctor', text: 'বলুন, কী সমস্যা হচ্ছে?' },
      { who: 'Patient', text: 'দুদিন ধরে গলা ব্যথা, জ্বরও আসছে।' },
      { who: 'Doctor', text: 'কাশি বা শ্বাসকষ্ট আছে?' },
      { who: 'Patient', text: 'হালকা কাশি আছে। শ্বাস ঠিক আছে।' },
    ],
    patientLine: 'গলার সংক্রমণ। খাবারের পরে প্যারাসিটামল নিন, গার্গল করুন।',
  },
  {
    code: 'mr',
    native: 'मराठी',
    english: 'Marathi',
    transcript: [
      { who: 'Doctor', text: 'सांगा, काय त्रास होतोय?' },
      { who: 'Patient', text: 'दोन दिवसांपासून घसा दुखतोय, तापही येतोय.' },
      { who: 'Doctor', text: 'खोकला किंवा श्वास घ्यायला त्रास?' },
      { who: 'Patient', text: 'हलका खोकला आहे. श्वास ठीक आहे.' },
    ],
    patientLine: 'घशाचा संसर्ग आहे. जेवणानंतर पॅरासिटामॉल घ्या आणि गुळण्या करा.',
  },
];

// The clinical note is the same whichever language the visit was spoken in — that
// is the whole point: the doctor speaks naturally, the record stays standardised.
export const NOTE = [
  { h: 'Chief complaint', b: 'Sore throat & fever · 2 days, mild cough.' },
  { h: 'Assessment', b: 'Acute pharyngitis, likely viral.' },
];

export const RX: [string, string][] = [
  ['Paracetamol 650mg', 'TDS · 3 days'],
  ['Warm saline gargle', 'Twice daily'],
];

// Every language the doctor can record in today. Mirrors SUPPORTED_LANGUAGES in
// src/mediscribe/contracts.ts — keep the two in step.
export const ALL_LANGUAGES: { code: string; native: string; english: string }[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
];
