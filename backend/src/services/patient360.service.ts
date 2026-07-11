// Patient 360 aggregation — the single "everything about a patient, keyed by
// their id" record, reused by the REST endpoint (routes/patient360.routes.ts),
// the WhatsApp record skill, and the dashboards. Composition across ClinicBook +
// MediScribe + reminders lives here (a shared service), never inside a product.

import { prisma } from '../config/prisma.js';
import { runWithClinic } from '../products/mediscribe/context.js';
import { buildPatientHistory, type ConsultationHistoryItem } from '../products/mediscribe/services/patientHistory.js';
import { clinicNow, labelToMinutes, slotIsFuture } from './slotMath.js';

export interface PatientRecordBooking {
  id: string; date: string; time: string; status: string;
  doctorName: string | null; speciality: string | null;
}
export interface PatientRecordMedicine {
  drug: string; times: string[]; startDate: string; endDate: string | null;
  nextRunAt: string; active: boolean;
}
export interface PatientRecord {
  patient: {
    id: string; patientCode: string | null; name: string;
    age: number | null; gender: string | null; phone: string;
    language: string; healthConcern: string | null; registeredAt: string;
  };
  bookings: PatientRecordBooking[];
  consultations: ConsultationHistoryItem[];
  medicines: PatientRecordMedicine[];
  summary: { totalBookings: number; totalConsultations: number; activeMedicines: number };
}

/**
 * Full cross-product record for a patient, resolved by internal id OR Patient
 * Code (PT-XXXX), scoped to the clinic. Returns null if no such patient.
 */
export const getPatientRecord = async (
  clinicId: string,
  idOrCode: string
): Promise<PatientRecord | null> => {
  const key = String(idOrCode || '').trim();
  if (!key) return null;

  const patient = await prisma.patient.findFirst({
    where: { clinicId, OR: [{ id: key }, { patientCode: key }] },
    select: {
      id: true, patientCode: true, name: true, age: true, gender: true,
      phone: true, language: true, healthConcern: true, createdAt: true
    }
  });
  if (!patient) return null;

  const appointments = await prisma.appointment.findMany({
    where: { clinicId, patientId: patient.id },
    orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
    include: { doctor: { select: { name: true, speciality: true } } }
  });

  // NovaDoc repos read the clinic from AsyncLocalStorage — run in that context.
  const consultations = await runWithClinic(clinicId, () => buildPatientHistory(patient.id, 'desc'));

  const reminders = await prisma.medicineReminder.findMany({
    where: { clinicId, patientId: patient.id, active: true },
    orderBy: [{ nextRunAt: 'asc' }]
  });

  return {
    patient: {
      id: patient.id,
      patientCode: patient.patientCode,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone,
      language: patient.language,
      healthConcern: patient.healthConcern,
      registeredAt: patient.createdAt.toISOString()
    },
    bookings: appointments.map((a) => ({
      id: a.id,
      date: a.appointmentDate.toISOString().slice(0, 10),
      time: a.appointmentTime,
      status: a.status,
      doctorName: a.doctor?.name ?? null,
      speciality: a.doctor?.speciality ?? null
    })),
    consultations,
    medicines: reminders.map((r) => ({
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
      activeMedicines: reminders.length
    }
  };
};

// "09:00" (24h clinic-local) → "9:00 AM" for a patient-friendly WhatsApp line.
const prettyTime = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
};

const prettyDate = (ymd: string): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ymd
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
};

/** A concise, patient-facing WhatsApp summary of the record. */
export const formatRecordForWhatsApp = (r: PatientRecord): string => {
  const lines: string[] = [];
  const code = r.patient.patientCode ? ` (${r.patient.patientCode})` : '';
  lines.push(`👤 *Your record* — ${r.patient.name}${code}`);

  // Upcoming = live status AND actually in the future (clinic-local). A confirmed
  // slot that already passed is NOT upcoming — it becomes a recent visit.
  const now = clinicNow();
  const isFuture = (b: PatientRecordBooking) =>
    slotIsFuture(labelToMinutes(b.time) ?? 0, b.date, now);
  const upcoming = r.bookings
    .filter((b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && isFuture(b))
    .slice(0, 3);
  const recent = r.bookings.filter((b) => !isFuture(b) && b.status !== 'CANCELLED').slice(0, 2);

  if (upcoming.length) {
    lines.push('', '📅 *Upcoming appointments:*');
    for (const b of upcoming) {
      const doc = b.doctorName ? ` — ${b.doctorName.replace(/^dr\.?\s*/i, 'Dr. ')}` : '';
      lines.push(`• ${prettyDate(b.date)}, ${b.time}${doc}`);
    }
  }
  if (recent.length) {
    lines.push('', '🗓️ *Recent visits:*');
    for (const b of recent) {
      const doc = b.doctorName ? ` — ${b.doctorName.replace(/^dr\.?\s*/i, 'Dr. ')}` : '';
      lines.push(`• ${prettyDate(b.date)}, ${b.time}${doc}`);
    }
  }

  if (r.medicines.length) {
    lines.push('', '💊 *Current medicines:*');
    for (const m of r.medicines.slice(0, 8)) {
      lines.push(`• ${m.drug} — ${m.times.map(prettyTime).join(', ')}`);
    }
  }

  const last = r.consultations[0];
  if (last) {
    lines.push('', `📋 *Last visit* (${prettyDate((last.visitDateTime || '').slice(0, 10))}):`);
    if (last.diagnosis?.length) lines.push(`Diagnosis: ${last.diagnosis.join(', ')}`);
    if (last.medicines?.length) lines.push(`Prescribed: ${last.medicines.map((m) => m.medicine).filter(Boolean).join(', ')}`);
    if (last.followUp) lines.push(`Follow-up: ${last.followUp}`);
  }

  if (lines.length === 1) {
    lines.push('', 'Abhi aapke naam pe koi appointment, dawai ya visit record nahi hai. 🙏');
  }
  lines.push('', 'ℹ️ Ye aapke clinic record ka summary hai. Kisi sawaal ke liye clinic se poochein.');
  return lines.join('\n');
};
