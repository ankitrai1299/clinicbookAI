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
import { forClinic } from '../src/config/tenantPrisma.js';
import {
  dataSourceFor,
  registerExternalDataSource,
  clearExternalDataSources
} from '../src/core/datasource/index.js';
import { mockEmrDataSource } from '../src/integrations/emr/mock/mockEmrDataSource.js';
import { link, toExternal, toLocal } from '../src/integrations/emr/externalIdMap.service.js';
import { syncThroughDataSource } from '../src/integrations/emr/openemr/syncThrough.js';
import { ensureShadowDoctor, ensureShadowPatient } from '../src/integrations/emr/openemr/shadowSync.js';
import { openEmrAppointments } from '../src/integrations/emr/openemr/openEmrAppointments.js';
import { FhirClient, type FhirTransport } from '../src/integrations/emr/fhir/fhirClient.js';
import { nativeAppointments } from '../src/products/clinicbook/appointments/appointment.native.js';
import {
  appointmentSourceFor,
  registerExternalAppointmentSource,
  clearExternalAppointmentSources
} from '../src/products/clinicbook/appointments/appointmentSource.js';
import type { PatientRecord } from '../src/core/datasource/ports.js';
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

  // The REAL clinic is untouched by an EMR registration scoped to ANOTHER clinic
  // — still served natively from Postgres (its seeded doctor is present).
  const nativeStill = await dataSourceFor(clinic.id).doctors.listNames();
  check('native clinic still served by Postgres (EMR reg for another clinic does not leak)',
    nativeStill.includes(DOC_NAME), nativeStill);

  clearExternalDataSources();

  console.log('\nEXTERNAL ID MAP (Phase 4 Step 1):');
  await link(clinic.id, 'openemr', 'patient', patient.id, 'emr-P-777');
  const ext = await toExternal(clinic.id, 'openemr', 'patient', patient.id);
  check('toExternal resolves the linked EMR id', ext === 'emr-P-777', ext);
  const loc = await toLocal(clinic.id, 'openemr', 'patient', 'emr-P-777');
  check('toLocal resolves back to the local id', loc === patient.id, loc);
  await link(clinic.id, 'openemr', 'patient', patient.id, 'emr-P-888'); // idempotent re-link
  const ext2 = await toExternal(clinic.id, 'openemr', 'patient', patient.id);
  check('re-link updates externalId (idempotent upsert)', ext2 === 'emr-P-888', ext2);
  const missing = await toExternal(clinic.id, 'openemr', 'doctor', 'nope');
  check('unmapped lookup returns null', missing === null);

  console.log('\nSYNC-THROUGH SHADOW MIRROR (Phase 4 Step 2):');
  clearExternalDataSources();
  const SYS = 'mock';
  registerExternalDataSource((cid) =>
    cid === clinic.id ? syncThroughDataSource(clinic.id, SYS, mockEmrDataSource(clinic.id)) : null
  );

  const synced = dataSourceFor(clinic.id);
  const sRefs = await synced.doctors.listRefs();
  const emrRef = sRefs.find((d) => d.name.includes('(EMR)'));
  check('EMR doctors surface with LOCAL ids (not raw EMR ids)',
    !!emrRef && !emrRef.id.startsWith('emr-doc-'), emrRef?.id);

  const backToEmr = emrRef ? await toExternal(clinic.id, SYS, 'doctor', emrRef.id) : null;
  check('shadow doctor is id-mapped back to the EMR id', backToEmr === 'emr-doc-1' || backToEmr === 'emr-doc-2', backToEmr);

  const localDoc = emrRef ? await prisma.doctor.findFirst({ where: { id: emrRef.id, clinicId: clinic.id } }) : null;
  check('a real LOCAL shadow Doctor row exists for the EMR doctor', !!localDoc);

  // Slots: caller passes the LOCAL doctor id; wrapper translates to EMR id.
  const syncSlots = emrRef ? await synced.slots.getAvailable(emrRef.id, dateStr) : [];
  check('slots resolve via local->EMR id translation (5-slot demo grid)', syncSlots.length === 5, syncSlots.length);

  // Onboard a patient through the EMR clinic → EMR create + local shadow + local id.
  const sp = await synced.patients.onboard({ name: 'Sync Pt', phone: '+919990002222', language: 'English', source: 'whatsapp' });
  const spExt = await toExternal(clinic.id, SYS, 'patient', sp.id);
  check('onboarded EMR patient has a local shadow + id map', !sp.id.startsWith('emr-pat-') && !!spExt, { id: sp.id, ext: spExt });

  clearExternalDataSources();

  console.log('\nEMR APPOINTMENT WRITE (Phase 4 Step 4 — stub FHIR + real local mirror):');
  const SYS4 = 'mock';
  // Shadow doctor + patient with id-maps so the write path can translate ids.
  const localDoctorId = await ensureShadowDoctor(clinic.id, SYS4, { id: 'emr-doc-1', name: 'Dr EMR Write', speciality: 'Cardiology' });
  const emrPatient = { id: 'emr-pat-write-1', name: 'EMR Write Pt', phone: '+919990004444', language: 'English' } as PatientRecord;
  const localPatientId = await ensureShadowPatient(clinic.id, SYS4, emrPatient);

  // Stub FHIR transport records POST/PUT and returns an Appointment with a
  // per-run-unique id (real EMR ids are 1:1 with a local appt; a constant id
  // would collide with prior runs' mappings on the externalId unique key).
  const emrApptId = `emr-appt-${Date.now()}`;
  const calls: Array<{ verb: string; path: string; body?: any }> = [];
  const stub: FhirTransport = {
    async get<T>() { return { resourceType: 'Bundle', entry: [] } as T; },
    async post<T>(path: string, body: unknown) { calls.push({ verb: 'POST', path, body }); return { resourceType: 'Appointment', id: emrApptId } as T; },
    async put<T>(path: string, body: unknown) { calls.push({ verb: 'PUT', path, body }); return { resourceType: 'Appointment', id: emrApptId } as T; }
  };
  const emrAppts = openEmrAppointments(clinic.id, SYS4, new FhirClient(stub), nativeAppointments(clinic.id));

  // Clean any leftover active appt on this slot from a prior run (idempotent).
  const writeTime = '03:30 PM';
  const stale = await prisma.appointment.findFirst({ where: { clinicId: clinic.id, doctorId: localDoctorId, appointmentTime: writeTime, appointmentDate: new Date(`${dateStr}T00:00:00.000Z`), status: { not: 'CANCELLED' } } });
  if (stale) await prisma.appointment.update({ where: { id: stale.id }, data: { status: 'CANCELLED' } });

  const emrBooked = await emrAppts.create({
    doctorId: localDoctorId, patientId: localPatientId,
    appointmentDate: new Date(`${dateStr}T00:00:00.000Z`), appointmentTime: writeTime,
    status: AppointmentStatus.PENDING
  });
  const postCall = calls.find((c) => c.verb === 'POST' && c.path === '/Appointment');
  check('create POSTs a FHIR Appointment with EMR participant refs',
    !!postCall && JSON.stringify(postCall.body?.participant).includes('Practitioner/emr-doc-1') && JSON.stringify(postCall.body?.participant).includes('Patient/emr-pat-write-1'));
  check('create writes a LOCAL mirror row (local ids)', emrBooked.doctorId === localDoctorId && emrBooked.patientId === localPatientId);
  const apptExt = await toExternal(clinic.id, SYS4, 'appointment', emrBooked.id);
  check('mirror appointment is id-linked to the EMR appointment', apptExt === emrApptId, apptExt);

  // Cancel via applyUpdate → mirror cancels + PUT pushes cancelled status to EMR.
  const cancelledRes = await emrAppts.applyUpdate(emrBooked.id, { status: AppointmentStatus.CANCELLED });
  const putCall = calls.find((c) => c.verb === 'PUT' && c.path === `/Appointment/${emrApptId}`);
  check('cancel PUTs status=cancelled to the EMR', !!putCall && putCall.body?.status === 'cancelled', putCall?.body?.status);
  check('local mirror reflects the cancellation', typeof cancelledRes !== 'string' && cancelledRes.status === AppointmentStatus.CANCELLED);

  console.log('\nREGRESSION GUARDS (from the pre-deploy code review):');
  // R1: listRefs lost `orderBy: name asc` — public booking page + /api/v1/doctors.
  const refsSorted = await ds.doctors.listRefs();
  const sortedNames = refsSorted.map((d) => d.name);
  check('listRefs() is ordered by name asc',
    sortedNames.every((n, i) => i === 0 || sortedNames[i - 1].localeCompare(n) <= 0), sortedNames.slice(0, 3));

  // R6: findRefById is an indexed point lookup, not a roster scan.
  const oneRef = await ds.doctors.findRefById(doctorId);
  const noRef = await ds.doctors.findRefById('no-such-doctor');
  check('findRefById returns the doctor, null for unknown', oneRef?.id === doctorId && noRef === null);

  // R5: forClinic + dataSourceFor memoized (63 $extends per WhatsApp msg -> 1).
  check('forClinic(clinicId) is memoized', forClinic(clinic.id) === forClinic(clinic.id));
  check('dataSourceFor(clinicId) is memoized', dataSourceFor(clinic.id) === dataSourceFor(clinic.id));

  // R2: unknown doctor must be 404 even when the slot is also in the past
  // (existence check runs BEFORE the date/time guards).
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  let code = 0;
  try {
    await createAppointment(clinic.id, {
      doctorId: 'no-such-doctor', patientId: patient.id,
      appointmentDate: yesterday, appointmentTime: '09:00 AM'
    }, { notify: false });
  } catch (e: any) { code = e?.statusCode ?? 0; }
  check('unknown doctor + past slot -> 404 (not 400 "past slot")', code === 404, { code });

  console.log('\nRESOLVER GATING (Phase 4 Step 5 — native default, EMR only when gated):');
  clearExternalAppointmentSources();
  const def = appointmentSourceFor(clinic.id);
  check('appointmentSourceFor defaults to native (no providers registered)', typeof def.create === 'function');
  const sentinel = { create: async () => ({}) } as any;
  registerExternalAppointmentSource((cid: string) => (cid === 'emr-appt-clinic' ? sentinel : null));
  check('a gated clinic gets the EMR appointment source', appointmentSourceFor('emr-appt-clinic') === sentinel);
  check('a non-gated clinic stays native (EMR provider does not leak)', appointmentSourceFor(clinic.id) !== sentinel);
  clearExternalAppointmentSources();

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERR:', e); process.exit(1); });
