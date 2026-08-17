// The consent conversation on WhatsApp: showing the notice, and honouring STOP.
//
// Kept out of whatsapp.inbound.ts on purpose. That file owns routing a patient's
// message to the right clinic and the right skill, and it is already the most
// load-bearing file in the product; consent is a separate concern with its own
// rules, and mixing them would make both harder to reason about. Inbound calls
// exactly two functions from here.
//
// Order matters and is deliberate:
//
//   STOP is checked FIRST, before the booking FSM sees the message. A patient
//   who types STOP must not have it interpreted as a menu selection, and must
//   not be walked one step further into a flow they are trying to leave.
//
//   The NOTICE is sent after that, before the reply, so it reads as
//   "here is what we do with your data" followed by "here is your answer" —
//   rather than answering first and disclosing afterwards.

import { prisma } from '../../config/prisma.js';
import { sendWhatsAppTextMessage } from '../whatsapp/whatsapp.service.js';
import {
  forgetCachedOptOut,
  grantConsent,
  hasSeenCurrentNotice,
  recordNoticeShown,
  withdrawConsent
} from './consent.service.js';
import {
  NOTICE_VERSION,
  OPT_IN_CONFIRMATION,
  OPT_OUT_CONFIRMATION,
  POLICY_PATH,
  isOptInMessage,
  isOptOutMessage,
  noticeText
} from './notice.js';

/** Where the full policy lives. PUBLIC_BASE_URL when set, else the live site. */
const policyUrl = (): string => {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  // The fallback is the deployed front-end, NOT localhost: a patient reading
  // "http://localhost:5000/privacy.html" in a WhatsApp message is worse than no
  // link at all, and PUBLIC_BASE_URL is not set everywhere yet.
  return `${base || 'https://clinicbook-ai-yj2d.vercel.app'}${POLICY_PATH}`;
};

const langOf = (patientLanguage?: string | null): 'en' | 'hi' =>
  /hindi|हिंदी|हिन्दी/i.test(patientLanguage || '') ? 'hi' : 'en';

export interface ConsentTurnResult {
  /** True when this message WAS the whole turn — inbound must stop here. */
  handled: boolean;
}

/**
 * Handle STOP / START if that is what the patient sent.
 *
 * Returns `handled: true` when the message was an opt-out or opt-in, in which
 * case the caller must not run the booking FSM: the patient asked to leave, and
 * showing them a booking menu in reply would be exactly the behaviour they were
 * trying to stop.
 *
 * The confirmation is sent with a messageType the opt-out guard exempts, so it
 * reaches a patient who has just been suppressed.
 */
export const handleConsentKeywords = async (params: {
  clinicId: string;
  patientId: string;
  phone: string;
  text: string;
  patientLanguage?: string | null;
}): Promise<ConsentTurnResult> => {
  const lang = langOf(params.patientLanguage);

  if (isOptOutMessage(params.text)) {
    const ok = await withdrawConsent({
      clinicId: params.clinicId,
      patientId: params.patientId,
      purpose: 'whatsapp_messaging',
      channel: 'whatsapp',
      phone: params.phone,
      evidence: `replied "${params.text.trim().slice(0, 40)}"`
    });
    forgetCachedOptOut(params.clinicId, params.phone);

    // If the write failed we must NOT claim it worked — the patient would stop
    // watching for messages that are still coming. Fall through to the normal
    // flow instead, which is honest about nothing having happened.
    if (!ok) return { handled: false };

    await sendWhatsAppTextMessage({
      to: params.phone,
      body: OPT_OUT_CONFIRMATION[lang],
      messageType: 'optout_confirmation',
      clinicId: params.clinicId
    }).catch((e) => console.error('[consent] opt-out confirmation failed to send', e));

    return { handled: true };
  }

  if (isOptInMessage(params.text)) {
    await grantConsent({
      clinicId: params.clinicId,
      patientId: params.patientId,
      purpose: 'whatsapp_messaging',
      channel: 'whatsapp',
      phone: params.phone,
      evidence: `replied "${params.text.trim().slice(0, 40)}"`
    });
    forgetCachedOptOut(params.clinicId, params.phone);

    await sendWhatsAppTextMessage({
      to: params.phone,
      body: OPT_IN_CONFIRMATION[lang],
      messageType: 'optin_confirmation',
      clinicId: params.clinicId
    }).catch((e) => console.error('[consent] opt-in confirmation failed to send', e));

    // START is a real instruction and the turn is complete — but unlike STOP the
    // patient probably wants to continue, so the caller runs the FSM as usual and
    // they get the menu straight after the confirmation.
    return { handled: false };
  }

  return { handled: false };
};

/**
 * Show the privacy notice, once per patient per notice version.
 *
 * Sent as its own message rather than prepended to the reply: prepending would
 * push the actual answer below the fold on a phone, and would put a block of
 * policy text in front of someone who just wants to cancel an appointment.
 *
 * Best-effort throughout. A patient must never fail to get their booking reply
 * because the notice could not be sent — the notice is re-attempted on their
 * next message, since nothing is recorded unless it actually went out.
 */
export const showNoticeIfNeeded = async (params: {
  clinicId: string;
  patientId: string;
  phone: string;
  patientLanguage?: string | null;
}): Promise<void> => {
  try {
    if (await hasSeenCurrentNotice(params.clinicId, params.patientId)) return;

    const clinic = await prisma.clinic.findUnique({
      where: { id: params.clinicId },
      select: { name: true }
    });

    await sendWhatsAppTextMessage({
      to: params.phone,
      body: noticeText({
        lang: langOf(params.patientLanguage),
        clinicName: clinic?.name,
        policyUrl: policyUrl()
      }),
      messageType: 'privacy_notice',
      clinicId: params.clinicId
    });

    // Recorded only AFTER the send resolves, so a failed send is retried on the
    // next message instead of being silently marked as delivered.
    await recordNoticeShown({
      clinicId: params.clinicId,
      patientId: params.patientId,
      channel: 'whatsapp',
      phone: params.phone,
      noticeVersion: NOTICE_VERSION,
      evidence: 'sent on WhatsApp'
    });
  } catch (err) {
    console.error('[consent] could not show the privacy notice', err);
  }
};
