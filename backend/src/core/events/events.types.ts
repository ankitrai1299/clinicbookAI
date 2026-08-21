// Typed catalogue of internal domain events. This is the CONTRACT between
// products: a product emits an event here, other products subscribe — neither
// imports the other. Adding a cross-product reaction = add an event below and
// subscribe to it; never import one product from another.
//
// Payloads are intentionally small + serialisable (ids + display names), never
// whole ORM rows, so a subscriber re-reads what it needs through its own
// tenant-scoped client. clinicId is mandatory on every event: subscribers are
// multi-tenant and must scope their work to the originating clinic.

export interface DomainEventPayloads {
  // Emitted whenever a patient record is CREATED, by any route — the QR
  // self-registration page, the front desk, or their first WhatsApp message.
  // Emitted from the data source rather than from each caller, because "a new
  // producer forgets to announce it" is exactly how the clinic stops hearing
  // about half their new patients.
  'patient.registered': {
    clinicId: string;
    patientId: string;
    patientName?: string;
    patientCode?: string | null;
    phone?: string | null;
    /** 'staff' | 'public' | 'whatsapp' — how they arrived. */
    source?: string | null;
  };

  // Emitted by ClinicBook when a NEW appointment is booked (any channel: staff
  // dashboard, WhatsApp, waitlist promotion). Reminder/Analytics/Notification/
  // Calendar subscribers react — no path calls them directly.
  'appointment.booked': {
    clinicId: string;
    appointmentId: string;
    patientId?: string;
    doctorId?: string;
    patientName?: string;
    doctorName?: string;
    status?: string;
    // ISO date (YYYY-MM-DD) + display time; payloads stay serialisable.
    appointmentDate?: string;
    appointmentTime?: string;
  };

  // Emitted by ClinicBook when an appointment is cancelled. Waitlist recovery,
  // Analytics and Calendar (remove event) subscribe.
  'appointment.cancelled': {
    clinicId: string;
    appointmentId: string;
    patientId?: string;
    doctorId?: string;
    // WHICH slot was freed. Waitlist recovery subscribes to this instead of
    // being called from the cancel path, so core does not have to know that a
    // waitlist exists. Also reaches partner webhooks, where it is additive.
    appointmentDate?: Date;
    appointmentTime?: string;
  };

  // Emitted by ClinicBook when an appointment is moved to a new slot.
  'appointment.rescheduled': {
    clinicId: string;
    appointmentId: string;
    patientId?: string;
    doctorId?: string;
    appointmentDate?: string;
    appointmentTime?: string;
  };

  // Emitted by ClinicBook when a consultation is marked COMPLETED (post-visit
  // workflow). NovaScribe subscribes to open a draft consultation note.
  'appointment.completed': {
    clinicId: string;
    appointmentId: string;
    patientId?: string;
    doctorId?: string;
    patientName?: string;
    doctorName?: string;
  };

  // Emitted by NovaScribe when a doctor approves & locks a consultation note.
  // PatientLoop will subscribe (later) to schedule medicine reminders.
  'consultation.finalized': {
    clinicId: string;
    consultationNoteId: string;
    patientId?: string;
  };

  // Emitted by NovaScribe when a prescription is generated for a patient.
  // PatientLoop subscribes (later) to schedule medicine reminders.
  'prescription.generated': {
    clinicId: string;
    prescriptionId: string;
    patientId?: string;
    consultationNoteId?: string;
  };

  // Emitted by PatientLoop when a reminder (medicine/follow-up) is sent, so
  // Analytics and the caregiver dashboard can record delivery.
  'reminder.sent': {
    clinicId: string;
    reminderId?: string;
    patientId?: string;
    appointmentId?: string;
    kind?: string; // 'medicine' | 'follow-up' | 'appointment' | …
  };

  // Emitted by Billing on a successful payment. Analytics/Notification subscribe.
  'payment.success': {
    clinicId: string;
    paymentId?: string;
    patientId?: string;
    amount?: number;
    currency?: string;
  };
}

export type DomainEventName = keyof DomainEventPayloads;

export type DomainEventHandler<E extends DomainEventName> = (
  payload: DomainEventPayloads[E]
) => void | Promise<void>;
