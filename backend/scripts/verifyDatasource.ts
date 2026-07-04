// ===========================================================================
// Local verification harness for the data-source refactor. Runs against the
// LOCAL dev DB (clinicbook_dev) — importing config/env applies .env.local
// override, so it NEVER touches live. It seeds minimal, idempotent fixtures and
// exercises each MIGRATED domain THROUGH the service/port layer the booking flow
// uses, asserting behaviour is intact. Grow this as each domain is migrated.
//
//   npx tsx scripts/verifyDatasource.ts
// ===========================================================================
import './../src/config/env.js';
import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';
import {
  dataSourceFor,
  registerExternalDataSource,
  clearExternalDataSources
} from '../src/core/datasource/index.js';
import { mockEmrDataSource } from '../src/integrations/emr/mock/mockEmrDataSource.js';
import {
  getDoctors,
  getDoctorSchedule,
  setDoctorSchedule
} from '../src/core/doctors/doctor.service.js';
import {
  createAppointment,
  updateAppointment,
  cancelAppointment,
  getAppointments,
  getSingleAppointment
} from '../src/products/clinicbook/appointments/appointment.service.js';

const DOC_NAME = 'Dr. Verify Bot';
const SPECIALITY = 'Cardiology';

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
};

async function ensureFixtures(clinicId: string): Promise<string> {
  // Idempotent doctor by name (native path, not the port under test).
  let doc = await prisma.doctor.findFirst({ where: { clinicId, name: DOC_NAME } });
  if (!doc) {
    doc = await prisma.doctor.create({
      data: { clinicId, name: DOC_NAME, speciality: SPECIALITY }
    });
  }
  // Weekly schedule for every day 09:00–17:00, 30-min slots (via the service).
  const existing = await getDoctorSchedule(clinicId, doc.id);
  if (existing.length === 0) {
    await setDoctorSchedule(clinicId, doc.id, {
      entries: Array.from({ length: 7 }, (_, d) => ({
        dayOfWeek: d, startTime: '09:00', endTime: '17:00', slotMinutes: 30, isActive: true
      }))
    });
  }
  return doc.id;
}

