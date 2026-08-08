// Waitlist recovery, wired as a SUBSCRIBER rather than a call from the cancel path.
//
// core/appointments emits `appointment.cancelled` carrying the slot that was
// just freed; this listens and offers it to the next waiting patient. Same
// behaviour as before, opposite direction: core no longer has to know a waitlist
// exists.
//
// That direction is what makes the products sellable apart. A clinic that bought
// only MediScribe never registers this, so nothing subscribes and cancelling
// simply doesn't produce a waitlist offer — instead of core failing to import a
// ClinicBook module that wasn't shipped.

import { eventBus } from '../../../core/events/index.js';
import { autoOfferFreedSlot } from './waitlist.service.js';

export const registerWaitlistRecovery = (): void => {
  eventBus.on('appointment.cancelled', (e) => {
    // A cancellation with no doctor or no slot frees nothing offerable. Both
    // fields are optional on the event because partner webhooks share it.
    if (!e.doctorId || !e.appointmentDate || !e.appointmentTime) return;
    void autoOfferFreedSlot(e.clinicId, e.doctorId, e.appointmentDate, e.appointmentTime).catch(
      (err: unknown) => console.error('[Waitlist] Auto-offer on cancellation failed:', err)
    );
  });
};
