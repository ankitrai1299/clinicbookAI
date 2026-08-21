import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { AUDIENCE, audienceFor } from './notification.audience.js';

// The clinic's actual flow, written down as tests:
//
//   patient scans the QR   →  the FRONT DESK hears it and confirms
//   the desk confirms      →  the DOCTOR hears "your consult is at 4:30"
//
// Before this, every notification went to both apps. That is not "more
// informative" — a doctor being told someone filled in a form, and a desk being
// told back what they themselves just confirmed, is how each app becomes noise
// to the person carrying it, and how they mute both.

describe('the registration → confirmation flow', () => {
  it('tells the FRONT DESK when a patient registers, not the doctor', () => {
    // Nothing is booked yet. There is nothing for a doctor to do with this.
    expect(audienceFor('PATIENT_REGISTERED')).toEqual(['clinicbook']);
  });

  it('tells the FRONT DESK about a booking request, because they confirm it', () => {
    // It arrives PENDING. It may never reach a doctor's day at all.
    expect(audienceFor('APPOINTMENT_BOOKED')).toEqual(['clinicbook']);
  });

  it('tells the DOCTOR once it is confirmed', () => {
    // Now it is real and it is on their day — this is the one they want.
    expect(audienceFor('APPOINTMENT_CONFIRMED')).toEqual(['mediscribe']);
  });
});

describe('changes to a doctor’s day reach both', () => {
  it('tells both when an appointment is cancelled or moved', () => {
    // A doctor turning up for a patient who is not coming is the failure this
    // prevents; the desk did the action and needs the record.
    for (const type of ['APPOINTMENT_CANCELLED', 'APPOINTMENT_RESCHEDULED']) {
      expect(audienceFor(type), type).toEqual(['clinicbook', 'mediscribe']);
    }
  });
});

describe('the desk keeps the bookkeeping', () => {
  it('does not tell a doctor what the doctor just did', () => {
    // Finalising a note and sending a prescription are actions the doctor took
    // seconds earlier. Notifying them is telling them their own news.
    for (const type of ['CONSULTATION_COMPLETED', 'PRESCRIPTION_SENT', 'APPOINTMENT_COMPLETED']) {
      expect(audienceFor(type), type).toEqual(['clinicbook']);
    }
  });

  it('sends operational trouble to whoever runs the clinic', () => {
    // Not to whoever is mid-consultation.
    expect(audienceFor('SYSTEM_ALERT')).toEqual(['clinicbook']);
  });
});

describe('the table cannot silently forget a type', () => {
  it('covers every notification type in the schema', () => {
    // A new enum value added without touching this table is the failure mode:
    // it would route by the fallback and nobody would notice which app was
    // supposed to get it.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const schema = fs.readFileSync(path.resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const block = schema.match(/enum NotificationType \{([\s\S]*?)\n\}/);
    expect(block, 'NotificationType enum not found').toBeTruthy();

    const values = block![1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'));

    const missing = values.filter((v) => !(v in AUDIENCE));
    expect(
      missing,
      'These notification types have no audience. Add them to AUDIENCE with the ' +
        'reason a doctor does or does not need them:\n  ' + missing.join('\n  ')
    ).toEqual([]);
  });

  it('sends an unknown type to both rather than nowhere', () => {
    // Getting an extra notification is a complaint. Silently getting none is a
    // bug nobody reports, because there is nothing to see.
    expect(audienceFor('SOMETHING_NEW')).toEqual(['clinicbook', 'mediscribe']);
  });

  it('never routes a type to an empty audience', () => {
    for (const [type, apps] of Object.entries(AUDIENCE)) {
      expect(apps.length, `${type} would reach nobody`).toBeGreaterThan(0);
    }
  });
});
