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
        // A full working day as the EMR sees it: some free, some busy. Note the
        // adapter must NOT ask for status=free — it needs the busy ones to tell
        // "not working" apart from "fully booked".
        return {
          resourceType: 'Bundle',
          entry: [
            { resource: { resourceType: 'Slot', status: 'free', start: '2026-07-10T03:30:00Z' } }, // 09:00 AM IST
            { resource: { resourceType: 'Slot', status: 'busy', start: '2026-07-10T04:00:00Z' } }, // 09:30 AM IST
            { resource: { resourceType: 'Slot', status: 'free', start: '2026-07-10T08:30:00Z' } } // 02:00 PM IST
          ]
        } as T;
      }
      if (path === '/SlotEmpty') {
        return { resourceType: 'Bundle', entry: [] } as T;
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

  it('slots.getAvailable maps free FHIR Slots to clinic-local labels and queries the whole day', async () => {
    const { ds, calls } = build();
    // Fixed clock well before the day starts, so nothing is filtered as past.
    const early = new Date('2026-07-09T00:00:00Z');
    const slots = await ds.slots.getAvailable('p1', '2026-07-10', early);
    expect(slots).toEqual(['09:00 AM', '02:00 PM']); // the 'busy' 09:30 is excluded

    const slotCall = calls.find((c) => c.path === '/Slot');
    expect(slotCall?.query).toMatchObject({
      'schedule.actor': 'Practitioner/p1',
      start: ['ge2026-07-10', 'lt2026-07-11']
    });
    // No status filter: we need the busy slots to distinguish "not working" from
    // "fully booked".
    expect(slotCall?.query).not.toHaveProperty('status');
  });

  it('slots.getAvailable drops past / near-past slots in CLINIC-LOCAL time', async () => {
    const { ds } = build();
    // 2026-07-10T07:00:00Z == 12:30 IST. With BOOKING_BUFFER_MIN=30, 09:00 AM is
    // long gone and 02:00 PM (14:00) is still >= 13:00, so only the latter stands.
    const midday = new Date('2026-07-10T07:00:00Z');
    expect(await ds.slots.getAvailable('p1', '2026-07-10', midday)).toEqual(['02:00 PM']);

    // Late enough that even 02:00 PM is inside the buffer -> nothing bookable.
    const late = new Date('2026-07-10T08:15:00Z'); // 13:45 IST; 14:00 < 13:45+30
    expect(await ds.slots.getAvailable('p1', '2026-07-10', late)).toEqual([]);
  });

  it('getDateAvailability separates a non-working day from a fully-booked one', async () => {
    const { ds } = build();
    // Any slot at all (even all busy) => the doctor works that day. The date picker
    // must be able to label it "Fully booked" rather than silently skip it.
    expect((await ds.slots.getDateAvailability('p1', '2026-07-10')).working).toBe(true);

    // An empty Slot bundle => not working. Point the stub at the empty path.
    const { transport } = makeStub();
    const emptyClient = new FhirClient({
      ...transport,
      get: <T,>(p: string, q?: Record<string, string | string[]>) =>
        transport.get<T>(p === '/Slot' ? '/SlotEmpty' : p, q)
    });
    const emptyDs = openEmrDataSource('clinic-1', emptyClient);
    expect(await emptyDs.slots.getDateAvailability('p1', '2026-07-10')).toEqual({ working: false, available: 0 });
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
