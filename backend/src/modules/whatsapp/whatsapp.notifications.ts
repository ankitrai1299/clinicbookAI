// High-level, fire-and-forget WhatsApp notifications for HTTP request paths
// (booking, waitlist). These never block or fail the originating request: they
// short-circuit when WhatsApp isn't configured and swallow/log any send error.

import { isWhatsAppConfigured } from '../../config/whatsapp.js';
import { formatDoctorName, normalizeDoctorName } from '../../utils/doctorName.js';
import { getAvailableSlots } from '../../services/scheduling.service.js';
import { sendTemplatedOrSession, sendWhatsAppTextMessage } from './whatsapp.service.js';
import {
  AppointmentTemplateData,
  WaitlistTemplateData,
  WhatsAppTemplate,
  bookingConfirmationComponents,
  registrationWelcomeComponents,
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
    // Template body already prints "Dr." → pass the bare name.
    doctorName: normalizeDoctorName(p.doctorName),
    clinicName: p.clinicName
  };
  const sessionBody =
    `Hello ${p.patientName}! Your appointment with ${formatDoctorName(p.doctorName)} at ${p.clinicName} ` +
    `on ${dateLabel} at ${p.appointmentTime} is confirmed. See you soon!`;

  void sendTemplatedOrSession({
    to: p.to,
    templateName: WhatsAppTemplate.BOOKING_CONFIRMATION,
    components: bookingConfirmationComponents(data),
    sessionBody,
    clinicId: p.clinicId
  }).catch((err) => console.error('[WhatsApp] Booking confirmation send failed:', err));
};

export interface AppointmentCompletedParams {
  to: string;
  clinicId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
}

// Sent automatically when staff mark a consultation COMPLETED. A warm thank-you
// that keeps the WhatsApp thread open for follow-ups. Free-form session message
// (the patient just visited, so their 24h window is open); no-op if WhatsApp is
// unconfigured and never blocks the request.
export const notifyAppointmentCompleted = (p: AppointmentCompletedParams): void => {
  if (!isWhatsAppConfigured()) {
    return;
  }

  const body =
    `Thank you for visiting ${p.clinicName} today, ${p.patientName}. 🙏\n\n` +
    `We hope your consultation with ${formatDoctorName(p.doctorName)} was helpful.\n\n` +
    `If you need another appointment or follow-up, simply send a message here anytime.\n\n` +
    `Wishing you good health!\n` +
    `— ${p.clinicName}`;

  void sendWhatsAppTextMessage({
    to: p.to.replace(/\D/g, ''),
    body,
    messageType: 'appointment_completed',
    clinicId: p.clinicId
  }).catch((err) => console.error('[WhatsApp] Completion message send failed:', err));
};

export interface AppointmentRejectedParams {
  to: string;
  clinicId: string;
  doctorId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  appointmentDate: Date;
  appointmentTime: string;
}

// Sent when staff REJECT/CANCEL a pending appointment. Per requirement 7, the
// patient is offered alternate slots so they can rebook in one step. Free-form
// session message (no approved template for this), so it delivers while the
// patient's 24h WhatsApp window is open — which it is right after they booked.
export const notifyAppointmentRejectedWithAlternatives = (p: AppointmentRejectedParams): void => {
  if (!isWhatsAppConfigured()) {
    return;
  }

  const dateStr = p.appointmentDate.toISOString().slice(0, 10);
  const dateLabel = formatDateLabel(p.appointmentDate);

  void (async () => {
    const slots = await getAvailableSlots(p.clinicId, p.doctorId, dateStr);
    const alternatives = slots.filter((s) => s !== p.appointmentTime).slice(0, 6);

    const body =
      `Hello ${p.patientName}, unfortunately your requested appointment with ${formatDoctorName(p.doctorName)} ` +
      `at ${p.clinicName} on ${dateLabel} at ${p.appointmentTime} could not be confirmed.\n\n` +
      // Deterministic FSM only — never invite free-text ("reply a time / another
      // day"); those replies aren't parsed. Always route back to the menu so the
      // patient rebooks by picking numbered options.
      (alternatives.length
        ? `These times are still open that day:\n${alternatives.map((s) => `• ${s}`).join('\n')}\n\n` +
          `Reply MENU to rebook and pick a new time.`
        : `Reply MENU to see other available times.`);

    await sendWhatsAppTextMessage({
      to: p.to.replace(/\D/g, ''),
      body,
      messageType: 'appointment_rejected',
      clinicId: p.clinicId
    });
  })().catch((err) => console.error('[WhatsApp] Rejection/alternatives send failed:', err));
};

