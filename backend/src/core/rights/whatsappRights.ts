// The patient's own words: "what do you have about me", "delete my data".
//
// This sits beside the consent keywords (STOP/START) and follows the same rule,
// for the same reason: matched on the WHOLE message, never as a substring. The
// booking FSM's numbered menu is what most inbound messages are, and a rights
// keyword that fired on "1" or on "please don't delete my appointment" would
// break booking for everyone to serve a request nobody made.
//
// What a patient gets back is deliberately asymmetric:
//
//   ACCESS gets an immediate, useful answer — an INVENTORY of what is held, by
//   category and count. The records themselves are not sent over WhatsApp: a
//   chat window on a shared phone is not where a medical record should land, and
//   a screenshot of it outlives any control we have. The clinic hands those over.
//
//   ERASURE gets an honest one. It is recorded and a human decides, and the
//   patient is told plainly that medical records often must be kept by law —
//   because promising deletion and then not deleting is worse than saying so.

import { prisma } from '../../config/prisma.js';
import { sendWhatsAppTextMessage } from '../whatsapp/whatsapp.service.js';
import { buildPatientExport, summariseExport } from './export.js';
import { RESPONSE_DAYS, createRightsRequest, type RightsKind } from './rights.service.js';

const normalise = (text: string): string =>
  (text || '').trim().toLowerCase().replace(/[.!,;:?]+$/, '').replace(/\s+/g, ' ');

/**
 * Whole-message phrases, per right.
 *
 * Conservative on purpose. Every phrase here is one a patient would only send
 * deliberately; nothing that could be an answer inside a booking flow.
 */
const PHRASES: Record<RightsKind, string[]> = {
  access: [
    'my data',
    'my information',
    'what data do you have',
    'what information do you have',
    'mera data',
    'meri jankari',
    'mera data batao',
    'मेरा डेटा',
    'मेरी जानकारी'
  ],
  erasure: [
    'delete my data',
    'delete my information',
    'delete my records',
    'erase my data',
    'mera data delete karo',
    'mera data hatao',
    'meri jankari delete karo',
    'मेरा डेटा हटाओ',
    'मेरा डेटा डिलीट करो'
  ],
  correction: [
    'my data is wrong',
    'correct my data',
    'change my details',
    'mera data galat hai',
    'meri jankari galat hai',
    'मेरा डेटा ग़लत है'
  ],
  grievance: ['complaint', 'shikayat', 'grievance', 'शिकायत']
};

/** Which right this message is asking for, if any. */
export const detectRightsRequest = (text: string): RightsKind | null => {
  const t = normalise(text);
  if (!t) return null;
  for (const kind of Object.keys(PHRASES) as RightsKind[]) {
    if (PHRASES[kind].some((phrase) => t === phrase)) return kind;
  }
  return null;
};

const langOf = (patientLanguage?: string | null): 'en' | 'hi' =>
  /hindi|हिंदी|हिन्दी/i.test(patientLanguage || '') ? 'hi' : 'en';

/** The inventory line for one section, skipping the empty ones. */
const inventoryLines = (counts: Record<string, number>, labels: Record<string, string>): string =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([table, n]) => `• ${labels[table] ?? table} — ${n}`)
    .join('\n');

