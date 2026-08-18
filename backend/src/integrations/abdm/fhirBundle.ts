// A MediScribe consultation, as the FHIR document ABDM expects.
//
// This is the piece every route to the government needs — ABDM record exchange
// (M2/M3), UHI, and any hospital integration all speak FHIR R4. Nothing else we
// hold is in a shape anyone outside this system can read: the clinical record
// lives as NovaDoc JSON, which is ours alone.
//
// PURE. No database, no network, no clock of its own — a consultation goes in,
// a Bundle comes out. That is deliberate: this is the layer a certifier will
// read line by line, and the only way to be confident about it is to be able to
// test it exhaustively without a server, a token or a patient.
//
// WHAT THIS IS NOT, yet: it is not signed, not encrypted and not pushed. ABDM
// wraps the bundle in its own consent-bound, ECDH-encrypted transfer; that is a
// separate layer and it needs sandbox credentials. This produces the payload
// that layer will carry, and it can be built and verified today without them.
//
// PROFILE NOTE: ABDM publishes NDHM profiles on top of FHIR R4 and they change.
// What follows is R4 in ABDM's document shape (a Composition-led Bundle of type
// "document"). Before certification every resource must be checked against the
// profile version live at that time — the coding systems are collected at the
// top so that is one edit rather than a hunt.

/** ABDM's coding systems, kept together so a profile bump is one place. */
export const ABDM_SYSTEM = {
  /** SNOMED CT is what ABDM asks for on clinical concepts. */
  snomed: 'http://snomed.info/sct',
  loinc: 'http://loinc.org',
  /** ABHA address / number, as patient identifiers. */
  abhaAddress: 'https://healthid.abdm.gov.in/ns/abha-address',
  abhaNumber: 'https://healthid.abdm.gov.in/ns/abha-number',
  /** Our own ids, so a record can be traced back here during an investigation. */
  clinicbookPatient: 'https://clinicbook.ai/ns/patient-id',
  clinicbookConsultation: 'https://clinicbook.ai/ns/consultation-id'
} as const;

