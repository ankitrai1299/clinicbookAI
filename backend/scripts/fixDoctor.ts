/**
 * Correct one doctor's name or speciality, without touching anything else.
 *
 *   DOCTOR_ID=<id> NEW_NAME="Dr. X" NEW_SPECIALITY="General Physician" \
 *     railway run npx tsx scripts/fixDoctor.ts
 *   … COMMIT=yes …   to actually write it
 *
 * Why this is a script and not a dashboard edit: a speciality typed in once
 * with a typo ("genral physican") becomes a second entry in the speciality
 * list a patient is offered on WhatsApp — two options that are the same
 * speciality, one of which is spelled wrong. The dashboard can fix it, but only
 * if somebody notices; this makes it a one-liner when they do.
 *
 * Deliberately narrow: ONE doctor, named by id, and it never deletes. A doctor
 * with appointments against them keeps every one of them — the id does not
 * change, so nothing that points at this doctor is disturbed.
 */
const DB_URL = process.env.DATABASE_URL;
const DOCTOR_ID = (process.env.DOCTOR_ID || '').trim();
const NEW_NAME = (process.env.NEW_NAME || '').trim();
const NEW_SPECIALITY = (process.env.NEW_SPECIALITY || '').trim();
const COMMIT = process.env.COMMIT === 'yes';

if (!DB_URL) throw new Error('DATABASE_URL is required — run under `railway run`.');
if (!DOCTOR_ID) throw new Error('DOCTOR_ID is required.');
if (!NEW_NAME && !NEW_SPECIALITY) throw new Error('Give NEW_NAME, NEW_SPECIALITY, or both.');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const doctor = await prisma.doctor.findUnique({
  where: { id: DOCTOR_ID },
  select: {
    id: true,
    name: true,
    speciality: true,
    clinicId: true,
    clinic: { select: { name: true } },
    _count: { select: { appointments: true, schedules: true } }
  }
});
if (!doctor) throw new Error(`No doctor with id ${DOCTOR_ID}. Nothing was changed.`);

console.log(`\nClinic: ${doctor.clinic?.name}`);
console.log(`  name:       ${doctor.name}${NEW_NAME ? `   →   ${NEW_NAME}` : '   (unchanged)'}`);
console.log(`  speciality: ${doctor.speciality}${NEW_SPECIALITY ? `   →   ${NEW_SPECIALITY}` : '   (unchanged)'}`);
console.log(`  keeps ${doctor._count.appointments} appointment(s) and ${doctor._count.schedules} schedule row(s).`);

// (clinicId, name) is unique, so a rename onto a name already in use would fail
// mid-write. Better to say so first.
if (NEW_NAME && NEW_NAME !== doctor.name) {
  const clash = await prisma.doctor.findFirst({
    where: { clinicId: doctor.clinicId, name: NEW_NAME },
    select: { id: true }
  });
  if (clash) throw new Error(`This clinic already has a doctor called "${NEW_NAME}". Nothing was changed.`);
}

if (!COMMIT) {
  console.log('\nDRY RUN — nothing written. Re-run with COMMIT=yes.');
} else {
  await prisma.doctor.update({
    where: { id: DOCTOR_ID },
    data: {
      ...(NEW_NAME ? { name: NEW_NAME } : {}),
      ...(NEW_SPECIALITY ? { speciality: NEW_SPECIALITY } : {})
    }
  });
  console.log('\nDone.');
}

await prisma.$disconnect();
process.exit(0);
