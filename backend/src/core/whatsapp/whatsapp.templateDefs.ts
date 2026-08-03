// The canonical ClinicBook message-template definitions.
//
// SINGLE SOURCE OF TRUTH. Two consumers must agree on these bytes:
//
//   1. RUNTIME  — whatsapp.provisioning.ts registers this exact list on EVERY
//      clinic's own WABA the moment they connect a number via Embedded Signup.
//      A freshly created WABA has zero templates, so without this a new clinic
//      cannot send anything outside the 24h customer-service window.
//   2. SCRIPT   — scripts/registerWhatsAppTemplates.ts (the platform WABA /
//      manual re-run path) imports the same list.
//
// The {{n}} placeholders here MUST stay in sync with the *Components builders in
// whatsapp.templates.ts — the builders decide the ORDER of the body parameters.

import { WhatsAppTemplate, WHATSAPP_TEMPLATE_LANGUAGE } from './whatsapp.templates.js';

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export interface TemplateDefinition {
  name: string;
  category: TemplateCategory;
  bodyText: string;
  // Sample values for {{1}}..{{n}} — Meta REQUIRES an example or rejects the
  // submission outright.
  example: string[];
}

export const TEMPLATE_LANGUAGE = WHATSAPP_TEMPLATE_LANGUAGE;

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    name: WhatsAppTemplate.APPOINTMENT_REMINDER,
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}, this is a reminder for your appointment on {{2}} at {{3}} with Dr. {{4}} at {{5}}. Please arrive 10 minutes early.',
    example: ['John', 'Monday, June 15, 2026', '10:00', 'Smith', 'City Health Clinic']
  },
  {
    name: WhatsAppTemplate.BOOKING_CONFIRMATION,
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}, your appointment on {{2}} at {{3}} with Dr. {{4}} at {{5}} is confirmed. See you soon!',
    example: ['John', 'Monday, June 15, 2026', '10:00', 'Smith', 'City Health Clinic']
  },
  {
    name: WhatsAppTemplate.APPOINTMENT_COMPLETED,
    category: 'UTILITY',
    bodyText:
      'Thank you for visiting {{1}} today, {{2}}. We hope your consultation with Dr. {{3}} was helpful.\n\nIf you need another appointment or follow-up, simply send a message here anytime.\n\nWishing you good health!',
    example: ['City Health Clinic', 'John', 'Smith']
  },
  {
    name: WhatsAppTemplate.WAITLIST_OFFER,
    category: 'UTILITY',
    bodyText:
      "Hi {{1}}, a slot has just opened up with Dr. {{2}} at {{3}}. Reply YES to claim it before it's gone.",
    example: ['John', 'Smith', 'City Health Clinic']
  },
  {
    name: WhatsAppTemplate.PATIENT_REGISTRATION,
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}, thank you for registering with {{2}}. Your details have been received and our team will reach out shortly to confirm your appointment. You can reply to this message anytime to chat with us.',
    example: ['John', 'City Health Clinic']
  },
  {
    // Static menu lines are part of the APPROVED body (not variables) — keep in
    // sync with the FSM main menu (whatsapp.booking.ts menuText).
    name: WhatsAppTemplate.REGISTRATION_WELCOME,
    category: 'UTILITY',
    bodyText:
      'Hi {{1}},\n\nWelcome to {{2}}.\n\nYour registration has been completed successfully.\n\nPatient ID: {{3}}\n\nReply:\n1 - Book Appointment\n2 - My Appointments\n3 - Cancel Appointment\n4 - Reschedule Appointment',
    example: ['Asha Verma', 'Sunrise Medical Center', 'PT-7K4Q9D']
  },
  {
    // {{1}} patient · {{2}} medicine line · {{3}} clinic.
    name: WhatsAppTemplate.MEDICINE_REMINDER,
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}, medicine reminder from {{3}}.\n\nPlease take: {{2}}\n\nStay healthy! Reply here if you have any questions.',
    example: ['Asha', 'Paracetamol 500mg — 1 tablet after food', 'Sunrise Medical Center']
  },
  {
    // {{1}} patient · {{2}} doctor (bare) · {{3}} clinic · {{4}} medicines.
    // {{4}} must be ONE line — WhatsApp rejects newlines inside a variable.
    name: WhatsAppTemplate.PRESCRIPTION_READY,
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}! Your prescription from Dr. {{2}} at {{3}} is ready:\n\n{{4}}\n\nGet well soon. Reply here if you have any questions.',
    example: [
      'Asha',
      'Smith',
      'Sunrise Medical Center',
      '1. Paracetamol 500mg — twice daily, 5 days; 2. Azithromycin 250mg — once daily, 3 days'
    ]
  }
];

// The Graph API create-payload for one template definition.
export const templateCreatePayload = (tpl: TemplateDefinition, language = TEMPLATE_LANGUAGE) => ({
  name: tpl.name,
  language,
  category: tpl.category,
  components: [
    {
      type: 'BODY',
      text: tpl.bodyText,
      example: { body_text: [tpl.example] }
    }
  ]
});
