// The seam between WhatsApp DELIVERY (core) and what to actually SAY (a product).
//
// core/whatsapp owns webhooks, sending, templates, channels, dedupe — the
// transport. It has no opinion about booking: that conversation is ClinicBook's
// deterministic FSM, and it registers itself here at startup.
//
// Before this existed, core/whatsapp/whatsapp.inbound imported the FSM directly,
// which meant the transport could not be shipped without the booking product.
// A clinic that bought only MediScribe still receives WhatsApp messages — it
// just has nobody registered to hold a booking conversation.

import type { BotReply } from './whatsapp.reply.js';

/** One inbound patient message, already resolved to a clinic and a patient. */
export interface PatientMessage {
  clinicId: string;
  patientId: string;
  patientName: string;
  clinicName: string;
  /** Digits-only E.164. */
  phone: string;
  patientCode?: string | null;
  message: string;
  /** Set when the patient TAPPED an interactive button/list row. */
  replyId?: string;
  /** Set when this came from a transcribed voice note. */
  fromVoice?: boolean;
}

/** Returns the single reply to send, or null to stay silent. */
export type PatientConversation = (msg: PatientMessage) => Promise<BotReply | null>;

let conversation: PatientConversation | null = null;

export const registerPatientConversation = (handler: PatientConversation): void => {
  conversation = handler;
};

export const patientConversation = (): PatientConversation | null => conversation;

/** Test seam — no production caller. */
export const resetPatientConversation = (): void => {
  conversation = null;
};
