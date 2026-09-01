// A patient sending their ABHA over WhatsApp.
//
// ── Not a state, a recogniser ──────────────────────────────────────────────
//
// This deliberately does NOT add a step to the booking FSM. An ABHA-shaped
// message is unmistakable — asha@abdm, or fourteen digits — so it can be
// understood wherever it arrives, and a patient who ignores the question is
// never left stuck in a state waiting for an answer they did not want to give.
// The booking flow is the thing that brings people here; nothing may slow it.
//
// ── Aadhaar is REFUSED here, loudly ────────────────────────────────────────
//
// A patient asked for "your ABHA" will sometimes send an Aadhaar number
// instead — they are both government health-ish numbers and most people do not
// distinguish them. WhatsApp messages live on Meta's servers and in a chat
// history forever, which is nowhere for an Aadhaar to be. So twelve digits are
// recognised precisely so they can be turned away, and the reply says why.
// Doing nothing would leave it sitting in the thread unremarked.
//
// ── What is stored is NOT trusted ──────────────────────────────────────────
//
// Nothing here proves the ABHA belongs to the sender. It is saved unverified,
// and ABDM discovery ignores unverified ids entirely — otherwise a patient who
// typed somebody else's address (by mistake or otherwise) would have this
// clinic's records handed to that other person. The desk confirms it against
// the card at the visit, and that is what makes it usable.

import { setPatientAbha } from '../../services/abdmIdentity.service.js';
import { sendWhatsAppTextMessage } from './whatsapp.service.js';

export type AbhaMessage =
  | { kind: 'address'; value: string }
  | { kind: 'number'; value: string }
  | { kind: 'aadhaar' };

/** ABHA addresses end in the consent manager's name: @abdm live, @sbx sandbox. */
const ABHA_SUFFIXES = ['abdm', 'sbx'];

/**
 * PURE: is this message an ABHA — or an Aadhaar the patient should not send?
 *
 * Returns null for everything else, which is almost every message. Being sure
 * matters more than being clever here: a false positive swallows a turn the
 * booking FSM needed, and the patient gets a baffling reply about health ids
 * when they were trying to book.
 */
export const detectAbhaMessage = (text: string): AbhaMessage | null => {
  const trimmed = (text ?? '').trim();
  if (!trimmed || trimmed.length > 60) return null;

  // An address, e.g. asha@abdm. Only the known suffixes — "me@gmail.com" is an
  // email address someone is sharing for some other reason, not an ABHA.
  const addr = trimmed.toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at > 0) {
    const suffix = addr.slice(at + 1);
    if (ABHA_SUFFIXES.includes(suffix) && /^[a-z0-9][a-z0-9._-]{1,48}$/.test(addr.slice(0, at))) {
      return { kind: 'address', value: addr };
    }
    return null;
  }

  // Digits only from here. Anything with other characters is ordinary text.
  if (!/^[\d\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');

  // 14 digits is an ABHA number. 12 is an Aadhaar, which must be refused.
  // 10 is a phone number and belongs to the FSM, not here.
  if (digits.length === 14) return { kind: 'number', value: digits };
  if (digits.length === 12) return { kind: 'aadhaar' };
  return null;
};

export interface AbhaTurnResult {
  /** True when this message was the whole turn — the FSM must not also run. */
  handled: boolean;
}

const REPLY = {
  saved: {
    en: (value: string) =>
      `✅ Thank you — we have noted your ABHA (${value}).\n\n` +
      `Please carry your ABHA card to your visit so the clinic can confirm it. ` +
      `Once confirmed, your prescriptions can be added to your health record.`,
    hi: (value: string) =>
      `✅ धन्यवाद — आपका ABHA (${value}) दर्ज कर लिया गया है।\n\n` +
      `विज़िट के समय अपना ABHA कार्ड साथ लाइए ताकि क्लिनिक इसे मिला सके। ` +
      `मिलान के बाद आपके पर्चे आपके हेल्थ रिकॉर्ड में जुड़ सकेंगे।`
  },
  // Says what to do INSTEAD, not just "don't". A patient told only "no" has
  // been refused; a patient told what is wanted can act.
  aadhaar: {
    en:
      `⚠️ That looks like an Aadhaar number — please do not send it here.\n\n` +
      `WhatsApp messages are stored on your phone and ours, which is not a safe ` +
      `place for it.\n\n` +
      `If you have an ABHA, send that instead — it looks like *name@abdm*. ` +
      `If you do not have one, the clinic can create it for you at your visit.`,
    hi:
      `⚠️ यह आधार नंबर लग रहा है — इसे यहाँ मत भेजिए।\n\n` +
      `WhatsApp के संदेश आपके और हमारे फ़ोन में रहते हैं, आधार के लिए यह सुरक्षित जगह नहीं है।\n\n` +
      `अगर आपके पास ABHA है तो वही भेजिए — वह *name@abdm* जैसा दिखता है। ` +
      `अगर नहीं है, तो क्लिनिक विज़िट के समय बना देगी।`
  }
} as const;

const langOf = (language?: string | null): 'en' | 'hi' =>
  (language ?? '').toLowerCase().startsWith('hi') ? 'hi' : 'en';

/**
 * Handle an ABHA (or an Aadhaar) if that is what the patient sent.
 *
 * Best-effort: a failure to save is answered with silence and `handled: false`,
 * so the ordinary flow still replies. Confirming an ABHA we did not store would
 * leave the patient believing the clinic has it.
 */
export const handleAbhaMessage = async (params: {
  clinicId: string;
  patientId: string;
  phone: string;
  text: string;
  patientLanguage?: string | null;
}): Promise<AbhaTurnResult> => {
  const found = detectAbhaMessage(params.text);
  if (!found) return { handled: false };

  const lang = langOf(params.patientLanguage);
  const say = (body: string) =>
    sendWhatsAppTextMessage({ to: params.phone, body, clinicId: params.clinicId }).catch((e) =>
      console.error('[WhatsApp][abha] reply failed:', e)
    );

  if (found.kind === 'aadhaar') {
    // Refused, and NOT recorded anywhere — not the patient row, not a log. The
    // whole point is that it should not come to rest here.
    await say(REPLY.aadhaar[lang]);
    console.info('[WhatsApp][abha] an Aadhaar-shaped message was refused');
    return { handled: true };
  }

  try {
    const saved = await setPatientAbha(params.clinicId, params.patientId, {
      ...(found.kind === 'address' ? { abhaAddress: found.value } : { abhaNumber: found.value }),
      // Nobody has checked this belongs to the sender. Discovery ignores it
      // until the desk confirms it against the card.
      verified: false
    });
    await say(REPLY.saved[lang](saved.abhaAddress ?? saved.abhaNumber ?? found.value));
    return { handled: true };
  } catch (err) {
    // The commonest failure is the duplicate guard: this ABHA already sits on
    // another patient here. Telling the sender that would disclose something
    // about a different person, so the reply says only what concerns them.
    console.error('[WhatsApp][abha] could not save:', err);
    await say(
      lang === 'hi'
        ? 'यह ABHA दर्ज नहीं हो सका। कृपया विज़िट के समय क्लिनिक को अपना ABHA कार्ड दिखाइए।'
        : 'We could not record that ABHA. Please show your ABHA card at the clinic during your visit.'
    );
    return { handled: true };
  }
};
