// Domain events → the clinic's notification feed (and therefore their phones).
//
// Appointments already notified, because those call sites reach
// recordNotification directly. Everything ELSE a clinic wants to know about —
// a new patient arriving, a doctor finishing a note, a prescription actually
// reaching someone — happened silently.
//
// Wired through the event bus rather than by editing each producer: the
// producers are spread across products (patients live in core, the scribe in
// products/mediscribe) and a product must not have to know that a notification
// feed exists in order to appear in it.
//
// WHAT IS DELIBERATELY NOT HERE
//
// "Notify on every movement" is easy to ask for and ruinous to receive. A feed
// that buzzes on every inbound WhatsApp message, every draft auto-save and every
// slot view is a feed people turn off within a day — and then the appointment
// they DID need to see is off too.
//
// So the rule used here is: notify when something crossed a line that a human
// may need to act on. A patient joining the clinic, a note being finalised, a
// prescription leaving the building. Not keystrokes, not drafts, not reads.

import { eventBus } from '../events/eventBus.js';
import { recordNotification } from './notification.service.js';

/** Idempotent — the app may be constructed more than once (tests do). */
let registered = false;

export const registerNotificationSubscriptions = (): void => {
  if (registered) return;
  registered = true;

  // ── A new patient exists ──────────────────────────────────────────────
  //
  // Emitted by the patient data source, so it fires whichever route created
  // them: the QR page, the front desk, booking's find-or-create, or a first
  // WhatsApp message. `source` is included because "who walked in" and "who
  // scanned the poster" are different facts to a clinic.
  eventBus.on('patient.registered', (p) => {
    const how =
      p.source === 'public'
        ? 'self-registered'
        : p.source === 'whatsapp'
          ? 'messaged on WhatsApp'
          : 'was added at the clinic';

    recordNotification({
      clinicId: p.clinicId,
      type: 'PATIENT_REGISTERED',
      title: 'New patient registered',
      // The name and code are what staff need to find them. No clinical detail:
      // this renders on a locked screen.
      body: `${p.patientName ?? 'A patient'}${p.patientCode ? ` (${p.patientCode})` : ''} ${how}.`
    });
  });

  // ── A doctor finalised a consultation note ────────────────────────────
  //
  // The moment the record becomes real: before this it is a draft the doctor is
  // still working on, and nothing may be sent from it.
  eventBus.on('consultation.finalized', (p) => {
    recordNotification({
      clinicId: p.clinicId,
      type: 'CONSULTATION_COMPLETED',
      title: 'Consultation completed',
      body: 'A doctor finalised a consultation note.'
    });
  });

  // ── A prescription reached the patient ────────────────────────────────
  eventBus.on('prescription.generated', (p) => {
    recordNotification({
      clinicId: p.clinicId,
      type: 'PRESCRIPTION_SENT',
      title: 'Prescription sent',
      body: 'A prescription was sent to the patient on WhatsApp.'
    });
  });
};
