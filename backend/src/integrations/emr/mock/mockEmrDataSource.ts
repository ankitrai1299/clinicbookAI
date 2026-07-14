// A MOCK external-EMR ClinicDataSource — in-memory, no network. It exists to
// PROVE the data-source seam: a clinic routed here gets its doctors / slots /
// patients from this adapter instead of Postgres, with NO change to the booking
// FSM, the MCP brain, notifications or events. A real OpenEMR/Epic/Practo adapter
// replaces the in-memory bodies with FHIR/REST calls while implementing the very
// same DoctorPort / SlotPort / PatientPort contracts.
//
// Writes to the doctor roster throw: in an EMR-backed clinic the roster is owned
// by the EMR, not by ClinicBook. Patient writes are supported (in-memory here; a
// real adapter would upsert into the EMR + ExternalIdMap).

import type { Doctor } from '@prisma/client';

import { AppError } from '../../../utils/AppError.js';
import { canonicalizeTime } from '../../../services/slotMath.js';
import type {
  ClinicDataSource,
  DoctorPort,
  DoctorRef,
  SlotPort,
  PatientPort,
  PatientRecord,
  PatientCreateData,
  PatientUpdateData
} from '../../../core/datasource/ports.js';

const NOT_MANAGED = async (): Promise<never> => {
  throw new AppError('This clinic’s doctors are managed in its EMR, not in ClinicBook.', 400);
};

// A small demo roster + a fixed daily grid. A real adapter derives these from
// FHIR Practitioner / Schedule / Slot resources.
const DEMO_DOCTORS: DoctorRef[] = [
  { id: 'emr-doc-1', name: 'Dr. Meera Rao (EMR)', speciality: 'Cardiology' },
  { id: 'emr-doc-2', name: 'Dr. Arjun Nair (EMR)', speciality: 'Dermatology' }
];
const DEMO_GRID = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM'];

const mockDoctors = (clinicId: string): DoctorPort => {
  const asDoctor = (r: DoctorRef): Doctor =>
    ({
      id: r.id,
      clinicId,
      name: r.name,
      speciality: r.speciality,
      experienceYears: null,
      email: null,
      phone: null,
      passwordHash: null
    }) as Doctor;

  return {
    list: async () => DEMO_DOCTORS.map(asDoctor),
    listRefs: async () => [...DEMO_DOCTORS],
    findRefById: async (id: string) => DEMO_DOCTORS.find((d) => d.id === id) ?? null,
    listSpecialities: async () =>
      [...new Set(DEMO_DOCTORS.map((d) => d.speciality))].sort((a, b) => a.localeCompare(b)),
    listBySpeciality: async (speciality: string) =>
      DEMO_DOCTORS.filter((d) => d.speciality.toLowerCase() === speciality.toLowerCase()),
    listNames: async () => DEMO_DOCTORS.map((d) => d.name),
    create: NOT_MANAGED,
    update: NOT_MANAGED,
    remove: NOT_MANAGED,
    getSchedule: NOT_MANAGED,
    setSchedule: NOT_MANAGED,
    getLeaves: NOT_MANAGED,
    addLeave: NOT_MANAGED,
    removeLeave: NOT_MANAGED
  };
};

const mockSlots = (): SlotPort => {
  const getAvailable = async (doctorId: string, _dateStr?: string, _at?: Date): Promise<string[]> =>
    DEMO_DOCTORS.some((d) => d.id === doctorId) ? [...DEMO_GRID] : [];
  return {
    getAvailable,
    getDateAvailability: async (doctorId: string, dateStr: string) => {
      const available = (await getAvailable(doctorId, dateStr)).length;
      return { working: available > 0, available };
    },
    isAvailable: async (doctorId: string, dateStr: string, time: string) => {
      const canonical = canonicalizeTime(time);
      return canonical !== null && (await getAvailable(doctorId, dateStr)).includes(canonical);
    }
  };
};

const mockPatients = (clinicId: string): PatientPort => {
  const byId = new Map<string, PatientRecord>();
  const build = (data: Partial<PatientRecord> & { phone: string; name: string; language: string }): PatientRecord =>
    ({
      id: `emr-pat-${byId.size + 1}`,
      clinicId,
      name: data.name,
      phone: data.phone,
      language: data.language,
      patientCode: data.patientCode ?? null,
      source: data.source ?? 'emr',
      age: data.age ?? null,
      gender: data.gender ?? null,
      healthConcern: data.healthConcern ?? null,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    }) as PatientRecord;

  const save = (p: PatientRecord) => {
    byId.set(p.id, p);
    return p;
  };

  return {
    list: async () => [...byId.values()],
    findById: async (id: string) => byId.get(id) ?? null,
    findByPhone: async (phone: string) =>
      [...byId.values()].find((p) => p.phone === phone.trim()) ?? null,
    findByPhoneContains: async (fragment: string) =>
      [...byId.values()].filter((p) => (p.phone ?? '').includes(fragment)),
    listRecent: async () => [...byId.values()],
    create: async (data: PatientCreateData) =>
      save(build({ ...data, phone: data.phone ?? '', patientCode: `PT-EMR${byId.size + 1}` })),
    onboard: async (data) => save(build({ ...data })),
    update: async (id: string, data: PatientUpdateData) => {
      const existing = byId.get(id);
      if (!existing) throw new AppError('Patient not found', 404);
      return save({ ...existing, ...data, updatedAt: new Date(0) } as PatientRecord);
    },
    remove: async (id: string) => {
      byId.delete(id);
    }
  };
};

export const mockEmrDataSource = (clinicId: string): ClinicDataSource => ({
  clinicId,
  doctors: mockDoctors(clinicId),
  slots: mockSlots(),
  patients: mockPatients(clinicId)
});
