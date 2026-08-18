import { describe, it, expect } from 'vitest';

import {
  buildConsultationBundle,
  medicineText,
  toFhirGender,
  escapeXml,
  ABDM_SYSTEM,
  type ConsultationInput
} from './fhirBundle.js';

// This is the layer a certifier reads line by line, and the one thing that will
// be shown to the government. So it is tested the way a certifier would look at
// it: is the document well-formed, does it reference what it claims, and — most
// importantly — does it ever assert something we do not actually know?
//
// The last one matters more than it sounds. A bundle that invents an ABHA
// identifier or a registration number is worse than one that omits them: it
// passes a shape check and fails a truth check, and a certifier only has to find
// it once.

const base: ConsultationInput = {
  consultationId: 'k1',
  recordedAt: '2026-08-18T10:30:00.000Z',
  patient: { id: 'p1', name: 'Anish Kumar', gender: 'Male', phone: '+918252317017' },
  practitioner: { name: 'Dr Rai', registrationNumber: 'BMC-12345' },
  organization: { id: 'c1', name: 'nextclinicAi' },
  report: {
    chiefComplaint: ['Fever for 3 days'],
    clinicalOverview: 'Viral fever, no red flags.',
    assessment: ['Acute viral fever'],
    advice: ['Rest', 'Fluids'],
    prescribedMedications: [
      { medicine: 'Paracetamol', strength: '650mg', dose: '1 tab', frequency: 'TDS', duration: '3 days', instructions: 'after food' }
    ]
  }
};

const resourcesOf = (bundle: Record<string, unknown>) =>
  (bundle.entry as Array<{ resource: { resourceType: string } }>).map((e) => e.resource);

