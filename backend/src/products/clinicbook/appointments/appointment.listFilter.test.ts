import { describe, it, expect, vi } from 'vitest';
import { AppointmentStatus } from '@prisma/client';

// The native adapter turns an AppointmentListFilter into a Prisma query. These
// assert the QUERY it builds, because the whole point of the filter is that the
// database does the narrowing — a filter that silently produced the old
// "everything for this clinic" query would look identical from the outside while
// still dragging a clinic's entire history across the wire.

const findMany = vi.fn().mockResolvedValue([]);
vi.mock('../../../config/tenantPrisma.js', () => ({
  forClinic: () => ({ appointment: { findMany } })
}));

const { nativeAppointments } = await import('./appointment.native');
const port = nativeAppointments('c1');

const whereOf = () => findMany.mock.calls.at(-1)![0].where;
const argsOf = () => findMany.mock.calls.at(-1)![0];

describe('native list() — filter → query', () => {
  it('without a filter, asks only for the clinic (unchanged behaviour)', async () => {
    findMany.mockClear();
    await port.list();
    expect(whereOf()).toEqual({ clinicId: 'c1' });
    expect(argsOf().take).toBeUndefined();
  });

  it('turns fromDate into an inclusive lower bound at the start of that day', async () => {
    findMany.mockClear();
    await port.list({ fromDate: '2026-08-04' });
    expect(whereOf().appointmentDate).toEqual({ gte: new Date('2026-08-04T00:00:00.000Z') });
  });

  it('turns toDate into an inclusive upper bound at the END of that day', async () => {
    // Midnight would silently drop every appointment ON the closing day — the
    // dates are stored at 00:00Z but the range has to cover the whole day.
    findMany.mockClear();
    await port.list({ toDate: '2026-08-04' });
    expect(whereOf().appointmentDate).toEqual({ lte: new Date('2026-08-04T23:59:59.999Z') });
  });

  it('supports a single-day window (from === to)', async () => {
    findMany.mockClear();
    await port.list({ fromDate: '2026-08-04', toDate: '2026-08-04' });
    expect(whereOf().appointmentDate).toEqual({
      gte: new Date('2026-08-04T00:00:00.000Z'),
      lte: new Date('2026-08-04T23:59:59.999Z')
    });
  });

  it('pushes status, doctor, patient and limit into the query', async () => {
    findMany.mockClear();
    await port.list({
      statuses: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
      doctorId: 'd1',
      patientId: 'p1',
      limit: 50
    });
    expect(whereOf()).toEqual({
      clinicId: 'c1',
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      doctorId: 'd1',
      patientId: 'p1'
    });
    expect(argsOf().take).toBe(50);
  });

  it('ignores an empty status list rather than asking for status IN ()', async () => {
    findMany.mockClear();
    await port.list({ statuses: [] });
    expect(whereOf()).toEqual({ clinicId: 'c1' });
  });

  it('always scopes to the clinic, whatever else is asked for', async () => {
    findMany.mockClear();
    await port.list({ patientId: 'p1' });
    expect(whereOf().clinicId).toBe('c1');
  });

  it('keeps date-then-time ordering', async () => {
    findMany.mockClear();
    await port.list({ fromDate: '2026-08-04' });
    expect(argsOf().orderBy).toEqual([{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }]);
  });
});
