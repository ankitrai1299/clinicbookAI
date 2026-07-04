// Minimal FHIR R4 shapes — only the fields our adapters read/write. Kept tiny on
// purpose: FHIR resources are huge, but ClinicBook needs a small, well-defined
// slice (Practitioner, PractitionerRole, Slot, Patient, Appointment). Everything
// optional because real servers omit fields freely.

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}
export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}
export interface FhirReference {
  reference?: string; // e.g. "Practitioner/123"
  display?: string;
}
export interface FhirHumanName {
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
}
export interface FhirContactPoint {
  system?: 'phone' | 'email' | 'fax' | string;
  value?: string;
  use?: string;
}

export interface FhirPractitioner {
  resourceType: 'Practitioner';
  id?: string;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  qualification?: Array<{ code?: FhirCodeableConcept }>;
}

export interface FhirPractitionerRole {
  resourceType: 'PractitionerRole';
  id?: string;
  practitioner?: FhirReference;
  specialty?: FhirCodeableConcept[];
}

export interface FhirSlot {
  resourceType: 'Slot';
  id?: string;
  status?: 'free' | 'busy' | 'busy-unavailable' | 'busy-tentative' | 'entered-in-error' | string;
  start?: string; // ISO instant
  end?: string;
  schedule?: FhirReference;
}

export interface FhirPatient {
  resourceType: 'Patient';
  id?: string;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  gender?: string;
  birthDate?: string;
}

export interface FhirAppointmentParticipant {
  actor?: FhirReference;
  status?: string; // 'accepted' | 'declined' | ...
}
export interface FhirAppointment {
  resourceType: 'Appointment';
  id?: string;
  status?: string; // 'proposed'|'pending'|'booked'|'cancelled'|'fulfilled'|'noshow'|...
  start?: string; // ISO instant
  end?: string;
  description?: string;
  participant?: FhirAppointmentParticipant[];
}

export interface FhirBundleEntry<T> {
  resource?: T;
}
export interface FhirBundle<T> {
  resourceType: 'Bundle';
  type?: string;
  total?: number;
  entry?: Array<FhirBundleEntry<T>>;
}
