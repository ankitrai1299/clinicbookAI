// Close the loop between the two apps: when a doctor FINALIZES a consultation in
// MediScribe, the ClinicBook appointment it belongs to is marked COMPLETED on its
// own. Nobody has to remember to click "Mark Completed" on the roster afterwards.
//
// A finalized note is the strongest evidence a visit actually happened — the
// doctor documented it — which is exactly why completion hangs off this event
// rather than off the clock. An appointment whose time simply passed proves
// nothing: the patient may never have arrived, and auto-completing them would
// send a "thank you for visiting" WhatsApp to someone who never came and erase
// the distinction from NO_SHOW.
//
// Everything here is BEST-EFFORT. Saving the consultation is the doctor's work
// and must never fail because the roster could not be updated.

import { AppointmentStatus } from '@prisma/client';

import { forClinic } from '../../config/tenantPrisma.js';
import {
  completeAppointment,
  updateAppointment
} from '../clinicbook/appointments/appointment.service.js';
import { clinicNow } from '../../services/slotMath.js';

const LIVE: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

export interface FinalizedConsultation {
  id?: string;
  patientId?: string;
  // Set when the session was started from Today's Queue — the exact visit being
  // documented. Absent when the doctor started from "New Consultation".
  appointmentId?: string;
  doctorName?: string;
}

/**
 * PURE: pick which appointment a finalized consultation closes.
 *
 * Refuses to guess. With two live appointments for the same patient on the same
 * day we cannot tell which one the note documents, and completing the wrong one
 * would fire a thank-you for a visit that has not happened yet — so we return
 * null and leave both for staff. Exported for unit tests.
 */
export const pickAppointmentToComplete = <T extends { id: string }>(
  candidates: T[],
  explicitId?: string
): T | null => {
  if (explicitId) return candidates.find((a) => a.id === explicitId) ?? null;
  return candidates.length === 1 ? candidates[0] : null;
};

/**
 * Mark the appointment behind a just-finalized consultation as COMPLETED.
 * Resolves the visit from an explicit appointmentId when the session was started
 * from Today's Queue, otherwise from the patient's single live appointment today.
 */
export const completeAppointmentForConsultation = async (
  clinicId: string,
  consultation: FinalizedConsultation
): Promise<{ completed: boolean; reason: string }> => {
  if (!consultation.patientId && !consultation.appointmentId) {
    return { completed: false, reason: 'consultation has no patient or appointment' };
  }

  const today = clinicNow().dateStr;
  const db = forClinic(clinicId);

  // Today only. A note finalized days later is a back-fill, and silently closing
  // an old appointment would fire a thank-you long after the fact.
  const candidates = await db.appointment.findMany({
    where: {
      status: { in: LIVE },
      ...(consultation.appointmentId
        ? { id: consultation.appointmentId }
        : {
            patientId: consultation.patientId,
            appointmentDate: {
              gte: new Date(`${today}T00:00:00.000Z`),
              lte: new Date(`${today}T23:59:59.999Z`)
            }
          })
    },
    select: { id: true, status: true }
  });

  const target = pickAppointmentToComplete(candidates, consultation.appointmentId);
  if (!target) {
    return {
      completed: false,
      reason:
        candidates.length > 1
          ? `${candidates.length} live appointments today — ambiguous, left for staff`
          : 'no live appointment found for this visit'
    };
  }

  // WhatsApp bookings land as PENDING, and only a CONFIRMED appointment may be
  // completed. The doctor having documented the visit settles the question the
  // confirmation step exists to answer, so walk it through PENDING → CONFIRMED
  // rather than stopping short and leaving the roster stale.
  if (target.status === AppointmentStatus.PENDING) {
    await updateAppointment(clinicId, target.id, { status: AppointmentStatus.CONFIRMED });
  }

  // completeAppointment is idempotent, race-guarded, and runs the post-visit
  // workflow (thank-you WhatsApp + staff notification) exactly once.
  await completeAppointment(clinicId, target.id, consultation.doctorName || 'MediScribe');
  return { completed: true, reason: `appointment ${target.id} completed` };
};
