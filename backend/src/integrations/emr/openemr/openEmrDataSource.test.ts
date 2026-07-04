import { describe, it, expect } from 'vitest';

import { FhirClient, type FhirTransport } from '../fhir/fhirClient.js';
import { openEmrDataSource } from './openEmrDataSource.js';

// A stub transport returning canned FHIR R4 bundles — proves the OpenEMR adapter
// wires search → mappers → domain correctly, with no network. `calls` records the
// requests so we can assert the adapter builds the right FHIR queries.
const makeStub = () => {
  const calls: Array<{ path: string; query?: Record<string, string | string[]> }> = [];
  const transport: FhirTransport = {
    async get<T>(path: string, query?: Record<string, string | string[]>): Promise<T> {
      calls.push({ path, query });
      if (path === '/Practitioner') {
        return {
          resourceType: 'Bundle',
          entry: [{ resource: { resourceType: 'Practitioner', id: 'p1', name: [{ text: 'Dr Meera Rao' }] } }]
        } as T;
      }
      if (path === '/PractitionerRole') {
        return {
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
        } as T;
      }
      if (path === '/Slot') {
        return {
          resourceType: 'Bundle',
          entry: [
            { resource: { resourceType: 'Slot', status: 'free', start: '2026-07-10T03:30:00Z' } }, // 09:00 AM IST
            { resource: { resourceType: 'Slot', status: 'busy', start: '2026-07-10T04:00:00Z' } }
          ]
        } as T;
      }
      if (path === '/Patient') {
        return {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Patient',
                id: 'e-42',
                name: [{ text: 'Ramesh Kumar' }],
                telecom: [{ system: 'phone', value: '+919812345678' }]
              }
            }
          ]
        } as T;
      }
      return { resourceType: 'Bundle', entry: [] } as T;
    },
    async post<T>(): Promise<T> {
      return { resourceType: 'Patient', id: 'e-new', name: [{ text: 'New Pt' }], telecom: [{ system: 'phone', value: '+911111111111' }] } as T;
    },
    async put<T>(): Promise<T> {
      return { resourceType: 'Appointment', id: 'a-1' } as T;
    }
  };
  return { transport, calls };
};

describe('OpenEMR FHIR data source', () => {
  const build = () => {
    const { transport, calls } = makeStub();
    return { ds: openEmrDataSource('clinic-1', new FhirClient(transport)), calls };
  };

  it('doctors.listRefs joins Practitioner + PractitionerRole', async () => {
    const { ds } = build();
    expect(await ds.doctors.listRefs()).toEqual([{ id: 'p1', name: 'Dr Meera Rao', speciality: 'Cardiology' }]);
  });

  it('doctors.listSpecialities derives from the roster', async () => {
    const { ds } = build();
    expect(await ds.doctors.listSpecialities()).toEqual(['Cardiology']);
  });

  it('slots.getAvailable maps free FHIR Slots to clinic-local labels and queries by day', async () => {
    const { ds, calls } = build();
    const slots = await ds.slots.getAvailable('p1', '2026-07-10');
    expect(slots).toEqual(['09:00 AM']);
    const slotCall = calls.find((c) => c.path === '/Slot');
    expect(slotCall?.query).toMatchObject({
      'schedule.actor': 'Practitioner/p1',
      start: ['ge2026-07-10', 'lt2026-07-11'],
      status: 'free'
    });
  });

  it('patients.findByPhone maps a FHIR Patient and carries the EMR id', async () => {
    const { ds } = build();
    const p = await ds.patients.findByPhone('+919812345678');
    expect(p?.name).toBe('Ramesh Kumar');
    expect(p?.patientCode).toBe('EMR:e-42');
  });

  it('doctor-roster writes are rejected (EMR-owned)', async () => {
    const { ds } = build();
    await expect(ds.doctors.create({ name: 'X', speciality: 'Y' })).rejects.toThrow(/managed in its EMR/);
  });
});
