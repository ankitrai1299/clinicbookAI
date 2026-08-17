// Consent: the notice a patient is shown, what they agreed to, and what they
// withdrew.
//
// See notice.ts for the versioned text, consent.service.ts for the rules
// (including why withdrawal is enforced but absence of consent is not),
// whatsappConsent.ts for the patient-facing conversation, and consent.routes.ts
// for the staff-facing one.

export {
  CONSENT_PURPOSES,
  grantConsent,
  withdrawConsent,
  recordNoticeShown,
  hasSeenCurrentNotice,
  consentStatus,
  mayMessage,
  phoneKey,
  forgetCachedOptOut,
  clearOptOutCache,
  type ConsentPurpose,
  type ConsentChannel
} from './consent.service.js';
export { NOTICE_VERSION, noticeText, isOptOutMessage, isOptInMessage } from './notice.js';
export { handleConsentKeywords, showNoticeIfNeeded } from './whatsappConsent.js';
export { requireRecordingConsent, recordingConsentEnforced } from './recordingConsent.js';
