import { describe, it, expect } from 'vitest';

import {
  humanNameToString,
  bundleToDoctorRefs,
  instantToClinicLabel,
  slotBundleToLabels,
  patientToRecord
} from './mappers.js';
import type { FhirBundle, FhirPractitioner, FhirPractitionerRole, FhirSlot, FhirPatient } from './types.js';

describe('FHIR mappers', () => {
  it('humanNameToString prefers .text, else builds from parts', () => {
    expect(humanNameToString([{ text: 'Dr Meera Rao' }])).toBe('Dr Meera Rao');
    expect(humanNameToString([{ prefix: ['Dr'], given: ['Arjun'], family: 'Nair' }])).toBe('Dr Arjun Nair');
    expect(humanNameToString(undefined)).toBe('Unknown');
  });

  it('bundleToDoctorRefs joins PractitionerRole specialty onto practitioners', () => {
    const practitioners: FhirBundle<FhirPractitioner> = {
      resourceType: 'Bundle',
      entry: [
        { resource: { resourceType: 'Practitioner', id: 'p1', name: [{ text: 'Dr Meera Rao' }] } },
        {
          resource: {
            resourceType: 'Practitioner',
            id: 'p2',
            name: [{ family: 'Khan', given: ['Sara'] }],
            qualification: [{ code: { text: 'Pediatrics' } }]
          }
        }
      ]
    };
    const roles: FhirBundle<FhirPractitionerRole> = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'PractitionerRole',
            practitioner: { reference: 'Practitioner/p1' },
            specialty: [{ text: 'Cardiology' }]
          }
        }
      ]
    };

    const docs = bundleToDoctorRefs(practitioners, roles);
    expect(docs).toEqual([
      { id: 'p1', name: 'Dr Meera Rao', speciality: 'Cardiology' }, // from role
      { id: 'p2', name: 'Sara Khan', speciality: 'Pediatrics' } // fallback to qualification
    ]);
  });

  it('bundleToDoctorRefs falls back to "General" when no specialty is known', () => {
    const practitioners: FhirBundle<FhirPractitioner> = {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Practitioner', id: 'p3', name: [{ text: 'Dr Solo' }] } }]
    };
    expect(bundleToDoctorRefs(practitioners)).toEqual([{ id: 'p3', name: 'Dr Solo', speciality: 'General' }]);
  });

  it('instantToClinicLabel converts a UTC instant to an Asia/Kolkata slot label', () => {
    // 03:30 UTC = 09:00 IST (UTC+5:30)
    expect(instantToClinicLabel('2026-07-10T03:30:00Z')).toBe('09:00 AM');
    // 04:00 UTC = 09:30 IST
    expect(instantToClinicLabel('2026-07-10T04:00:00Z')).toBe('09:30 AM');
    // 08:30 UTC = 14:00 IST = 02:00 PM
    expect(instantToClinicLabel('2026-07-10T08:30:00Z')).toBe('02:00 PM');
    expect(instantToClinicLabel('not-a-date')).toBeNull();
  });

  it('slotBundleToLabels keeps only free slots, maps to labels, dedupes', () => {
    const bundle: FhirBundle<FhirSlot> = {
      resourceType: 'Bundle',
      entry: [
        { resource: { resourceType: 'Slot', status: 'free', start: '2026-07-10T03:30:00Z' } }, // 09:00 AM
        { resource: { resourceType: 'Slot', status: 'busy', start: '2026-07-10T04:00:00Z' } }, // dropped
        { resource: { resourceType: 'Slot', status: 'free', start: '2026-07-10T04:30:00Z' } }, // 10:00 AM
        { resource: { resourceType: 'Slot', status: 'free', start: '2026-07-10T03:30:00Z' } } // dupe 09:00
      ]
    };
    expect(slotBundleToLabels(bundle)).toEqual(['09:00 AM', '10:00 AM']);
  });

  it('patientToRecord maps name, phone and carries the EMR id', () => {
    const p: FhirPatient = {
      resourceType: 'Patient',
      id: 'e-42',
      name: [{ text: 'Ramesh Kumar' }],
      telecom: [{ system: 'email', value: 'r@x.com' }, { system: 'phone', value: '+919812345678' }],
      gender: 'male'
    };
    const rec = patientToRecord(p, 'clinic-1');
    expect(rec.id).toBe('e-42');
    expect(rec.name).toBe('Ramesh Kumar');
    expect(rec.phone).toBe('+919812345678');
    expect(rec.patientCode).toBe('EMR:e-42');
    expect(rec.source).toBe('emr');
    expect(rec.clinicId).toBe('clinic-1');
  });
});
