// Wires NovaScribe to the internal event bus. Called once at app startup
// (createApp). This is the ONLY coupling point between ClinicBook and NovaScribe,
// and it flows the right way: NovaScribe subscribes to a ClinicBook event —
// ClinicBook never imports NovaScribe.

import { eventBus } from '../../core/events/index.js';
import { createConsultationDraft } from './novascribe.service.js';

let registered = false;

export const registerNovaScribeSubscriptions = (): void => {
  // Idempotent: createApp may run more than once (e.g. across tests).
  if (registered) {
    return;
  }
  registered = true;

  // When a consultation is completed, open a draft note ready for the transcript.
  eventBus.on('appointment.completed', async (payload) => {
    await createConsultationDraft({
      clinicId: payload.clinicId,
      appointmentId: payload.appointmentId,
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      patientName: payload.patientName,
      doctorName: payload.doctorName
    });
  });
};
