/**
 * Idempotent setup for the public landing-page showcase clinic.
 * Creates one REAL clinic + doctors + weekly schedules in the database so the
 * marketing booking funnel runs on live data (no hardcoded demo data in code).
 *
 *   Run:  npx tsx scripts/seedShowcaseClinic.ts
 *
 * Prints the clinic id — put it in the frontend env as VITE_PUBLIC_CLINIC_ID.
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const CLINIC = {
  name: 'NextClinic Demo',
  email: 'showcase@nextclinic.demo',
  phone: '+919650803090'
};

const DOCTORS = [
  { name: 'Dr. Asha Mehta', speciality: 'General Physician' },
  { name: 'Dr. Rohan Verma', speciality: 'Dermatologist' },
  { name: 'Dr. Neha Kapoor', speciality: 'Pediatrician' },
  { name: 'Dr. Sameer Khan', speciality: 'Orthopedic' }
];

// Mon–Sat 09:00–17:00, 30-min slots. (Sunday = 0 is off.)
const WORK_DAYS = [1, 2, 3, 4, 5, 6];

const run = async () => {
  const clinic = await prisma.clinic.upsert({
    where: { email: CLINIC.email },
    create: CLINIC,
    update: { name: CLINIC.name },
    select: { id: true, name: true }
  });
  console.log(`Clinic: ${clinic.name} (${clinic.id})`);

  for (const d of DOCTORS) {
    const doctor = await prisma.doctor.upsert({
      where: { clinicId_name: { clinicId: clinic.id, name: d.name } },
      create: { clinicId: clinic.id, name: d.name, speciality: d.speciality },
      update: { speciality: d.speciality },
      select: { id: true, name: true }
    });

    for (const dayOfWeek of WORK_DAYS) {
      await prisma.doctorSchedule.upsert({
        where: { doctorId_dayOfWeek: { doctorId: doctor.id, dayOfWeek } },
        create: {
          clinicId: clinic.id,
          doctorId: doctor.id,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          slotMinutes: 30,
          isActive: true
        },
        update: { startTime: '09:00', endTime: '17:00', slotMinutes: 30, isActive: true }
      });
    }
    console.log(`  ✓ ${doctor.name} (${d.speciality}) — Mon–Sat 09:00–17:00`);
  }

  console.log(`\nDone. Set VITE_PUBLIC_CLINIC_ID=${clinic.id} in the frontend .env`);
  await prisma.$disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
