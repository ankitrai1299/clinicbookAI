// Post-visit workflow: everything that should happen automatically AFTER a
// consultation is marked COMPLETED. This is the single extension point so new
// after-visit behaviour can be added without touching completeAppointment.
//
// Currently live:
//   • Thank-you WhatsApp message to the patient.
//
// Future-ready (register more actions here as they're built):
//   • Feedback request        — ask the patient how the visit went
//   • Rating request          — 1–5 star rating of the doctor/clinic
//   • Follow-up booking nudge  — remind them to book a follow-up
//   • Prescription reminder    — remind them to take / refill medication
//
// Each action is fire-and-forget and ISOLATED: one throwing must never block the
// others or the HTTP response that triggered completion.

import { eventBus } from '../../../core/events/index.js';
import { notifyAppointmentCompleted } from '../../../core/whatsapp/whatsapp.notifications.js';
import type { AppointmentRecord } from './appointment.service.js';

export type PostVisitAction = (appt: AppointmentRecord) => void | Promise<void>;

// The thank-you message is the first registered action. Add more by pushing to
// this list (or via registerPostVisitAction from another module's init).
const postVisitActions: PostVisitAction[] = [
  function sendThankYouMessage(appt) {
    if (appt.patient?.phone && appt.doctor && appt.clinic) {
      notifyAppointmentCompleted({
        to: appt.patient.phone,
        clinicId: appt.clinicId,
        patientName: appt.patient.name,
        doctorName: appt.doctor.name,
        clinicName: appt.clinic.name
      });
    }
  },
  // Publish a cross-product domain event so OTHER products (e.g. NovaScribe,
  // which opens a draft consultation note) can react WITHOUT ClinicBook
  // importing them. Isolated like every other action: emit never throws.
  function publishAppointmentCompleted(appt) {
    eventBus.emit('appointment.completed', {
      clinicId: appt.clinicId,
      appointmentId: appt.id,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      patientName: appt.patient?.name,
      doctorName: appt.doctor?.name
    });
  }
  // registerPostVisitAction(requestFeedback)
  // registerPostVisitAction(requestRating)
  // registerPostVisitAction(followUpReminder)
  // registerPostVisitAction(prescriptionReminder)
];

// Let other modules add their own post-visit behaviour (e.g. at startup).
export const registerPostVisitAction = (action: PostVisitAction): void => {
  postVisitActions.push(action);
};

// Runs every registered post-visit action. Never throws — each action is wrapped
// so a single failure can't break completion or the remaining actions.
export const runPostVisitWorkflow = (appt: AppointmentRecord): void => {
  for (const action of postVisitActions) {
    try {
      void Promise.resolve(action(appt)).catch((err) =>
        console.error(`[PostVisit] action "${action.name || 'anonymous'}" failed:`, err)
      );
    } catch (err) {
      console.error(`[PostVisit] action "${action.name || 'anonymous'}" threw synchronously:`, err);
    }
  }
};
