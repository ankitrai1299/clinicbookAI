// High-level, fire-and-forget WhatsApp notifications for HTTP request paths
// (booking, waitlist). These never block or fail the originating request: they
// short-circuit when WhatsApp isn't configured and swallow/log any send error.

import { isWhatsAppConfigured } from '../../config/whatsapp.js';
import { sendTemplatedOrSession, sendWhatsAppTextMessage } from './whatsapp.service.js';
import {
  AppointmentTemplateData,
  WaitlistTemplateData,
  WhatsAppTemplate,
  bookingConfirmationComponents,
  waitlistOfferComponents
} from './whatsapp.templates.js';

const formatDateLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });

export interface BookingConfirmationParams {
  to: string;
  clinicId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  appointmentDate: Date;
  appointmentTime: string;
}

export const notifyBookingConfirmation = (p: BookingConfirmationParams): void => {
  if (!isWhatsAppConfigured()) {
    return;
  }

  const dateLabel = formatDateLabel(p.appointmentDate);
  const data: AppointmentTemplateData = {
    patientName: p.patientName,
    dateLabel,
    time: p.appointmentTime,
    doctorName: p.doctorName,
    clinicName: p.clinicName
  };
  const sessionBody =
    `Hello ${p.patientName}! Your appointment with Dr. ${p.doctorName} at ${p.clinicName} ` +
    `on ${dateLabel} at ${p.appointmentTime} is confirmed. See you soon!`;

  void sendTemplatedOrSession({
    to: p.to,
    templateName: WhatsAppTemplate.BOOKING_CONFIRMATION,
    components: bookingConfirmationComponents(data),
    sessionBody,
    clinicId: p.clinicId
  }).catch((err) => console.error('[WhatsApp] Booking confirmation send failed:', err));
};

export interface PatientWelcomeParams {
  to: string;
  clinicId: string;
  patientName: string;
  clinicName: string;
}

// Sent automatically when a new patient record is created. There is no approved
// "welcome" template, so this goes out as a free-form session message — it will
// only deliver inside the 24h window, but is always recorded in WhatsAppLog.
export const notifyPatientWelcome = (p: PatientWelcomeParams): void => {
  if (!isWhatsAppConfigured()) {
    return;
  }

  // Meta expects digits-only E.164 (no '+', spaces or dashes).
  const to = p.to.replace(/\D/g, '');
  const body =
    `Hello ${p.patientName},\n\n` +
    `Welcome to ${p.clinicName}.\n\n` +
    `Your patient profile has been created successfully.\n\n` +
    `You can now book appointments, receive reminders and communicate with our AI assistant through WhatsApp.`;

  void sendWhatsAppTextMessage({
    to,
    body,
    messageType: 'welcome',
    clinicId: p.clinicId
  }).catch((err) => console.error('[WhatsApp] Patient welcome send failed:', err));
};

export interface WaitlistOfferParams {
  to: string;
  clinicId: string;
  patientName: string;
  doctorName?: string;
  clinicName: string;
}

export const notifyWaitlistOffer = (p: WaitlistOfferParams): void => {
  if (!isWhatsAppConfigured()) {
    return;
  }

  const data: WaitlistTemplateData = {
    patientName: p.patientName,
    doctorName: p.doctorName ?? 'our team',
    clinicName: p.clinicName
  };
  const sessionBody =
    `Hello ${p.patientName}! A slot has just opened up at ${p.clinicName}. ` +
    `Reply YES to claim it before it's gone.`;

  void sendTemplatedOrSession({
    to: p.to,
    templateName: WhatsAppTemplate.WAITLIST_OFFER,
    components: waitlistOfferComponents(data),
    sessionBody,
    clinicId: p.clinicId
  }).catch((err) => console.error('[WhatsApp] Waitlist offer send failed:', err));
};