describe('the document is shaped the way ABDM expects', () => {
  const bundle = buildConsultationBundle(base);

  it('is a FHIR document bundle led by the Composition', () => {
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('document');
    // The Composition must be first — that is part of the document profile, not
    // a stylistic preference.
    expect(resourcesOf(bundle)[0].resourceType).toBe('Composition');
  });

  it('carries every resource the Composition points at', () => {
    const types = resourcesOf(bundle).map((r) => r.resourceType);
    for (const t of ['Composition', 'Patient', 'Practitioner', 'Organization', 'MedicationRequest']) {
      expect(types, t).toContain(t);
    }
  });

  it('has no dangling reference', () => {
    // A document that references a resource it does not contain is invalid, and
    // this is the failure a hand-built bundle makes most often.
    const json = JSON.stringify(bundle);
    const ids = new Set(resourcesOf(bundle).map((r) => `${r.resourceType}/${(r as { id: string }).id}`));
    const refs = [...json.matchAll(/"reference":"([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ids, ref).toContain(ref);
  });

  it('gives every entry a fullUrl, as a document bundle requires', () => {
    for (const e of bundle.entry as Array<{ fullUrl?: string }>) {
      expect(e.fullUrl, JSON.stringify(e).slice(0, 60)).toMatch(/^urn:uuid:/);
    }
  });

  it('stamps the visit time it was given, not the time it ran', () => {
    // No clock in this module: a bundle rebuilt tomorrow for the same visit must
    // be identical, or a re-push looks like a new record.
    expect(bundle.timestamp).toBe('2026-08-18T10:30:00.000Z');
    expect(JSON.stringify(buildConsultationBundle(base))).toBe(JSON.stringify(bundle));
  });
});

describe('it never asserts something we do not know', () => {
  it('omits ABHA identifiers entirely when the patient has not linked one', () => {
    // The failure this prevents: an unlinked patient looking linked.
    const bundle = buildConsultationBundle(base);
    const patient = resourcesOf(bundle).find((r) => r.resourceType === 'Patient') as {
      identifier: Array<{ system: string; value: string }>;
    };
    expect(patient.identifier.some((i) => i.system.includes('abha'))).toBe(false);
    // Our own id is still there, so the record can be traced back during an
    // investigation.
    expect(patient.identifier[0]).toEqual({ system: ABDM_SYSTEM.clinicbookPatient, value: 'p1' });
  });

  it('puts the ABHA identifiers first once the patient HAS linked', () => {
    const bundle = buildConsultationBundle({
      ...base,
      patient: { ...base.patient, abhaAddress: 'anish@abdm', abhaNumber: '12-3456-7890-1234' }
    });
    const patient = resourcesOf(bundle).find((r) => r.resourceType === 'Patient') as {
      identifier: Array<{ system: string; value: string }>;
    };
    expect(patient.identifier.map((i) => i.value)).toEqual([
      '12-3456-7890-1234',
      'anish@abdm',
      'p1'
    ]);
  });

  it('omits the registration number rather than inventing one', () => {
    // A prescription's validity in India rests on this number. An absent one is
    // a gap; a fabricated one is a forged document.
    const bundle = buildConsultationBundle({ ...base, practitioner: { name: 'Dr Rai' } });
    const prac = resourcesOf(bundle).find((r) => r.resourceType === 'Practitioner') as { identifier?: unknown };
    expect(prac.identifier).toBeUndefined();
  });

  it('reports gender it does not recognise as unknown, never as a guess', () => {
    expect(toFhirGender('Male')).toBe('male');
    expect(toFhirGender('f')).toBe('female');
    expect(toFhirGender('transgender')).toBe('other');
    for (const v of ['', null, undefined, 'n/a', 'Not recorded']) {
      expect(toFhirGender(v), String(v)).toBe('unknown');
    }
  });

  it('drops empty sections instead of emitting hollow ones', () => {
    const bundle = buildConsultationBundle({
      ...base,
      report: { clinicalOverview: 'Seen and examined.' }
    });
    const comp = resourcesOf(bundle)[0] as { section: Array<{ title: string }> };
    expect(comp.section.map((s) => s.title)).toEqual(['Clinical overview']);
  });

  it('emits no MedicationRequest when nothing was prescribed', () => {
    const bundle = buildConsultationBundle({ ...base, report: { ...base.report, prescribedMedications: [] } });
    expect(resourcesOf(bundle).some((r) => r.resourceType === 'MedicationRequest')).toBe(false);
    const comp = resourcesOf(bundle)[0] as { section: Array<{ title: string }> };
    expect(comp.section.map((s) => s.title)).not.toContain('Prescription');
  });

  it('skips a medicine row with no medicine name', () => {
    // These exist: a half-filled row the doctor abandoned. It must not become a
    // MedicationRequest for a drug with no name.
    const bundle = buildConsultationBundle({
      ...base,
      report: { ...base.report, prescribedMedications: [{ dose: '1 tab' }, { medicine: 'Azithromycin' }] }
    });
    const meds = resourcesOf(bundle).filter((r) => r.resourceType === 'MedicationRequest');
    expect(meds).toHaveLength(1);
  });
});

describe('the narrative is safe to render', () => {
  it('escapes clinical free text, which a doctor can type anything into', () => {
    // An unescaped "<" makes the whole document invalid, and the text here is
    // typed by a human in a hurry.
    const bundle = buildConsultationBundle({
      ...base,
      report: { assessment: ['BP <90/60 & falling', 'R/O "sepsis"'] }
    });
    const comp = resourcesOf(bundle)[0] as { section: Array<{ text: { div: string } }> };
    const div = comp.section[0].text.div;
    expect(div).toContain('&lt;90/60 &amp; falling');
    expect(div).toContain('&quot;sepsis&quot;');
    expect(div).not.toMatch(/<p>[^<]*<[^/p]/);
  });

  it('escapes the characters that break XHTML', () => {
    expect(escapeXml('a < b & c > d "e"')).toBe('a &lt; b &amp; c &gt; d &quot;e&quot;');
  });
});

describe('the medicine line a patient and a pharmacist both read', () => {
  it('reads the way a prescription is written', () => {
    expect(
      medicineText({ medicine: 'Paracetamol', strength: '650mg', dose: '1 tab', frequency: 'TDS', duration: '3 days', instructions: 'after food' })
    ).toBe('Paracetamol — 650mg, 1 tab, TDS, 3 days (after food)');
  });

  it('degrades cleanly when the doctor filled in less', () => {
    expect(medicineText({ medicine: 'Azithromycin' })).toBe('Azithromycin');
    expect(medicineText({ medicine: 'Azithromycin', duration: '3 days' })).toBe('Azithromycin — 3 days');
  });
});
