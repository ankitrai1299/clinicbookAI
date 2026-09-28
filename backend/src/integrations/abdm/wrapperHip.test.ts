import { describe, it, expect, vi, beforeEach } from 'vitest';

// The database is the only thing mocked. The rules being tested here are about
// WHICH rows may be read, so the queries themselves are the subject.
const findFirst = vi.fn();
const findUnique = vi.fn();

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    appointment: { findFirst: (...a: unknown[]) => findFirst(...a) },
    patient: { findFirst: (...a: unknown[]) => findFirst(...a), findUnique: (...a: unknown[]) => findUnique(...a) }
  }
}));

vi.mock('./fhirBundle.js', () => ({
  buildConsultationBundle: (input: { consultationId: string }) => ({ id: input.consultationId })
}));

const { healthInformationFor } = await import('./wrapperHip.service.js');

const visit = (id: string, patientId: string) => ({
  id,
  clinicId: 'clinic_1',
  appointmentDate: new Date('2026-09-12T00:00:00Z'),
  appointmentTime: '10:00 AM',
  clinic: { name: 'anvaya clinic' },
  doctor: { name: 'Dr. Ankit Rai', speciality: 'General Physician' },
  patient: { name: 'Ruchi Kumari', gender: 'Female', age: 22, abhaAddress: 'ruchi@sbx', phone: '9939366919' },
  __patientId: patientId
});

describe('healthInformationFor — whose records leave the building', () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  // The whole security of this endpoint. An appointment id is not a secret —
  // it travels to the patient's app during discovery — so a request naming one
  // patient and another patient's visit must find nothing.
  it('asks for the care context AND the patient together, never the id alone', async () => {
    findFirst.mockResolvedValue(visit('appt_1', 'patient_1'));

    await healthInformationFor([
      { patientReference: 'patient_1', careContextReference: 'appt_1' }
    ]);

    expect(findFirst).toHaveBeenCalledTimes(1);
    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: 'appt_1', patientId: 'patient_1' });
  });

  it('returns nothing for a visit that is not that patient’s', async () => {
    // The pairing check fails in the database, so no row comes back.
    findFirst.mockResolvedValue(null);

    const out = await healthInformationFor([
      { patientReference: 'patient_1', careContextReference: 'someone_elses_visit' }
    ]);

    expect(out).toEqual([]);
  });

  // One bad reference must not withhold records the patient did consent to.
  it('drops only the pair that fails, and still answers for the rest', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(visit('appt_2', 'patient_1'));

    const out = await healthInformationFor([
      { patientReference: 'patient_1', careContextReference: 'bad' },
      { patientReference: 'patient_1', careContextReference: 'appt_2' }
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].careContextReference).toBe('appt_2');
  });

  it('hands the wrapper a serialised bundle, not an object', async () => {
    findFirst.mockResolvedValue(visit('appt_1', 'patient_1'));

    const out = await healthInformationFor([
      { patientReference: 'patient_1', careContextReference: 'appt_1' }
    ]);

    expect(typeof out[0].bundleContent).toBe('string');
    expect(JSON.parse(out[0].bundleContent)).toEqual({ id: 'appt_1' });
  });

  it('asks for nothing when given nothing', async () => {
    expect(await healthInformationFor([])).toEqual([]);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
