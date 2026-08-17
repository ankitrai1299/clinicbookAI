// Everything we hold about one patient, in one machine-readable file.
//
// The hard part of a data export is not writing it — it is being able to say it
// is COMPLETE. A partial export is worse than none: it answers a legal request
// with a document that looks authoritative and is wrong, and nobody finds out
// until the one table that was forgotten turns up somewhere else.
//
// So completeness is not a promise in a comment. EXPORTED and NOT_PATIENT_DATA
// below are DATA, and a test parses schema.prisma and fails the build if any
// table that can hold something about a patient is in neither list. Adding a
// table that stores patient data and forgetting this file is a build failure,
// not a silent gap.
//
// The same idea as config/tenancy.test.ts, applied to the other direction: that
// one asks "is every clinic-owned table isolated?", this one asks "is every
// patient-owned table exported?".

import { prisma } from '../../config/prisma.js';
import { phoneKey } from '../consent/consent.service.js';

/**
 * Tables that hold something about a patient and therefore appear in an export.
 *
 * The value is a short note on WHAT the patient is being given, because an
 * export is read by someone who has never seen our schema.
 */
export const EXPORTED: Readonly<Record<string, string>> = {
  Patient: 'your record with this clinic — name, phone, age, language',
  Appointment: 'every appointment booked, changed or cancelled',
  Waitlist: 'times you were on the waiting list for a slot',
  MedicineReminder: 'medicine reminders scheduled for you',
  PatientEvent: 'your care timeline',
  AiConversation: 'your conversations with the clinic assistant',
  NovaDoc: 'your consultations, notes, reports and prescriptions',
  ConsultationNote: 'structured consultation notes',
  PatientConsent: 'what you agreed to, and what you withdrew',
  PatientRightsRequest: 'requests you have made about your data',
  WhatsAppLog: 'messages this clinic sent to your number',
  WhatsAppAudit: 'messages you sent, and how the system understood them',
  WhatsAppSession: 'where you were in a booking conversation',
  ConversationSession: 'the same, for the newer assistant',
  WhatsAppPatientBinding: 'which clinic your number is connected to',
  AuditLog: 'who accessed your record, and when'
};

/**
 * Tables that hold no personal data about a patient, with the reason.
 *
 * Kept as data so the completeness test can tell "deliberately out" from
 * "nobody noticed" — the same distinction UNSCOPED_BY_DESIGN makes for tenancy.
 */
export const NOT_PATIENT_DATA: Readonly<Record<string, string>> = {
  Clinic: 'the clinic itself, not a patient',
  User: 'clinic staff accounts',
  EmailOtp: 'a staff signup code',
  AppPassword: 'a staff device credential',
  Doctor: 'a doctor, who is a clinic resource rather than a patient',
  DoctorSchedule: 'a doctor’s working hours',
  DoctorLeave: 'a doctor’s leave',
  Notification: 'staff dashboard notifications, about the clinic’s own workload',
  Reminder: 'the delivery record of a reminder, reached only through its appointment',
  AiMessage: 'the messages inside AiConversation, exported with their conversation',
  ApiKey: 'a partner integration credential',
  IdempotencyKey: 'a partner’s retry token',
  WebhookEndpoint: 'a partner’s callback URL',
  WebhookDelivery: 'the delivery attempt of one of those callbacks',
  WhatsAppChannel: 'the clinic’s own WhatsApp connection',
  WhatsAppTemplateStatus: 'approval state of the clinic’s message templates',
  WhatsAppConversation: 'only a timestamp of your last message, used to decide whether we may reply',
  WhatsAppSendCounter: 'a per-clinic daily send count, with no patient in it',
  ProcessedInboundMessage: 'a de-duplication marker holding only a message id',
  CronLock: 'a background-job lease',
  ExternalIdMap: 'the mapping between our ids and an external EMR’s',
  SecurityAlert: 'a detected pattern, holding counts rather than patient data'
};

export interface PatientExport {
  generatedAt: string;
  clinicId: string;
  patientId: string;
  /** Plain-language index, so the file is readable by the person it is about. */
  contents: Record<string, string>;
  data: Record<string, unknown>;
  notes: string[];
}