export interface Medicine {
  medicine?: string;
  dosage?: string;
  strength?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface ConsultationInput {
  consultationId: string;
  /** ISO date-time of the visit. Passed in — this module has no clock. */
  recordedAt: string;
  patient: {
    id: string;
    name: string;
    gender?: string | null;
    phone?: string | null;
    /** Present only once the patient has actually linked their ABHA. */
    abhaAddress?: string | null;
    abhaNumber?: string | null;
  };
  practitioner: { name: string; registrationNumber?: string | null };
  organization: { id: string; name: string };
  report: {
    chiefComplaint?: string[];
    clinicalOverview?: string;
    assessment?: string[];
    advice?: string[];
    prescribedMedications?: Medicine[];
  };
}

type Json = Record<string, unknown>;

/** A stable urn for a resource inside the bundle. */
const urn = (kind: string, id: string): string => `urn:uuid:${kind}-${id}`;

/**
 * FHIR `gender` from whatever the clinic recorded.
 *
 * Anything unrecognised becomes 'unknown' rather than a guess. A wrong gender on
 * a clinical document is worse than an absent one, and both 'other' and
 * 'unknown' are valid R4 values.
 */
export const toFhirGender = (value?: string | null): 'male' | 'female' | 'other' | 'unknown' => {
  const g = (value || '').trim().toLowerCase();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  if (g === 'other' || g === 'transgender') return 'other';
  return 'unknown';
};

/** Escaped for XHTML — a doctor's free text can contain anything. */
export const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Amoxicillin — 500mg, BD, 5 days (after food)" from the row we store. */
export const medicineText = (m: Medicine): string => {
  const name = (m.medicine || '').trim();
  const detail = [m.strength, m.dose || m.dosage, m.frequency, m.duration]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const notes = (m.instructions || '').trim();
  const head = [name, detail.join(', ')].filter(Boolean).join(' — ');
  return notes ? `${head} (${notes})` : head;
};

const patientResource = (input: ConsultationInput): Json => {
  const identifier: Json[] = [{ system: ABDM_SYSTEM.clinicbookPatient, value: input.patient.id }];
  // ABHA identifiers ONLY when the patient actually linked one. An empty or
  // placeholder identifier would make an unlinked patient look linked, which is
  // the kind of thing a certifier looks for.
  if (input.patient.abhaAddress) {
    identifier.unshift({ system: ABDM_SYSTEM.abhaAddress, value: input.patient.abhaAddress });
  }
  if (input.patient.abhaNumber) {
    identifier.unshift({ system: ABDM_SYSTEM.abhaNumber, value: input.patient.abhaNumber });
  }

  return {
    resourceType: 'Patient',
    id: input.patient.id,
    identifier,
    name: [{ text: input.patient.name }],
    gender: toFhirGender(input.patient.gender),
    ...(input.patient.phone
      ? { telecom: [{ system: 'phone', value: input.patient.phone, use: 'mobile' }] }
      : {})
  };
};

const practitionerResource = (input: ConsultationInput): Json => ({
  resourceType: 'Practitioner',
  id: `prac-${input.consultationId}`,
  name: [{ text: input.practitioner.name }],
  // The registration number is what makes a prescription valid in India. It is
  // included when the doctor has set it, and OMITTED — never invented — when not.
  ...(input.practitioner.registrationNumber
    ? {
        identifier: [
          {
            system: 'https://hpr.abdm.gov.in/ns/registration-number',
            value: input.practitioner.registrationNumber
          }
        ]
      }
    : {})
});

const organizationResource = (input: ConsultationInput): Json => ({
  resourceType: 'Organization',
  id: input.organization.id,
  name: input.organization.name
});

/** One narrative section. Callers drop empty ones rather than rendering them. */
const section = (title: string, code: string, lines: string[]): Json => ({
  title,
  code: { coding: [{ system: ABDM_SYSTEM.snomed, code, display: title }] },
  text: {
    status: 'generated',
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${lines
      .map((l) => `<p>${escapeXml(l)}</p>`)
      .join('')}</div>`
  }
});

const medicationRequests = (input: ConsultationInput): Json[] =>
  (input.report.prescribedMedications ?? [])
    .filter((m) => (m.medicine || '').trim())
    .map((m, i) => ({
      resourceType: 'MedicationRequest',
      id: `med-${input.consultationId}-${i}`,
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: { text: (m.medicine || '').trim() },
      subject: { reference: `Patient/${input.patient.id}` },
      authoredOn: input.recordedAt,
      requester: { reference: `Practitioner/prac-${input.consultationId}` },
      dosageInstruction: [{ text: medicineText(m) }]
    }));

/**
 * The whole consultation as a FHIR `document` Bundle.
 *
 * Composition first, then everything it references — that ordering is part of
 * the document profile, not a stylistic choice.
 */
export const buildConsultationBundle = (input: ConsultationInput): Json => {
  const prescribed = (input.report.prescribedMedications ?? []).filter((m) => (m.medicine || '').trim());
  const meds = medicationRequests(input);

  const sections: Json[] = [];
  const complaints = (input.report.chiefComplaint ?? []).filter(Boolean);
  if (complaints.length) sections.push(section('Chief complaints', '422843007', complaints));

  const overview = (input.report.clinicalOverview || '').trim();
  if (overview) sections.push(section('Clinical overview', '371530004', [overview]));

  const assessment = (input.report.assessment ?? []).filter(Boolean);
  if (assessment.length) sections.push(section('Assessment', '404684003', assessment));

  const advice = (input.report.advice ?? []).filter(Boolean);
  if (advice.length) sections.push(section('Advice', '409073007', advice));

  if (meds.length) {
    sections.push({
      ...section('Prescription', '440545006', prescribed.map(medicineText)),
      entry: meds.map((m) => ({ reference: `MedicationRequest/${(m as { id: string }).id}` }))
    });
  }

  const composition: Json = {
    resourceType: 'Composition',
    id: `comp-${input.consultationId}`,
    identifier: { system: ABDM_SYSTEM.clinicbookConsultation, value: input.consultationId },
    status: 'final',
    type: { coding: [{ system: ABDM_SYSTEM.snomed, code: '371530004', display: 'Clinical consultation report' }] },
    subject: { reference: `Patient/${input.patient.id}` },
    date: input.recordedAt,
    author: [{ reference: `Practitioner/prac-${input.consultationId}` }],
    title: 'OP Consultation Record',
    custodian: { reference: `Organization/${input.organization.id}` },
    section: sections
  };

  const entry: Json[] = [
    { fullUrl: urn('Composition', input.consultationId), resource: composition },
    { fullUrl: urn('Patient', input.patient.id), resource: patientResource(input) },
    { fullUrl: urn('Practitioner', input.consultationId), resource: practitionerResource(input) },
    { fullUrl: urn('Organization', input.organization.id), resource: organizationResource(input) },
    ...meds.map((m) => ({ fullUrl: urn('MedicationRequest', String((m as { id: string }).id)), resource: m }))
  ];

  return {
    resourceType: 'Bundle',
    id: `bundle-${input.consultationId}`,
    type: 'document',
    timestamp: input.recordedAt,
    identifier: { system: ABDM_SYSTEM.clinicbookConsultation, value: input.consultationId },
    entry
  };
};
