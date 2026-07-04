// PURE FHIR R4 ↔ ClinicBook domain mappers. No network, no DB — just shape
// translation, so they are fully unit-testable with canned bundles. This is the
// reusable heart of every FHIR-based EMR adapter (OpenEMR, Epic, Cerner …): the
// transport differs, the mapping is the same.

import { AppointmentStatus } from '@prisma/client';

import { CLINIC_TIMEZONE, canonicalizeTime, clinicLocalInstant } from '../../../services/slotMath.js';
import type { DoctorRef, PatientRecord } from '../../../core/datasource/ports.js';
import type {
  FhirBundle,
  FhirHumanName,
  FhirPractitioner,
  FhirPractitionerRole,
  FhirSlot,
  FhirPatient,
  FhirContactPoint,
  FhirAppointment
} from './types.js';

// "Dr Meera Rao" from a FHIR HumanName (prefer .text, else prefix+given+family).
export const humanNameToString = (names?: FhirHumanName[]): string => {
  const n = names?.[0];
  if (!n) return 'Unknown';
  if (n.text?.trim()) return n.text.trim();
  const parts = [...(n.prefix ?? []), ...(n.given ?? []), n.family].filter(Boolean);
  return parts.join(' ').trim() || 'Unknown';
};

const firstPhone = (telecom?: FhirContactPoint[]): string | undefined =>
  telecom?.find((t) => t.system === 'phone' && t.value)?.value?.trim();

// Non-Bundle helper: entries with a resource of the wanted kind.
const resources = <T>(bundle: FhirBundle<T> | undefined): T[] =>
  (bundle?.entry ?? []).map((e) => e.resource).filter((r): r is T => r != null);

// --- Doctors ---------------------------------------------------------------
// Specialty lives on PractitionerRole in FHIR, not Practitioner. We map the
// role bundle to (practitionerId → specialty), then join onto practitioners.
// Falls back to the practitioner's own qualification text, then "General".
const practitionerIdFromRef = (ref?: string): string | undefined =>
  ref?.startsWith('Practitioner/') ? ref.slice('Practitioner/'.length) : ref;

export const buildSpecialtyIndex = (
  roleBundle?: FhirBundle<FhirPractitionerRole>
): Map<string, string> => {
  const index = new Map<string, string>();
  for (const role of resources(roleBundle)) {
    const pid = practitionerIdFromRef(role.practitioner?.reference);
    const spec = role.specialty?.[0]?.text ?? role.specialty?.[0]?.coding?.[0]?.display;
    if (pid && spec && !index.has(pid)) index.set(pid, spec.trim());
  }
  return index;
};

export const practitionerToDoctorRef = (
  p: FhirPractitioner,
  specialtyIndex?: Map<string, string>
): DoctorRef => {
  const fromRole = p.id ? specialtyIndex?.get(p.id) : undefined;
  const fromQual = p.qualification?.[0]?.code?.text ?? p.qualification?.[0]?.code?.coding?.[0]?.display;
  return {
    id: p.id ?? '',
    name: humanNameToString(p.name),
    speciality: (fromRole ?? fromQual ?? 'General').trim()
  };
};

export const bundleToDoctorRefs = (
  practitioners: FhirBundle<FhirPractitioner> | undefined,
  roles?: FhirBundle<FhirPractitionerRole>
): DoctorRef[] => {
  const specialtyIndex = buildSpecialtyIndex(roles);
  return resources(practitioners)
    .map((p) => practitionerToDoctorRef(p, specialtyIndex))
    .filter((d) => d.id);
};

// --- Slots -----------------------------------------------------------------
// A FHIR Slot.start is an instant; ClinicBook stores/compares wall-clock labels
// ("09:00 AM") in the clinic's timezone. Convert via Intl (Asia/Kolkata) then
// canonicalise to the exact stored shape so downstream comparisons match.
export const instantToClinicLabel = (isoInstant: string): string | null => {
  const d = new Date(isoInstant);
  if (Number.isNaN(d.getTime())) return null;
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d); // "09:00"
  return canonicalizeTime(hhmm);
};

export const slotBundleToLabels = (bundle?: FhirBundle<FhirSlot>): string[] => {
  const labels = resources(bundle)
    .filter((s) => (s.status ?? 'free') === 'free')
    .map((s) => (s.start ? instantToClinicLabel(s.start) : null))
    .filter((l): l is string => l != null);
  return [...new Set(labels)];
};

// --- Patients --------------------------------------------------------------
// Maps a FHIR Patient onto our PatientRecord shape. externalId (the FHIR id) is
// carried in patientCode for now; a real deployment stores it in ExternalIdMap
// (Phase 4) so our own ids and the EMR's stay linked.
export const patientToRecord = (p: FhirPatient, clinicId: string): PatientRecord =>
  ({
    id: p.id ?? '',
    clinicId,
    name: humanNameToString(p.name),
    phone: firstPhone(p.telecom) ?? '',
    language: 'English',
    patientCode: p.id ? `EMR:${p.id}` : null,
    source: 'emr',
    age: null,
    gender: p.gender ?? null,
    healthConcern: null,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  }) as PatientRecord;

export const patientBundleToRecords = (
  bundle: FhirBundle<FhirPatient> | undefined,
  clinicId: string
): PatientRecord[] => resources(bundle).map((p) => patientToRecord(p, clinicId));

// --- Appointments ----------------------------------------------------------
// ClinicBook lifecycle status → FHIR Appointment.status.
const STATUS_TO_FHIR: Record<AppointmentStatus, string> = {
  [AppointmentStatus.PENDING]: 'pending',
  [AppointmentStatus.CONFIRMED]: 'booked',
  [AppointmentStatus.CANCELLED]: 'cancelled',
  [AppointmentStatus.COMPLETED]: 'fulfilled',
  [AppointmentStatus.NO_SHOW]: 'noshow'
};
export const statusToFhir = (s: AppointmentStatus): string => STATUS_TO_FHIR[s];

export interface AppointmentToFhirInput {
  status: AppointmentStatus;
  appointmentDate: Date; // UTC-midnight calendar day (as stored)
  appointmentTime: string; // clinic-local "HH:MM AM/PM"
  emrDoctorId: string;
  emrPatientId: string;
  durationMinutes?: number;
}

// Build a FHIR Appointment resource for a create/update. start/end are true UTC
// instants derived from the clinic-local date+time (reuses clinicLocalInstant,
// the same math reminders use), and participants reference the EMR's own
// Practitioner/Patient ids (translated by the caller via ExternalIdMap).
export const appointmentToFhir = (i: AppointmentToFhirInput): FhirAppointment => {
  const start = clinicLocalInstant(i.appointmentDate, i.appointmentTime);
  const end = new Date(start.getTime() + (i.durationMinutes ?? 30) * 60_000);
  return {
    resourceType: 'Appointment',
    status: statusToFhir(i.status),
    start: start.toISOString(),
    end: end.toISOString(),
    participant: [
      { actor: { reference: `Practitioner/${i.emrDoctorId}` }, status: 'accepted' },
      { actor: { reference: `Patient/${i.emrPatientId}` }, status: 'accepted' }
    ]
  };
};
