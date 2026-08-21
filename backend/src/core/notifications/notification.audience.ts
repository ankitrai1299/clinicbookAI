// WHICH app each notification belongs to. PURE — no imports beyond the type.
//
// This started out sending every notification to both apps, which was wrong and
// obviously so once the clinic described how they actually work:
//
//   patient scans the QR       →  the FRONT DESK is told, and confirms it
//   the desk confirms          →  the DOCTOR is told "your consult is at 4:30"
//
// A doctor does not want to hear that someone filled in a registration form;
// they want to hear when a patient has actually been booked onto their day. And
// the desk does not need the doctor's confirmation echoed back at them. Sending
// both to both is not "more informative" — it is how each app becomes noise to
// the person carrying it, and how they mute both.
//
// So the audience is a TABLE, not a default. It is here, on its own, because it
// is a policy a clinic will want changed — and changing it should be one edit in
// one obvious place, not a hunt through call sites.

import type { PushProduct } from './push.service.js';

/** Every notification type the system produces. Mirrors the Prisma enum. */
export type NotificationKind =
  | 'APPOINTMENT_BOOKED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_COMPLETED'
  | 'PATIENT_REGISTERED'
  | 'CONSULTATION_COMPLETED'
  | 'PRESCRIPTION_SENT'
  | 'SYSTEM_ALERT';

const DESK: PushProduct[] = ['clinicbook'];
const DOCTOR: PushProduct[] = ['mediscribe'];
const BOTH: PushProduct[] = ['clinicbook', 'mediscribe'];

/**
 * Who hears about what.
 *
 * The comment on each line is the reason, because "why does the doctor not get
 * this one?" is the question this table exists to answer.
 */
export const AUDIENCE: Record<NotificationKind, PushProduct[]> = {
  // Someone filled in the registration form or messaged for the first time.
  // Nothing is booked yet; this is front-desk work.
  PATIENT_REGISTERED: DESK,

  // A booking REQUEST. It arrives PENDING and the desk has to confirm it — so
  // it goes to the people who confirm, not to the doctor whose day it might
  // never end up on.
  APPOINTMENT_BOOKED: DESK,

  // Now it is real and it is on a doctor's day. This is the one the doctor
  // wants: "X's appointment with you at 4:30 was confirmed."
  APPOINTMENT_CONFIRMED: DOCTOR,

  // The doctor's day CHANGED. Both need it: the desk did it, the doctor is
  // affected by it, and a doctor turning up for a patient who is not coming is
  // the failure this prevents.
  APPOINTMENT_CANCELLED: BOTH,
  APPOINTMENT_RESCHEDULED: BOTH,

  // Closing the visit is desk bookkeeping. The doctor was there.
  APPOINTMENT_COMPLETED: DESK,

  // The doctor just pressed Save — telling them is telling them what they did.
  // The DESK is who needs to know the note is finished.
  CONSULTATION_COMPLETED: DESK,
  PRESCRIPTION_SENT: DESK,

  // Operational trouble — WhatsApp failing, a token expired. Whoever runs the
  // clinic, not whoever is mid-consultation.
  SYSTEM_ALERT: DESK
};

/**
 * The apps to push a notification of this type to.
 *
 * An unknown type — a new enum value someone added without touching this table —
 * goes to BOTH rather than nowhere. Getting an extra notification is a
 * complaint; silently getting none is a bug nobody reports because there is
 * nothing to see.
 */
export const audienceFor = (type: string): PushProduct[] =>
  AUDIENCE[type as NotificationKind] ?? BOTH;
