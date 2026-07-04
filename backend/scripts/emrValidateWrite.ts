// One-off WRITE-PATH validation against a REAL FHIR server (HAPI by default).
// Exercises: create patient in EMR -> local shadow, create appointment in EMR
// (FHIR POST) -> local mirror + id-link, then reads everything back to prove it.
// Not seed automation and not wired into the app — a manual validation run.
//   OPENEMR_FHIR_BASE_URL=https://hapi.fhir.org/baseR4 npx tsx scripts/emrValidateWrite.ts
import '../src/config/env.js';
import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';
import { FhirClient, HttpFhirTransport } from '../src/integrations/emr/fhir/fhirClient.js';
import { resolveOpenEmrToken } from '../src/integrations/emr/index.js';
import { openEmrDataSource } from '../src/integrations/emr/openemr/openEmrDataSource.js';
import { ensureShadowDoctor, ensureShadowPatient } from '../src/integrations/emr/openemr/shadowSync.js';
import { openEmrAppointments } from '../src/integrations/emr/openemr/openEmrAppointments.js';
import { nativeAppointments } from '../src/products/clinicbook/appointments/appointment.native.js';
import { toExternal } from '../src/integrations/emr/externalIdMap.service.js';

const SYS = 'hapi';
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
};

async function main() {
  const base = process.env.OPENEMR_FHIR_BASE_URL;
  if (!base) throw new Error('Set OPENEMR_FHIR_BASE_URL');
  const clinic = await prisma.clinic.findFirst({ select: { id: true, name: true } });
  if (!clinic) throw new Error('No local clinic');
  console.log(`FHIR: ${base}\nClinic: ${clinic.name} (${clinic.id})\n`);

  const client = new FhirClient(new HttpFhirTransport(base, resolveOpenEmrToken(base), { insecureTls: process.env.OPENEMR_INSECURE_TLS === 'true' }));
  const raw = openEmrDataSource(clinic.id, client);
  const stamp = Date.now();

  console.log('CREATE PATIENT (EMR -> local shadow):');
  const emrPatient = await raw.patients.onboard({ name: `ClinicBook Test ${stamp}`, phone: `+9198${String(stamp).slice(-8)}`, language: 'English', source: 'whatsapp' });
  check('patient created in the EMR (got an EMR id)', !!emrPatient.id, emrPatient.id);
  const localPatientId = await ensureShadowPatient(clinic.id, SYS, emrPatient);
  const patientBackInEmr = await raw.patients.findById(emrPatient.id);
  check('patient is readable back from the EMR', patientBackInEmr?.id === emrPatient.id);
  check('local shadow patient + id map exists', (await toExternal(clinic.id, SYS, 'patient', localPatientId)) === emrPatient.id);

  console.log('\nPICK + SHADOW A DOCTOR (from the EMR roster):');
  const refs = await raw.doctors.listRefs();
  const emrDoc = refs.find((d) => d.id && d.name !== 'Unknown') ?? refs[0];
  check('a doctor is available in the EMR roster', !!emrDoc, emrDoc?.name);
  const localDoctorId = await ensureShadowDoctor(clinic.id, SYS, emrDoc);
  check('local shadow doctor + id map exists', (await toExternal(clinic.id, SYS, 'doctor', localDoctorId)) === emrDoc.id);

  console.log('\nCREATE APPOINTMENT (FHIR POST -> local mirror + id-link):');
  const emrAppts = openEmrAppointments(clinic.id, SYS, client, nativeAppointments(clinic.id));
  const apptDate = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  const dateStr = apptDate.toISOString().slice(0, 10);
  const booked = await emrAppts.create({
    doctorId: localDoctorId, patientId: localPatientId,
    appointmentDate: new Date(`${dateStr}T00:00:00.000Z`), appointmentTime: '10:00 AM',
    status: AppointmentStatus.PENDING
  });
  check('appointment mirrored locally with local ids', booked.doctorId === localDoctorId && booked.patientId === localPatientId);
  const apptEmrId = await toExternal(clinic.id, SYS, 'appointment', booked.id);
  check('appointment id-linked to an EMR appointment', !!apptEmrId, apptEmrId);

  console.log('\nVERIFY IN EMR + LOCAL MIRROR:');
  const emrAppt = apptEmrId ? await client.read<any>('Appointment', apptEmrId) : null;
  check('appointment is readable back from the EMR (FHIR)', emrAppt?.resourceType === 'Appointment' && emrAppt?.id === apptEmrId, { status: emrAppt?.status });
  const mirror = await prisma.appointment.findFirst({ where: { id: booked.id, clinicId: clinic.id }, include: { patient: true, doctor: true } });
  check('local mirror row exists with joined patient+doctor', !!mirror?.patient && !!mirror?.doctor, { time: mirror?.appointmentTime, status: mirror?.status });

  console.log('\nCANCEL (mirror + FHIR PUT):');
  const cancelled = await emrAppts.applyUpdate(booked.id, { status: AppointmentStatus.CANCELLED });
  check('cancel reflected in local mirror', typeof cancelled !== 'string' && cancelled.status === AppointmentStatus.CANCELLED);
  const emrApptAfter = apptEmrId ? await client.read<any>('Appointment', apptEmrId) : null;
  check('cancel reflected in the EMR (FHIR status=cancelled)', emrApptAfter?.status === 'cancelled', { status: emrApptAfter?.status });

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('ERR:', e?.response?.status, e?.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : e?.message ?? e); process.exit(1); });