async function main() {
  const clinic = await prisma.clinic.findFirst({ select: { id: true, name: true } });
  if (!clinic) throw new Error('No clinic in local DB — run scripts/seedDev.ts first.');
  console.log(`Clinic: ${clinic.name} (${clinic.id})\n`);

  const doctorId = await ensureFixtures(clinic.id);
  const ds = dataSourceFor(clinic.id);

  console.log('DOCTORS domain (via DoctorPort):');
  const list = await getDoctors(clinic.id);
  check('getDoctors returns the seeded doctor', list.some((d) => d.id === doctorId));

  const specs = await ds.doctors.listSpecialities();
  check('listSpecialities includes seeded speciality, sorted+distinct',
    specs.includes(SPECIALITY) && specs.every((s, i) => i === 0 || specs[i - 1].localeCompare(s) <= 0),
    specs);

  const bySpec = await ds.doctors.listBySpeciality(SPECIALITY.toLowerCase());
  check('listBySpeciality is case-insensitive + returns the doctor',
    bySpec.some((d) => d.id === doctorId), bySpec.map((d) => d.name));

  const names = await ds.doctors.listNames();
  check('listNames includes the doctor', names.includes(DOC_NAME));

  const refs = await ds.doctors.listRefs();
  check('listRefs shape is {id,name,speciality}',
    refs.length > 0 && refs.every((r) => 'id' in r && 'name' in r && 'speciality' in r));

  console.log('\nSLOTS domain (via SlotPort):');
  // Pick a near future date that is a working day (schedule covers all 7 days).
  // Use a fixed early-morning clock so the whole 09:00–17:00 range is "future".
  const target = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const dateStr = target.toISOString().slice(0, 10);
  const earlyClock = new Date(`${dateStr}T00:30:00.000Z`); // 06:00 IST — before all slots

  const slots = await ds.slots.getAvailable(doctorId, dateStr, earlyClock);
  check('getAvailable returns full 09:00–17:00 grid (16 slots) on a working day',
    slots.length === 16 && slots[0] === '09:00 AM' && slots[slots.length - 1] === '04:30 PM',
    { count: slots.length, first: slots[0], last: slots[slots.length - 1] });

  const avail = await ds.slots.getDateAvailability(doctorId, dateStr);
  check('getDateAvailability reports working day', avail.working === true, avail);

  const okTime = await ds.slots.isAvailable(doctorId, dateStr, '10:00 AM');
  const badTime = await ds.slots.isAvailable(doctorId, dateStr, 'not-a-time');
  check('isAvailable true for a real open slot, false for garbage', okTime === true && badTime === false,
    { okTime, badTime });

  console.log('\nAPPOINTMENTS domain (via AppointmentPort):');
  // Idempotent test patient (Patients domain not migrated yet — seed directly).
  const patient = await prisma.patient.upsert({
    where: { clinicId_phone: { clinicId: clinic.id, phone: '+910000000001' } },
    update: {},
    create: { clinicId: clinic.id, phone: '+910000000001', name: 'Verify Patient', language: 'en' }
  });
  const bookTime = '11:00 AM';

  const booked = await createAppointment(
    clinic.id,
    { doctorId, patientId: patient.id, appointmentDate: dateStr, appointmentTime: bookTime },
    { notify: false }
  );
  check('createAppointment books PENDING with joined doctor+patient',
    booked.status === AppointmentStatus.PENDING && booked.doctor?.id === doctorId && booked.patient?.id === patient.id,
    { status: booked.status });

  // Atomic slot-lock: booking the SAME doctor/date/time again must 409.
  let conflict409 = false;
  try {
    await createAppointment(
      clinic.id,
      { doctorId, patientId: patient.id, appointmentDate: dateStr, appointmentTime: bookTime },
      { notify: false }
    );
  } catch (e: any) { conflict409 = e?.statusCode === 409 || e?.status === 409; }
  check('double-booking the same slot throws 409', conflict409);

  const confirmed = await updateAppointment(clinic.id, booked.id, { status: AppointmentStatus.CONFIRMED });
  check('updateAppointment confirms (PENDING→CONFIRMED)', confirmed.status === AppointmentStatus.CONFIRMED);

  const single = await getSingleAppointment(clinic.id, booked.id);
  check('getSingleAppointment returns the booking', single.id === booked.id);

  const all = await getAppointments(clinic.id);
  check('getAppointments includes the booking', all.some((a) => a.id === booked.id));

  const cancelled = await cancelAppointment(clinic.id, booked.id);
  check('cancelAppointment cancels (frees the slot)', cancelled.status === AppointmentStatus.CANCELLED);

  // Slot is free again after cancel → getAvailable lists it once more.
  const freed = await ds.slots.getAvailable(doctorId, dateStr, earlyClock);
  check('cancelled slot is bookable again', freed.includes(bookTime));

  console.log('\nPATIENTS domain (via PatientPort):');
  const byPhone = await ds.patients.findByPhone('+910000000001');
  check('findByPhone returns the exact-match patient', byPhone?.id === patient.id);

  const plist = await ds.patients.list();
  check('list includes the patient', plist.some((p) => p.id === patient.id));

  const byId = await ds.patients.findById(patient.id);
  check('findById returns the patient', byId?.id === patient.id);

  const contains = await ds.patients.findByPhoneContains('0000000001');
  check('findByPhoneContains matches on a digit fragment', contains.some((p) => p.id === patient.id));

  // create mints a unique PT- code (idempotent via a fixed phone).
  const createPhone = '+910000000002';
  const created = (await ds.patients.findByPhone(createPhone))
    ?? (await ds.patients.create({ name: 'Coded Patient', phone: createPhone, language: 'English' }));
  check('create mints a unique PT- patientCode', /^PT-[A-Z2-9]{6}$/.test(created.patientCode ?? ''), created.patientCode);

  // onboard is the channel auto-onboard: source-tagged, no code (idempotent).
  const onboardPhone = '+910000000003';
  const onboarded = (await ds.patients.findByPhone(onboardPhone))
    ?? (await ds.patients.onboard({ name: 'WA Patient 0003', phone: onboardPhone, language: 'English', source: 'whatsapp' }));
  check('onboard tags source=whatsapp and mints no code',
    onboarded.source === 'whatsapp' && !onboarded.patientCode, { source: onboarded.source, code: onboarded.patientCode });

  console.log('\nEMR SEAM PROOF (mock external EMR via resolver):');
  const EMR_CLINIC = 'emr-clinic-test';
  clearExternalDataSources();
  registerExternalDataSource((cid) => (cid === EMR_CLINIC ? mockEmrDataSource(cid) : null));

  // Same call site, different clinic → data comes from the EMR adapter, not Postgres.
  const emrDocs = await dataSourceFor(EMR_CLINIC).doctors.listRefs();
  check('EMR clinic doctors come from the EMR adapter (not Postgres)',
    emrDocs.length === 2 && emrDocs.every((d) => d.id.startsWith('emr-doc-')),
    emrDocs.map((d) => d.name));

  const emrSpecs = await dataSourceFor(EMR_CLINIC).doctors.listSpecialities();
  check('EMR clinic specialities from adapter', emrSpecs.join(',') === 'Cardiology,Dermatology', emrSpecs);

  const emrSlots = await dataSourceFor(EMR_CLINIC).slots.getAvailable('emr-doc-1', dateStr);
  check('EMR clinic slots from adapter', emrSlots.length === 5 && emrSlots[0] === '09:00 AM', emrSlots);

  // The REAL clinic is untouched by the EMR registration — still native/Postgres.
  const nativeStill = await dataSourceFor(clinic.id).doctors.listNames();
  check('native clinic still served by Postgres (EMR reg does not leak)',
    nativeStill.includes(DOC_NAME) && !nativeStill.some((n) => n.includes('(EMR)')), nativeStill);

  clearExternalDataSources();

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERR:', e); process.exit(1); });