export interface PatientRegisteredParams {
  to: string;
  clinicId: string;
  patientName: string;
  clinicName: string;
  patientCode: string;
}

// Builds the exact registration confirmation body from the freshly-created
// patient record. Every value (name, clinic, ID) is dynamic — nothing is
// hardcoded. Kept in one place so the session text and the approved
// `registration_welcome` template render identically.
const buildRegistrationBody = (p: PatientRegisteredParams): string =>
  `Hi ${p.patientName},\n\n` +
  `Welcome to ${p.clinicName}.\n\n` +
  `Your registration has been completed successfully.\n\n` +
  `Patient ID: ${p.patientCode}\n\n` +
  `Reply:\n` +
  `1 - Book Appointment\n` +
  `2 - My Appointments\n` +
  `3 - Cancel Appointment\n` +
  `4 - Reschedule Appointment`;

// Sent automatically on every successful patient registration (staff dashboard
// or public self-registration). Uses a free-form session message when the 24h
// window is open; otherwise falls back to the approved `registration_welcome`
// template so it still delivers to cold recipients. The outbound row in
// WhatsAppLog carries phone (`to`), wamid (`waMessageId`) and the evolving
// delivery status (sent → delivered → read), updated by the status webhook.
export const notifyPatientRegistered = (p: PatientRegisteredParams): void => {
  if (!isWhatsAppConfigured()) {
    return;
  }

  // Meta expects digits-only E.164 (no '+', spaces or dashes).
  const to = p.to.replace(/\D/g, '');
  const sessionBody = buildRegistrationBody(p);

  void sendTemplatedOrSession({
    to,
    templateName: WhatsAppTemplate.REGISTRATION_WELCOME,
    components: registrationWelcomeComponents({
      patientName: p.patientName,
      clinicName: p.clinicName,
      patientCode: p.patientCode
    }),
    sessionBody,
    clinicId: p.clinicId
  })
    .then((r) =>
      console.info('[WhatsApp] Registration message dispatched', {
        patientId: p.patientCode,
        phone: to,
        wamid: r.waMessageId ?? null,
        channel: r.channel,
        status: 'sent'
      })
    )
    .catch((err) =>
      console.error('[WhatsApp] Registration message failed', {
        patientId: p.patientCode,
        phone: to,
        error: err?.message ?? String(err)
      })
    );
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
    // Template body prints "Dr." → bare name; fall back to a neutral phrase.
    doctorName: p.doctorName ? normalizeDoctorName(p.doctorName) : 'our team',
    patientName: p.patientName,
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

export interface WaitlistSlotOfferParams {
  to: string;
  clinicId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  appointmentDate: Date;
  appointmentTime: string;
}

// Auto-sent when a cancellation frees a slot and it is offered to the next
// waitlisted patient. Carries the EXACT slot so a "YES" reply can be booked
// automatically (see waitlist claimWaitlistOffer). Free-form session message.
export const notifyWaitlistSlotOffer = (p: WaitlistSlotOfferParams): void => {
  if (!isWhatsAppConfigured()) {
    return;
  }

  const dateLabel = formatDateLabel(p.appointmentDate);
  const body =
    `Good news ${p.patientName}! A slot just opened with ${formatDoctorName(p.doctorName)} at ${p.clinicName} ` +
    `on ${dateLabel} at ${p.appointmentTime}.\n\nReply YES to claim it before someone else does.`;

  void sendWhatsAppTextMessage({
    to: p.to.replace(/\D/g, ''),
    body,
    messageType: 'waitlist_slot_offer',
    clinicId: p.clinicId
  }).catch((err) => console.error('[WhatsApp] Waitlist slot offer send failed:', err));
};
