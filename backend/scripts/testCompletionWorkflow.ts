/**
 * End-to-end test for the appointment completion workflow.
 *
 *   create (PENDING) → confirm (CONFIRMED) → complete (COMPLETED)
 *
 * Verifies: status transitions, CONFIRMED-only guard, audit fields
 * (completedAt/completedBy), and idempotency. Uses a fake phone so the
 * post-visit thank-you WhatsApp can't reach a real patient. Cleans up after.
 *
 *   Run:  npx tsx scripts/testCompletionWorkflow.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const {
  createAppointment,
  updateAppointment,
  completeAppointment
} = await import('../src/modules/appointments/appointment.service.js');

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
};

const run = async () => {
  const clinic = await prisma.clinic.findFirst({ select: { id: true, name: true } });
  const user = await prisma.user.findFirst({ where: { clinicId: clinic?.id }, select: { id: true } });
  const doctor = await prisma.doctor.findFirst({ where: { clinicId: clinic?.id }, select: { id: true } });
  if (!clinic || !user || !doctor) {
    throw new Error('Need a clinic + user + doctor in the DB to run this test.');
  }
  console.log(`Clinic: ${clinic.name} | user: ${user.id} | doctor: ${doctor.id}\n`);

  // Fake, non-deliverable phone so the thank-you WhatsApp can't reach anyone real.
  const patient = await prisma.patient.create({
    data: { clinicId: clinic.id, name: 'TEST Completion Patient', phone: '910000000001', language: 'English' },
    select: { id: true }
  });

  const createdIds: string[] = [];
  // A far-future date avoids clashing with the real roster's slot-unique index.
  const date = '2030-01-15';

  try {
    // 1. Create appointment → PENDING
    console.log('1) Create appointment');
    const a = await createAppointment(
      clinic.id,
      { doctorId: doctor.id, patientId: patient.id, appointmentDate: date, appointmentTime: '10:00 AM' },
      { notify: false }
    );
    createdIds.push(a.id);
    ok(a.status === 'PENDING', `new appointment is PENDING (got ${a.status})`);

    // 2. Guard: completing a PENDING appointment must be rejected
    console.log('2) Reject completing a PENDING appointment');
    let rejected = false;
    try {
      await completeAppointment(clinic.id, a.id, user.id);
    } catch (e) {
      rejected = true;
      console.log(`     rejected as expected: ${(e as Error).message}`);
    }
    ok(rejected, 'PENDING → COMPLETED is blocked (only CONFIRMED can complete)');

    // 3. Confirm → CONFIRMED
    console.log('3) Confirm appointment');
    const confirmed = await updateAppointment(clinic.id, a.id, { status: 'CONFIRMED' });
    ok(confirmed.status === 'CONFIRMED', `appointment is CONFIRMED (got ${confirmed.status})`);

    // 4. Complete → COMPLETED + audit fields
    console.log('4) Mark completed');
    const completed = await completeAppointment(clinic.id, a.id, user.id);
    ok(completed.status === 'COMPLETED', `appointment is COMPLETED (got ${completed.status})`);
    ok(!!completed.completedAt, 'completedAt timestamp is set');
    ok(completed.completedBy === user.id, `completedBy = acting user (${completed.completedBy})`);

    // 5. Verify directly in the DB
    console.log('5) Verify in DB');
    const dbRow = await prisma.appointment.findUnique({
      where: { id: a.id },
      select: { status: true, completedAt: true, completedBy: true }
    });
    ok(dbRow?.status === 'COMPLETED', `DB status is COMPLETED (got ${dbRow?.status})`);
    ok(!!dbRow?.completedAt && !!dbRow?.completedBy, 'DB has completedAt + completedBy persisted');

    // 6. Idempotency: completing again must not throw / not change anything
    console.log('6) Idempotent re-complete');
    const again = await completeAppointment(clinic.id, a.id, user.id);
    ok(again.status === 'COMPLETED', 're-completing returns COMPLETED without error');
    ok(again.completedAt?.getTime() === completed.completedAt?.getTime(), 'completedAt unchanged on re-complete');
  } finally {
    // Cleanup
    await prisma.appointment.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.patient.delete({ where: { id: patient.id } });
    console.log('\nCleaned up test data.');
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
};

run().catch(async (err) => {
  console.error('TEST ERROR:', err);
  await prisma.$disconnect();
  process.exit(1);
});