const REPLIES = {
  erasure: {
    en: (days: number) =>
      `We have recorded your request to delete your data. The clinic will respond within ${days} days.\n\n` +
      `Please note: a clinic is required by law to keep medical records for several years, so parts of ` +
      `your record may have to be kept. The clinic will tell you exactly what was deleted and what was not.\n\n` +
      `To stop messages immediately, reply *STOP*.`,
    hi: (days: number) =>
      `आपके डेटा को हटाने का अनुरोध दर्ज कर लिया गया है। क्लिनिक ${days} दिनों में जवाब देगा।\n\n` +
      `ध्यान दें: क़ानून के अनुसार क्लिनिक को मेडिकल रिकॉर्ड कई साल तक रखने होते हैं, इसलिए आपके रिकॉर्ड का ` +
      `कुछ हिस्सा रखना पड़ सकता है। क्लिनिक आपको बताएगा कि क्या हटाया गया और क्या नहीं।\n\n` +
      `संदेश तुरंत बंद करने के लिए *STOP* लिखें।`
  },
  correction: {
    en: (days: number) =>
      `We have recorded your request to correct your details. The clinic will contact you within ${days} days.`,
    hi: (days: number) =>
      `आपकी जानकारी सुधारने का अनुरोध दर्ज कर लिया गया है। क्लिनिक ${days} दिनों में आपसे संपर्क करेगा।`
  },
  grievance: {
    en: (days: number) =>
      `Your complaint has been recorded and the clinic will respond within ${days} days.\n\n` +
      `If it is about how your data is handled, say so in your next message and it will be routed accordingly.`,
    hi: (days: number) =>
      `आपकी शिकायत दर्ज कर ली गई है, क्लिनिक ${days} दिनों में जवाब देगा।\n\n` +
      `अगर यह आपके डेटा के इस्तेमाल के बारे में है, तो अगले संदेश में बताइए।`
  }
} as const;

export interface RightsTurnResult {
  /** True when this message was the whole turn — the FSM must not also run. */
  handled: boolean;
}

/**
 * Handle a rights request if that is what the patient sent.
 *
 * Best-effort throughout, with one hard rule: the patient is told their request
 * was recorded ONLY if it actually was. A confirmation we have no row for is the
 * worst outcome here — they stop chasing, and the clock never started.
 */
export const handleRightsRequest = async (params: {
  clinicId: string;
  patientId: string;
  phone: string;
  text: string;
  patientLanguage?: string | null;
}): Promise<RightsTurnResult> => {
  const kind = detectRightsRequest(params.text);
  if (!kind) return { handled: false };

  const lang = langOf(params.patientLanguage);

  const row = await createRightsRequest({
    clinicId: params.clinicId,
    patientId: params.patientId,
    kind,
    channel: 'whatsapp',
    phone: params.phone,
    message: params.text
  });

  // Could not record it: say nothing and let the normal flow answer. Better an
  // unhelpful reply than a promise with no record behind it.
  if (!row) return { handled: false };

  let body: string;

  if (kind === 'access') {
    // An inventory, not the records. Counts by category, in the patient's own
    // language of the export's plain-language labels.
    try {
      const exported = await buildPatientExport(params.clinicId, params.patientId);
      const counts = summariseExport(exported);
      const lines = inventoryLines(counts, exported.contents);
      const clinic = await prisma.clinic.findUnique({
        where: { id: params.clinicId },
        select: { name: true }
      });

      body =
        lang === 'hi'
          ? `📋 *${clinic?.name ?? 'क्लिनिक'} के पास आपकी यह जानकारी है:*\n\n${lines || '• कुछ नहीं'}\n\n` +
            `पूरी कॉपी लेने के लिए क्लिनिक से कहिए — हमने आपका अनुरोध दर्ज कर लिया है और वे ${RESPONSE_DAYS} दिनों में जवाब देंगे।\n\n` +
            `⚠️ पूरा रिकॉर्ड WhatsApp पर नहीं भेजा जाता — यह आपकी ही सुरक्षा के लिए है।`
          : `📋 *What ${clinic?.name ?? 'this clinic'} holds about you:*\n\n${lines || '• nothing'}\n\n` +
            `We have recorded your request for a full copy; the clinic will respond within ${RESPONSE_DAYS} days.\n\n` +
            `⚠️ The full record is not sent over WhatsApp — that is for your own protection.`;
    } catch (err) {
      console.error('[rights] could not build the inventory', err);
      body =
        lang === 'hi'
          ? `आपका अनुरोध दर्ज कर लिया गया है। क्लिनिक ${RESPONSE_DAYS} दिनों में आपसे संपर्क करेगा।`
          : `Your request has been recorded. The clinic will contact you within ${RESPONSE_DAYS} days.`;
    }
  } else {
    body = REPLIES[kind][lang](RESPONSE_DAYS);
  }

  await sendWhatsAppTextMessage({
    to: params.phone,
    body,
    messageType: 'rights_response',
    clinicId: params.clinicId
  }).catch((e) => console.error('[rights] reply failed to send', e));

  return { handled: true };
};
