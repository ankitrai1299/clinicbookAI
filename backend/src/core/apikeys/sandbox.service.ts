// Sandbox clinics — the data half of TEST api keys.
//
// A partner's developer needs somewhere to POST fake bookings while they build.
// The cheapest correct answer is NOT an `isTest` flag on Appointment (which would
// have to be threaded through every query, dashboard widget, analytics rollup and
// reminder scan, and would be one forgotten `where` away from leaking). It is a
// second Clinic row. Every tenant-scoped query, the booking service, the waitlist
// and the webhook outbox are already clinic-scoped, so isolation comes for free
// and is enforced by machinery that is already tested.
//
// Exactly ONE thing is not clinic-scoped and therefore must be special-cased:
// outbound WhatsApp. reminder.service scans appointments across ALL clinics, and
// whatsapp.channel.resolveSendContext falls back to the PLATFORM'S OWN number
// when a clinic has no WhatsAppChannel row. Left alone, a sandbox booking would
// text a real phone from the real business number. isSandboxClinic() below is the
// guard the send path consults; see whatsapp.service.ts.

import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';

/** Mon–Sat, 09:00–17:00, 30-minute slots — enough for a partner to see real slots. */
const SEED_DOCTORS = [
  { name: 'Dr Asha Verma', speciality: 'General Physician', experienceYears: 8 },
  { name: 'Dr Rohit Nair', speciality: 'Dentist', experienceYears: 5 }
] as const;
const WORKING_DAYS = [1, 2, 3, 4, 5, 6];

// A clinic never changes its sandbox-ness, so this is a pure memo, not a TTL
// cache. It exists because isSandboxClinic() is called on the WhatsApp send path,
// which must not pay a database round-trip per message.
const sandboxFlagCache = new Map<string, boolean>();

/**
 * Is this clinic a sandbox? Consulted by the WhatsApp send path, so it answers
 * from memory after the first call. A missing/blank clinicId is NOT a sandbox —
 * that preserves the exact behaviour of every existing caller that omits it.
 */
export const isSandboxClinic = async (clinicId?: string | null): Promise<boolean> => {
  if (!clinicId) return false;

  const cached = sandboxFlagCache.get(clinicId);
  if (cached !== undefined) return cached;

  const row = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { isSandbox: true } });
  // An unknown clinic is not a sandbox, but do NOT memoise that: the row may
  // simply not be committed yet, and caching `false` for it would be permanent.
  if (!row) return false;

  sandboxFlagCache.set(clinicId, row.isSandbox);
  return row.isSandbox;
};

/** Test-only. The memo above would otherwise leak state between test cases. */
export const clearSandboxCache = (): void => sandboxFlagCache.clear();

/** The sandbox twin of a real clinic, or null if it has never minted a TEST key. */
export const findSandboxClinic = (realClinicId: string) =>
  prisma.clinic.findUnique({
    where: { sandboxOfId: realClinicId },
    select: { id: true, name: true }
  });

const seedSandboxData = async (sandboxClinicId: string): Promise<void> => {
  for (const seed of SEED_DOCTORS) {
    const doctor = await prisma.doctor.create({
      data: { clinicId: sandboxClinicId, name: seed.name, speciality: seed.speciality, experienceYears: seed.experienceYears },
      select: { id: true }
    });
    await prisma.doctorSchedule.createMany({
      data: WORKING_DAYS.map((dayOfWeek) => ({
        clinicId: sandboxClinicId,
        doctorId: doctor.id,
        dayOfWeek,
        startTime: '09:00',
        endTime: '17:00',
        slotMinutes: 30
      }))
    });
  }
};

/**
 * Find-or-create the sandbox twin of a clinic, seeded with demo doctors so
 * `GET /api/v1/doctors` and the slot endpoints return something on day one.
 *
 * Called from the TEST-key issue path, which two dashboard tabs can hit at once.
 * `Clinic.sandboxOfId` is UNIQUE, so the loser of that race gets P2002 and simply
 * re-reads the winner's row rather than creating an orphan twin.
 */
export const ensureSandboxClinic = async (realClinicId: string): Promise<string> => {
  const existing = await findSandboxClinic(realClinicId);
  if (existing) return existing.id;

  const real = await prisma.clinic.findUnique({ where: { id: realClinicId }, select: { name: true, isSandbox: true } });
  if (!real) throw new Error(`Clinic ${realClinicId} does not exist`);
  // A sandbox of a sandbox would be a second twin pointing at a twin — nonsense,
  // and it would let a TEST key mint further TEST keys.
  if (real.isSandbox) throw new Error('A sandbox clinic cannot have its own sandbox');

  try {
    const created = await prisma.clinic.create({
      data: {
        name: `${real.name} (Sandbox)`,
        // Clinic.email and .phone are UNIQUE. Derive both from the parent id so
        // they are collision-free and obviously non-routable.
        email: `sandbox+${realClinicId}@clinicbook.invalid`,
        phone: `sandbox:${realClinicId}`,
        isSandbox: true,
        sandboxOfId: realClinicId
      },
      select: { id: true }
    });
    await seedSandboxData(created.id);
    sandboxFlagCache.set(created.id, true);
    return created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await findSandboxClinic(realClinicId);
      if (winner) return winner.id;
    }
    throw err;
  }
};
