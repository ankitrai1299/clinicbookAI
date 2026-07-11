// Patient 360 — one endpoint keyed by the patient ID (internal cuid OR the
// human-friendly Patient Code, PT-XXXX) that returns EVERYTHING about a patient
// in one place: profile + booking/appointment history (ClinicBook) + consultation
// notes & prescriptions (MediScribe) + active medicine reminders. This is the
// single source you hand off / look up a patient by their ID.
//
// Composition layer (routes/) — it deliberately reads across ClinicBook,
// MediScribe and the reminder service, which the product modules themselves must
// not do. Clinic-scoped by the caller's JWT.

import { Router, type Request, type Response } from 'express';

import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { runWithClinic } from '../products/mediscribe/context.js';
import { buildPatientHistory } from '../products/mediscribe/services/patientHistory.js';

const router = Router();

const clinicOf = (req: Request): string => {
  const clinicId = (req as Request & { user?: { clinicId?: string } }).user?.clinicId;
  if (!clinicId) throw new AppError('Authentication required', 401);
  return clinicId;
};

// GET /api/patient-record/:idOrCode — the full 360 record for one patient.
router.get(
  '/:idOrCode',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    const key = String(req.params.idOrCode || '').trim();
    if (!key) throw new AppError('Patient id or code is required', 400);

    // Resolve by internal id OR Patient Code, scoped to the caller's clinic.
    const patient = await prisma.patient.findFirst({
      where: { clinicId, OR: [{ id: key }, { patientCode: key }] },
      select: {
        id: true, patientCode: true, name: true, age: true, gender: true,
        phone: true, language: true, healthConcern: true, createdAt: true
      }
    });
    if (!patient) throw new AppError('Patient not found', 404);

    // Booking / appointment history (ClinicBook), newest first.
    const appointments = await prisma.appointment.findMany({
      where: { clinicId, patientId: patient.id },
      orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
      include: { doctor: { select: { name: true, speciality: true } } }
    });

    // Consultation notes + prescriptions (MediScribe). The NovaDoc repos read the
    // clinic from AsyncLocalStorage, so run inside the tenant context.
    const consultations = await runWithClinic(clinicId, () => buildPatientHistory(patient.id, 'desc'));

    // Active medicine reminders (scheduled from the latest prescriptions).
    const medicineReminders = await prisma.medicineReminder.findMany({
      where: { clinicId, patientId: patient.id, active: true },
      orderBy: [{ nextRunAt: 'asc' }]
    });

    res.json({
      success: true,
      data: {
        patient: {
          id: patient.id,
          patientCode: patient.patientCode, // the portable PT-XXXX id
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          phone: patient.phone,
          language: patient.language,
          healthConcern: patient.healthConcern,
          registeredAt: patient.createdAt
        },
        bookings: appointments.map((a) => ({
          id: a.id,
          date: a.appointmentDate.toISOString().slice(0, 10),
          time: a.appointmentTime,
          status: a.status,
          doctorName: a.doctor?.name ?? null,
          speciality: a.doctor?.speciality ?? null
        })),
        consultations, // each item has chief complaints, diagnosis, medicines, follow-up
        medicines: medicineReminders.map((r) => ({
          drug: r.drug,
          times: r.times,
          startDate: r.startDate.toISOString().slice(0, 10),
          endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
          nextRunAt: r.nextRunAt.toISOString(),
          active: r.active
        })),
        summary: {
          totalBookings: appointments.length,
          totalConsultations: consultations.length,
          activeMedicines: medicineReminders.length
        }
      }
    });
  })
);

export default router;
