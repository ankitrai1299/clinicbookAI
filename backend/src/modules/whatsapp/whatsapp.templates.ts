// Centralised WhatsApp Cloud API template definitions.
//
// The template `name` and the {{n}} body placeholders MUST match what is
// registered/approved in the WhatsApp Business account. The registration
// payloads live in scripts/registerWhatsAppTemplates.ts — keep the parameter
// ORDER in the *Components builders below in sync with the {{n}} order there.

export const WHATSAPP_TEMPLATE_LANGUAGE = 'en_US';

export const WhatsAppTemplate = {
  APPOINTMENT_REMINDER: 'appointment_reminder',
  BOOKING_CONFIRMATION: 'booking_confirmation',
  WAITLIST_OFFER: 'waitlist_offer'
} as const;

export type WhatsAppTemplateName = (typeof WhatsAppTemplate)[keyof typeof WhatsAppTemplate];

// Shape sent to the Graph API under template.components for a body with variables.
export interface TemplateComponent {
  type: 'body';
  parameters: Array<{ type: 'text'; text: string }>;
}

const bodyParams = (...values: string[]): TemplateComponent[] => [
  {
    type: 'body',
    parameters: values.map((text) => ({ type: 'text', text }))
  }
];

export interface AppointmentTemplateData {
  patientName: string;
  dateLabel: string;
  time: string;
  doctorName: string;
  clinicName: string;
}

export interface WaitlistTemplateData {
  patientName: string;
  doctorName: string;
  clinicName: string;
}

// appointment_reminder / booking_confirmation:
//   {{1}} patient · {{2}} date · {{3}} time · {{4}} doctor · {{5}} clinic
export const appointmentReminderComponents = (d: AppointmentTemplateData): TemplateComponent[] =>
  bodyParams(d.patientName, d.dateLabel, d.time, d.doctorName, d.clinicName);

export const bookingConfirmationComponents = (d: AppointmentTemplateData): TemplateComponent[] =>
  bodyParams(d.patientName, d.dateLabel, d.time, d.doctorName, d.clinicName);

// waitlist_offer:
//   {{1}} patient · {{2}} doctor · {{3}} clinic
export const waitlistOfferComponents = (d: WaitlistTemplateData): TemplateComponent[] =>
  bodyParams(d.patientName, d.doctorName, d.clinicName);
