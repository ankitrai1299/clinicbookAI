// ===========================================================================
// Clinic data-source PORTS — the seam that lets a clinic's records live either
// in our own Postgres (the "native" adapter) OR in an external EMR/HIMS
// (OpenEMR/Epic/Practo via a FHIR/REST adapter under integrations/emr).
//
// The rest of the app never touches Prisma for these domains directly; it asks
// `dataSourceFor(clinicId)` for a ClinicDataSource and calls these methods. The
// native implementation IS the current tested behaviour, moved behind the
// interface with ZERO change — an EMR adapter simply provides another
// implementation of the same contract.
//
// Layering: this lives in `core` and defines only the CONTRACT (types +
// interfaces). Implementations (native Prisma, later EMR) depend inward on it.
// Return shapes are the existing Prisma model types where the whole row flows
// through unchanged; where only a projection is used on the hot path we name a
// small domain type (e.g. DoctorRef) so an EMR adapter isn't forced to
// fabricate Prisma internals.
// ===========================================================================

import type { Doctor, DoctorSchedule, DoctorLeave, Patient } from '@prisma/client';

import type {
  CreateDoctorInput,
  UpdateDoctorInput,
  SetScheduleInput,
  CreateLeaveInput
} from '../doctors/doctor.schemas.js';

// Minimal doctor projection used all over the booking path (menus, matching).
// Structurally identical to whatsapp.booking's DoctorOption.
export interface DoctorRef {
  id: string;
  name: string;
  speciality: string;
}

// Read + write access to a clinic's doctors, weekly schedules and leaves.
// Every method is already clinic-scoped: the source is resolved per clinicId,
// so callers never pass clinicId again. Write methods may throw on adapters
// whose roster is owned externally (an EMR clinic manages doctors in the EMR).
export interface DoctorPort {
  // --- Reads (booking hot path + dashboard) ---
  /** Full doctor rows, ordered by name. */
  list(): Promise<Doctor[]>;
  /** {id,name,speciality} for every doctor, ordered by name — basis for name
   *  matching AND for the public booking page / GET /api/v1/doctors. */
  listRefs(): Promise<DoctorRef[]>;
  /** One doctor by id, or null. Exists so callers validating a single id don't
   *  have to pull the whole roster (which, on an EMR source, also costs a
   *  round-trip + a shadow upsert per doctor). */
  findRefById(id: string): Promise<DoctorRef | null>;
  /** Distinct, sorted speciality labels offered by this clinic. */
  listSpecialities(): Promise<string[]>;
  /** Doctors in one speciality (case-insensitive), ordered by name. */
  listBySpeciality(speciality: string): Promise<DoctorRef[]>;
  /** All doctor display names. */
  listNames(): Promise<string[]>;

  // --- Writes (dashboard CRUD) ---
  create(input: CreateDoctorInput): Promise<Doctor>;
  update(id: string, input: UpdateDoctorInput): Promise<Doctor>;
  remove(id: string): Promise<void>;

  // --- Weekly schedule + leaves ---
  getSchedule(id: string): Promise<DoctorSchedule[]>;
  setSchedule(id: string, input: SetScheduleInput): Promise<DoctorSchedule[]>;
  getLeaves(id: string): Promise<DoctorLeave[]>;
  addLeave(id: string, input: CreateLeaveInput): Promise<DoctorLeave>;
  removeLeave(id: string, leaveId: string): Promise<void>;
}

// Available appointment slots for a clinic's doctors. The native implementation
// derives them from schedule + leave + booked appointments; an EMR adapter can
// instead return the EMR's own free slots (e.g. FHIR Slot resources) — callers
// only ever see the final list, so the derivation source is hidden.
export interface SlotPort {
  /** Open start-time labels ("HH:MM AM/PM") for a doctor on a date (YYYY-MM-DD). */
  getAvailable(doctorId: string, dateStr: string, at?: Date): Promise<string[]>;
  /** One day's summary for the date picker: working day? + open-slot count. */
  getDateAvailability(doctorId: string, dateStr: string): Promise<{ working: boolean; available: number }>;
  /** Whether a specific time string is currently bookable for that doctor/date. */
  isAvailable(doctorId: string, dateStr: string, time: string): Promise<boolean>;
}

// A patient with its clinic joined in — the shape the patient service and its
// callers work with. One shared patient identity per clinic (clinicId + phone).
export type PatientRecord = Patient & {
  clinic?: { id: string; name: string; plan: string };
};

// Create payloads. `create` mints a unique human-readable patientCode (native
// concern); `onboard` is the channel auto-onboard (WhatsApp first-contact) that
// deliberately mirrors today's code-less, source-tagged create.
export interface PatientCreateData {
  name: string;
  // Optional: a patient added from the scribe may have no phone yet (stored NULL,
  // never a placeholder like "0000000000").
  phone?: string | null;
  language: string;
  age?: number;
  gender?: string;
  healthConcern?: string;
  source?: string;
}
export interface PatientUpdateData {
  name?: string;
  phone?: string;
  language?: string;
  age?: number;
  gender?: string;
  healthConcern?: string;
}

// Read/write access to a clinic's patients — the single shared patient identity
// used across products. An EMR-backed clinic resolves patients from the HMIS
// (mapped via ExternalIdMap) behind this same contract.
export interface PatientPort {
  list(): Promise<PatientRecord[]>;
  findById(id: string): Promise<PatientRecord | null>;
  /** Exact match on the (clinic, phone) unique key. */
  findByPhone(phone: string): Promise<PatientRecord | null>;
  /** Patients whose stored phone CONTAINS a fragment (fast national-digit path). */
  findByPhoneContains(fragment: string): Promise<PatientRecord[]>;
  /** All patients, newest first — the fallback scan for formatted-number match. */
  listRecent(): Promise<PatientRecord[]>;
  /** Create with a guaranteed-unique patientCode (dashboard / booking flows). */
  create(data: PatientCreateData): Promise<PatientRecord>;
  /** Channel auto-onboard (first WhatsApp contact): source-tagged, no welcome. */
  onboard(data: { name: string; phone: string; language: string; source: string }): Promise<PatientRecord>;
  update(id: string, data: PatientUpdateData): Promise<PatientRecord>;
  remove(id: string): Promise<void>;
}

// The per-clinic facade. It grows one sub-port per domain as each is migrated
// behind this seam (waitlist …). Callers hold a ClinicDataSource, never a raw
// Prisma client, for these domains.
export interface ClinicDataSource {
  readonly clinicId: string;
  readonly doctors: DoctorPort;
  readonly slots: SlotPort;
  readonly patients: PatientPort;
}
