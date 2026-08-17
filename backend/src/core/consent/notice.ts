// The privacy notice a patient is shown, and its VERSION. Pure — no imports.
//
// Versioned because consent is consent to a particular notice. If we later add a
// purpose (say, sharing a summary with an insurer), everyone who agreed to the
// old text has not agreed to the new one — and the only way to know who is who
// is to have stored which version each person saw. A date is not enough: two
// clinics may be shown different versions on the same day during a rollout.
//
// The WORDING here is deliberately plain and short, because it is read on a
// phone inside a chat. It is NOT the full policy — it points at that. The full
// DPDP-shaped notice (itemised purposes, grievance officer, retention periods,
// processor list) is a separate document that needs legal review; this is the
// at-the-point-of-collection notice that DPDP §5 asks for, and it must be
// truthful about the three things that actually happen: we message you, the
// doctor may record the visit, and AI helps write the notes.
//
// Hindi is included because DPDP requires the notice to be available in the
// Eighth Schedule languages, and because most of these patients read Hindi more
// comfortably than English. More languages are added by extending NOTICE_TEXT —
// nothing else changes.

/**
 * Bump this whenever the notice text or the purposes change.
 *
 * Format is a date plus a revision so two changes on one day are distinct.
 */
export const NOTICE_VERSION = '2026-08-17.1';

export type NoticeLang = 'en' | 'hi';

/** Where the full policy lives. Overridden by PUBLIC_BASE_URL when it is set. */
export const POLICY_PATH = '/privacy.html';

const NOTICE_TEXT: Record<NoticeLang, (policyUrl: string, clinicName: string) => string> = {
  en: (policyUrl, clinicName) =>
    `🔒 *About your information*\n\n` +
    `${clinicName} uses this WhatsApp number to book your appointments and send you reminders and prescriptions.\n\n` +
    `• We store your name, phone number and visit details.\n` +
    `• Your doctor may record the consultation to write your notes. They will tell you before recording.\n` +
    `• AI helps write those notes. A doctor checks and approves everything before it reaches you.\n` +
    `• We never sell your data.\n\n` +
    `Reply *STOP* any time to stop these messages.\n` +
    `Full policy: ${policyUrl}`,

  hi: (policyUrl, clinicName) =>
    `🔒 *आपकी जानकारी के बारे में*\n\n` +
    `${clinicName} इस WhatsApp नंबर से आपकी अपॉइंटमेंट बुक करता है और रिमाइंडर व पर्चा भेजता है।\n\n` +
    `• हम आपका नाम, फ़ोन नंबर और विज़िट की जानकारी रखते हैं।\n` +
    `• डॉक्टर परामर्श रिकॉर्ड कर सकते हैं ताकि नोट्स लिखे जा सकें। रिकॉर्ड करने से पहले वे आपको बताएँगे।\n` +
    `• नोट्स लिखने में AI मदद करता है। आप तक पहुँचने से पहले डॉक्टर हर चीज़ जाँच कर मंज़ूरी देते हैं।\n` +
    `• हम आपका डेटा कभी नहीं बेचते।\n\n` +
    `ये संदेश बंद करने के लिए कभी भी *STOP* लिखें।\n` +
    `पूरी नीति: ${policyUrl}`
};

/** The notice for a language, falling back to English rather than to a blank. */
export const noticeText = (opts: { lang?: string; clinicName?: string; policyUrl: string }): string => {
  const lang: NoticeLang = opts.lang === 'hi' ? 'hi' : 'en';
  return NOTICE_TEXT[lang](opts.policyUrl, opts.clinicName || 'This clinic');
};

/** What we reply when someone opts out. Confirmation is required — a silent STOP reads as a bug. */
export const OPT_OUT_CONFIRMATION: Record<NoticeLang, string> = {
  en:
    `✅ Done. You will not get any more messages from us on WhatsApp.\n\n` +
    `Your appointments and records are unchanged — you can still visit the clinic as usual. ` +
    `To start messages again, reply *START*.`,
  hi:
    `✅ हो गया। अब आपको WhatsApp पर हमारे संदेश नहीं आएँगे।\n\n` +
    `आपकी अपॉइंटमेंट और रिकॉर्ड वैसे ही रहेंगे — आप क्लिनिक हमेशा की तरह आ सकते हैं। ` +
    `संदेश दोबारा शुरू करने के लिए *START* लिखें।`
};

/** And when they turn them back on. */
export const OPT_IN_CONFIRMATION: Record<NoticeLang, string> = {
  en: `✅ Messages are back on. You will get your appointment reminders here again.`,
  hi: `✅ संदेश दोबारा चालू हो गए हैं। अपॉइंटमेंट रिमाइंडर अब यहीं आएँगे।`
};

/**
 * Words that mean "stop messaging me".
 *
 * Matched on the WHOLE message, trimmed, not as a substring — otherwise
 * "please don't stop my reminders" would opt someone out, and a patient who
 * loses their reminders because of a substring match has been failed twice.
 * Hindi/Hinglish spellings are included because that is what people actually
 * type here.
 */
const OPT_OUT_WORDS = new Set([
  'stop',
  'unsubscribe',
  'opt out',
  'optout',
  'band karo',
  'band kar do',
  'bandh karo',
  'band',
  'roko',
  'rok do',
  'message band karo',
  'mat bhejo',
  'mat bhejna',
  'नहीं चाहिए',
  'बंद करो',
  'बंद'
]);

const OPT_IN_WORDS = new Set(['start', 'resume', 'subscribe', 'chalu karo', 'shuru karo', 'चालू करो', 'शुरू करो']);

const normalise = (text: string): string =>
  (text || '')
    .trim()
    .toLowerCase()
    .replace(/[.!,;:]+$/, '')
    .replace(/\s+/g, ' ');

export const isOptOutMessage = (text: string): boolean => OPT_OUT_WORDS.has(normalise(text));
export const isOptInMessage = (text: string): boolean => OPT_IN_WORDS.has(normalise(text));
