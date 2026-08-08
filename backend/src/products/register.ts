// Which products are plugged into the platform, in one place.
//
// core/ knows nothing about ClinicBook or MediScribe. Everything they add to the
// platform — MCP capabilities, WhatsApp skills, the booking conversation,
// waitlist recovery, post-visit actions — arrives through a register* call here.
//
// That makes the seam readable: this file is the answer to "what does this
// deployment actually ship?". Phase 3 turns it into a per-clinic answer by
// checking entitlements at each call site; today every product registers, and a
// clinic that hasn't bought one simply never reaches its features.
//
// Every call is idempotent, so building the app twice (tests do) is safe.

import { registerClinicBookCapabilities, registerWaitlistCapabilities } from './clinicbook/clinicbook.capabilities.js';
import { registerBookingConversation } from './clinicbook/whatsapp/whatsapp.booking.js';
import { registerWaitlistRecovery } from './clinicbook/waitlist/waitlist.recovery.js';
import { registerClinicBookSkills } from './clinicbook/skills/booking.skill.js';
import { registerClinicBookStatusSkill } from './clinicbook/skills/status.skill.js';
import { registerClinicBookRecordSkill } from './clinicbook/skills/record.skill.js';
import { registerNovaScribeSkills } from './novascribe/skills/prescription.skill.js';
import { registerNovaScribeDocumentsSkill } from './novascribe/skills/documents.skill.js';
import { registerAutoCompleteActions } from '../services/autoCompleteVisits.service.js';

/** ClinicBook AI — booking, waitlist, reminders, patient communication. */
export const registerClinicBook = (): void => {
  registerClinicBookCapabilities();
  registerWaitlistCapabilities();
  registerBookingConversation();
  registerWaitlistRecovery();
  registerClinicBookSkills();
  registerClinicBookStatusSkill();
  registerClinicBookRecordSkill();
};

/** MediScribe — the doctor's consultation scribe and its patient-facing skills. */
export const registerMediScribe = (): void => {
  registerNovaScribeSkills();
  registerNovaScribeDocumentsSkill();
};

/** Cross-product composition — only meaningful when BOTH products are present. */
export const registerCrossProduct = (): void => {
  // After ANY visit completion, send the patient their scribe prescription.
  registerAutoCompleteActions();
};

export const registerProducts = (): void => {
  registerClinicBook();
  registerMediScribe();
  registerCrossProduct();
};