/**
 * Build the export.
 *
 * Reads with the RAW client and an explicit clinicId + patientId on every query:
 * this runs for one named patient in one named clinic, and writing the filter by
 * hand here — while the tenant-scoped client protects the routes — means a bug
 * in either layer cannot silently widen the other.
 */
export const buildPatientExport = async (clinicId: string, patientId: string): Promise<PatientExport> => {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: {
      id: true,
      patientCode: true,
      name: true,
      phone: true,
      language: true,
      age: true,
      gender: true,
      healthConcern: true,
      source: true,
      createdAt: true
    }
  });
  if (!patient) throw new Error('Patient not found in this clinic');

  const key = phoneKey(patient.phone);
  const notes: string[] = [];

  const [
    appointments,
    waitlist,
    medicineReminders,
    timeline,
    conversations,
    novaDocs,
    consultationNotes,
    consents,
    rightsRequests,
    outboundMessages,
    inboundMessages,
    bookingState,
    assistantState,
    binding,
    accessLog
  ] = await Promise.all([
    prisma.appointment.findMany({ where: { clinicId, patientId }, orderBy: { appointmentDate: 'desc' } }),
    prisma.waitlist.findMany({ where: { clinicId, patientId } }),
    prisma.medicineReminder.findMany({ where: { clinicId, patientId } }),
    prisma.patientEvent.findMany({ where: { clinicId, patientId }, orderBy: { at: 'desc' } }),
    prisma.aiConversation.findMany({ where: { clinicId, patientId }, include: { messages: true } }),
    prisma.novaDoc.findMany({ where: { clinicId, patientId } }),
    prisma.consultationNote.findMany({ where: { clinicId, patientId } }),
    prisma.patientConsent.findMany({ where: { clinicId, patientId } }),
    prisma.patientRightsRequest.findMany({ where: { clinicId, patientId } }),
    // Message logs are keyed by the phone number, not the patient id.
    key
      ? prisma.whatsAppLog.findMany({ where: { clinicId, to: { contains: key } }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
    key
      ? prisma.whatsAppAudit.findMany({ where: { clinicId, phone: { contains: key } }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
    key ? prisma.whatsAppSession.findMany({ where: { clinicId, phone: { contains: key } } }) : Promise.resolve([]),
    prisma.conversationSession.findMany({ where: { clinicId, patientId } }),
    key ? prisma.whatsAppPatientBinding.findMany({ where: { phone: { contains: key } } }) : Promise.resolve([]),
    // WHO looked at this record. The staff member's identity is reduced to their
    // ROLE: the patient is entitled to know their file was opened by a doctor at
    // 3pm; naming the individual turns a transparency right into a way to single
    // out a member of staff.
    prisma.auditLog.findMany({
      where: { clinicId, patientId },
      select: { action: true, actorRole: true, actorType: true, outcome: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000
    })
  ]);

  if (!key) {
    notes.push(
      'This record has no phone number, so WhatsApp messages could not be matched to it. ' +
        'If you message this clinic from a number that is not on your record, tell them so it can be linked.'
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    clinicId,
    patientId,
    contents: EXPORTED,
    data: {
      Patient: patient,
      Appointment: appointments,
      Waitlist: waitlist,
      MedicineReminder: medicineReminders,
      PatientEvent: timeline,
      AiConversation: conversations,
      NovaDoc: novaDocs,
      ConsultationNote: consultationNotes,
      PatientConsent: consents,
      PatientRightsRequest: rightsRequests,
      WhatsAppLog: outboundMessages,
      WhatsAppAudit: inboundMessages,
      WhatsAppSession: bookingState,
      ConversationSession: assistantState,
      WhatsAppPatientBinding: binding,
      AuditLog: accessLog
    },
    notes
  };
};

/** A count per section — what the patient is told on WhatsApp, without the data. */
export const summariseExport = (exported: PatientExport): Record<string, number> =>
  Object.fromEntries(
    Object.entries(exported.data).map(([table, rows]) => [
      table,
      Array.isArray(rows) ? rows.length : rows ? 1 : 0
    ])
  );
