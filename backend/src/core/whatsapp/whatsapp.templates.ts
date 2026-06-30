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
  APPOINTMENT_COMPLETED: 'appointment_completed',
  WAITLIST_OFFER: 'waitlist_offer',
  PATIENT_REGISTRATION: 'patient_registration',
  REGISTRATION_WELCOME: 'registration_welcome'
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

export interface AppointmentCompletedTemplateData {
  clinicName: string;
  patientName: string;
  doctorName: string;
}

export interface WaitlistTemplateData {
  patientName: string;
  doctorName: string;
  clinicName: string;
}

export interface PatientRegistrationTemplateData {
  patientName: string;
  clinicName: string;
}

export interface RegistrationWelcomeTemplateData {
  patientName: string;
  clinicName: string;
  patientCode: string;
}

// appointment_reminder / booking_confirmation:
//   {{1}} patient · {{2}} date · {{3}} time · {{4}} doctor · {{5}} clinic
export const appointmentReminderComponents = (d: AppointmentTemplateData): TemplateComponent[] =>
  bodyParams(d.patientName, d.dateLabel, d.time, d.doctorName, d.clinicName);

export const bookingConfirmationComponents = (d: AppointmentTemplateData): TemplateComponent[] =>
  bodyParams(d.patientName, d.dateLabel, d.time, d.doctorName, d.clinicName);

// appointment_completed:
//   {{1}} clinic · {{2}} patient · {{3}} doctor (bare name; body prints "Dr.")
export const appointmentCompletedComponents = (
  d: AppointmentCompletedTemplateData
): TemplateComponent[] => bodyParams(d.clinicName, d.patientName, d.doctorName);

// waitlist_offer:
//   {{1}} patient · {{2}} doctor · {{3}} clinic
export const waitlistOfferComponents = (d: WaitlistTemplateData): TemplateComponent[] =>
  bodyParams(d.patientName, d.doctorName, d.clinicName);

// patient_registration:
//   {{1}} patient · {{2}} clinic
export const patientRegistrationComponents = (
  d: PatientRegistrationTemplateData
): TemplateComponent[] => bodyParams(d.patientName, d.clinicName);

// registration_welcome:
//   {{1}} patient · {{2}} clinic · {{3}} patient ID
// Body (static menu lines are part of the approved template, not variables) —
// kept in sync with the FSM main menu (whatsapp.booking.ts menuText):
//   Hi {{1}},\n\nWelcome to {{2}}.\n\nYour registration has been completed
//   successfully.\n\nPatient ID: {{3}}\n\nReply:\n1 - Book Appointment\n
//   2 - My Appointments\n3 - Cancel Appointment\n4 - Reschedule Appointment
export const registrationWelcomeComponents = (
  d: RegistrationWelcomeTemplateData
): TemplateComponent[] => bodyParams(d.patientName, d.clinicName, d.patientCode);
