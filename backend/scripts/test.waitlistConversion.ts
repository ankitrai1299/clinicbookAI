// Integration test for waitlist-conversion slot safety (P1-C fix).
//
// Scenario: Patient A books a slot. A waitlisted patient then tries to convert
// their entry into the SAME slot. The conversion must be rejected with a clean
// 409 and a patient-facing message, must NOT create a duplicate appointment, and
// must NOT leave the waitlist entry half-converted.
//
// Self-contained: creates an isolated throwaway clinic and deletes it (cascade)
// at the end, so it never touches real data. No WhatsApp sends (notify:false +
// status set directly). Run:
//
//   npx tsx scripts/test.waitlistConversion.ts
import { AppointmentStatus, WaitlistStatus } from '@prisma/client';

import { prisma } from '../src/config/prisma.js';
import { createAppointment } from '../src/modules/appointments/appointment.service.js';
import { convertWaitlistToAppointment } from '../src/modules/waitlist/waitlist.service.js';
import { AppError } from '../src/utils/AppError.js';

const stamp = Date.now();
const tag = `wl-conv-test-${stamp}`;
let clinicId = '';
let pass = true;

const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) pass = false;
};

const run = async () => {
  try {
    // --- Arrange: isolated clinic, doctor, two patients ---
    const clinic = await prisma.clinic.create({
      data: { name: tag, email: `${tag}@test.local`, phone: `+10000${stamp % 100000}` }
    });
    clinicId = clinic.id;
    const doctor = await prisma.doctor.create({
      data: { clinicId, name: 'Dr Test', speciality: 'General' }
    });
    const patientA = await prisma.patient.create({
      data: { clinicId, name: 'Patient A', phone: `+1111${stamp % 1000000}`, language: 'en' }
    });
    const patientW = await prisma.patient.create({
      data: { clinicId, name: 'Waitlist Patient', phone: `+1222${stamp % 1000000}`, language: 'en' }
    });

    const slot = { appointmentDate: '2099-12-31', appointmentTime: '02:30 PM' };

    // --- Act 1: Patient A books the slot ---
    const apptA = await createAppointment(
      clinicId,
      { patientId: patientA.id, doctorId: doctor.id, ...slot },
      { notify: false }
    );
    check('Patient A booking created', !!apptA.id);

    // Waitlisted patient W is OFFERED (set directly to avoid a real WhatsApp send)
    const entry = await prisma.waitlist.create({
      data: { clinicId, patientId: patientW.id, status: WaitlistStatus.OFFERED }
    });

    // --- Act 2: W attempts to convert into the SAME (taken) slot ---
    let caught: unknown;
    try {
      await convertWaitlistToAppointment(clinicId, entry.id, { doctorId: doctor.id, ...slot });
    } catch (e) {
      caught = e;
    }

    // --- Assert ---
    check('Conversion threw an error', caught !== undefined);
    check(
      'Error is a 409 conflict',
      caught instanceof AppError && caught.statusCode === 409,
      caught instanceof AppError ? `status=${caught.statusCode}` : 'not AppError'
    );
    check(
      'Patient-facing message correct',
      caught instanceof AppError &&
        caught.message === 'Sorry, this slot is no longer available. Please choose another available time.',
      caught instanceof Error ? `"${caught.message}"` : ''
    );

    const activeForSlot = await prisma.appointment.count({
      where: {
        clinicId,
        doctorId: doctor.id,
        appointmentDate: new Date(slot.appointmentDate),
        appointmentTime: slot.appointmentTime,
        status: { not: AppointmentStatus.CANCELLED }
      }
    });
    check('No duplicate appointment created (exactly 1 active for slot)', activeForSlot === 1, `count=${activeForSlot}`);

    const entryAfter = await prisma.waitlist.findUnique({
      where: { id: entry.id },
      select: { status: true }
    });
    check(
      'Waitlist entry NOT half-converted (still OFFERED)',
      entryAfter?.status === WaitlistStatus.OFFERED,
      `status=${entryAfter?.status}`
    );
  } finally {
    // --- Cleanup: deleting the clinic cascades to all created test rows ---
    if (clinicId) await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => {});
    await prisma.$disconnect();
  }
};

run()
  .then(() => {
    console.log(pass ? '\nALL ASSERTIONS PASSED' : '\nSOME ASSERTIONS FAILED');
    process.exit(pass ? 0 : 1);
  })
  .catch(async (e) => {
    console.error('TEST ERROR', e);
    if (clinicId) await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => {});
    process.exit(1);
  });
