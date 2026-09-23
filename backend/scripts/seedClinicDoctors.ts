/**
 * Give a clinic a realistic set of doctors with weekly schedules, so booking can
 * be tested against something that behaves like a real clinic instead of one
 * doctor with one slot.
 *
 *   CLINIC_ID=<id> railway run npx tsx scripts/seedClinicDoctors.ts
 *   CLINIC_ID=<id> COMMIT=yes railway run npx tsx scripts/seedClinicDoctors.ts
 *
 * Additive and idempotent:
 *   • a doctor whose name already exists in that clinic is left untouched,
 *   • no doctor is ever deleted, renamed or re-specialised,
 *   • schedules are upserted per (doctor, weekday), so re-running repairs a
 *     missing day rather than stacking duplicates.
 *
 * Nothing here belongs to a patient, so removing it later is safe — except that
 * a doctor with appointments against them should be left alone, which is why
 * this never deletes.
 */
const DB_URL = process.env.DATABASE_URL;
const CLINIC_ID = (process.env.CLINIC_ID || '').trim();
const COMMIT = process.env.COMMIT === 'yes';

if (!DB_URL) throw new Error('DATABASE_URL is required — run under `railway run`.');
if (!CLINIC_ID) throw new Error('CLINIC_ID is required.');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

// Specialities a small Indian clinic actually staffs, and the hours they
// actually keep: a morning OPD, an evening OPD, and one doctor on Sunday
// mornings — because "is anyone there on Sunday" is a real booking question and
// a schedule that never says no proves nothing.
type Shift = { days: number[]; start: string; end: string; slot: number };
const MORNING: Shift = { days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '13:00', slot: 15 };
const EVENING: Shift = { days: [1, 2, 3, 4, 5], start: '17:00', end: '20:30', slot: 20 };
const FULL: Shift = { days: [1, 2, 3, 4, 5, 6], start: '10:00', end: '18:00', slot: 30 };
const ALT: Shift = { days: [2, 4, 6], start: '11:00', end: '16:00', slot: 30 };
const SUNDAY: Shift = { days: [0, 1, 3, 5], start: '09:30', end: '14:00', slot: 20 };

const DOCTORS: Array<{ name: string; speciality: string; years: number; shift: Shift }> = [
  { name: 'Dr. Ankit Rai',        speciality: 'General Physician', years: 12, shift: MORNING },
  { name: 'Dr. Meera Iyer',       speciality: 'General Physician', years: 8,  shift: EVENING },
  { name: 'Dr. Sunita Deshmukh',  speciality: 'Gynaecologist',     years: 15, shift: MORNING },
  { name: 'Dr. Rajesh Verma',     speciality: 'Paediatrician',     years: 10, shift: FULL },
  { name: 'Dr. Farah Qureshi',    speciality: 'Dermatologist',     years: 6,  shift: ALT },
  { name: 'Dr. Vikram Nair',      speciality: 'Orthopaedic',       years: 18, shift: EVENING },
  { name: 'Dr. Anjali Sharma',    speciality: 'Dentist',           years: 9,  shift: FULL },
  { name: 'Dr. Imran Shaikh',     speciality: 'ENT',               years: 11, shift: ALT },
  { name: 'Dr. Kavita Menon',     speciality: 'Cardiologist',      years: 20, shift: SUNDAY },
  { name: 'Dr. Arjun Patel',      speciality: 'Psychiatrist',      years: 7,  shift: EVENING }
];

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const clinic = await prisma.clinic.findUnique({
  where: { id: CLINIC_ID },
  select: { id: true, name: true, email: true }
});
if (!clinic) throw new Error(`No clinic with id ${CLINIC_ID}. Nothing was changed.`);

const existing = await prisma.doctor.findMany({
  where: { clinicId: CLINIC_ID },
  select: { id: true, name: true, speciality: true }
});

console.log(`\nClinic: ${clinic.name}  <${clinic.email}>`);
console.log(`Doctors already there: ${existing.length}${existing.length ? ' — ' + existing.map((d) => d.name).join(', ') : ''}`);
console.log(COMMIT ? '\nWRITING to this database.\n' : '\nDRY RUN — nothing will be written. Re-run with COMMIT=yes.\n');

let added = 0;
let scheduled = 0;

for (const d of DOCTORS) {
  const already = existing.find((e) => e.name === d.name);
  const hours = `${d.shift.start}–${d.shift.end}  ${d.shift.days.map((n) => DAY[n]).join(' ')}  ${d.shift.slot}min slots`;
  console.log(`${already ? 'exists ' : 'NEW    '} ${d.name.padEnd(22)} ${d.speciality.padEnd(18)} ${hours}`);
  if (!COMMIT) continue;

  const doctor = already
    ? await prisma.doctor.findUniqueOrThrow({ where: { id: already.id } })
    : await prisma.doctor.create({
        data: {
          clinicId: CLINIC_ID,
          name: d.name,
          speciality: d.speciality,
          experienceYears: d.years
        }
      });
  if (!already) added++;

  for (const day of d.shift.days) {
    await prisma.doctorSchedule.upsert({
      where: { doctorId_dayOfWeek: { doctorId: doctor.id, dayOfWeek: day } },
      update: { startTime: d.shift.start, endTime: d.shift.end, slotMinutes: d.shift.slot, isActive: true },
      create: {
        clinicId: CLINIC_ID,
        doctorId: doctor.id,
        dayOfWeek: day,
        startTime: d.shift.start,
        endTime: d.shift.end,
        slotMinutes: d.shift.slot,
        isActive: true
      }
    });
    scheduled++;
  }
}

if (COMMIT) {
  const total = await prisma.doctor.count({ where: { clinicId: CLINIC_ID } });
  console.log(`\nAdded ${added} doctor(s); wrote ${scheduled} weekly schedule rows.`);
  console.log(`${clinic.name} now has ${total} doctors.`);
} else {
  console.log(`\nWould add ${DOCTORS.filter((d) => !existing.some((e) => e.name === d.name)).length} doctor(s).`);
}

await prisma.$disconnect();
process.exit(0);
