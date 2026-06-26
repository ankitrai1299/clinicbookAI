import OpenAI from 'openai';

import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { forClinic } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';
import { isWhatsAppConfigured } from '../../config/whatsapp.js';
import { cancelAppointment, createAppointment, getAppointments, updateAppointment } from '../appointments/appointment.service.js';
import { createDoctor, getDoctors, updateDoctor } from '../doctors/doctor.service.js';
import { createPatient, getPatients, updatePatient } from '../patients/patient.service.js';
import { addToWaitlist, claimWaitlistOffer } from '../waitlist/waitlist.service.js';
import { sendWhatsAppTextMessage } from '../whatsapp/whatsapp.service.js';
import { getAvailableSlots, isSlotAvailable } from '../../services/scheduling.service.js';

// Meta expects digits-only E.164 (no '+', spaces or dashes). Numbers must be
// stored in full international format (e.g. "919876543210") to be deliverable.
const toWhatsAppNumber = (phone: string): string => phone.replace(/\D/g, '');

const getClient = () => {
  if (!env.OPENAI_API_KEY) {
    throw new AppError('AI assistant is not configured. Add OPENAI_API_KEY to backend/.env', 503);
  }
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
};

const AI_MODEL = 'gpt-4.1-mini';

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_patients',
      description: 'Search for patients by name or phone number. Use before creating an appointment to find patient IDs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name or phone number fragment to search' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_doctors',
      description: 'Search for doctors by name or speciality. Use before creating an appointment to find doctor IDs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name or speciality to search' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_today_schedule',
      description: "Get all appointments scheduled for today, ordered by time.",
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_appointments',
      description: 'Search and filter appointments. Omit all filters to get all appointments.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Filter by date YYYY-MM-DD' },
          patientName: { type: 'string', description: 'Filter by patient name (partial match)' },
          doctorName: { type: 'string', description: 'Filter by doctor name (partial match)' },
          status: {
            type: 'string',
            enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'],
            description: 'Filter by appointment status'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_doctor',
      description: 'Create a new doctor record.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full name, e.g. "Dr. Sharma"' },
          speciality: { type: 'string', description: 'Medical speciality, e.g. "Cardiologist"' }
        },
        required: ['name', 'speciality']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_doctor',
      description: 'Update an existing doctor. Search for the doctor first to get their ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Doctor ID' },
          name: { type: 'string', description: 'New name' },
          speciality: { type: 'string', description: 'New speciality' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_patient',
      description: 'Create a new patient record.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Patient full name' },
          phone: { type: 'string', description: 'Phone number' },
          language: { type: 'string', description: 'Preferred language, defaults to English' }
        },
        required: ['name', 'phone']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_patient',
      description: 'Update an existing patient. Search for the patient first to get their ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Patient ID' },
          name: { type: 'string', description: 'New name' },
          phone: { type: 'string', description: 'New phone number' },
          language: { type: 'string', description: 'New preferred language' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment',
      description: 'Book an appointment. You must resolve patientId and doctorId first via search tools.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'Patient ID' },
          doctorId: { type: 'string', description: 'Doctor ID' },
          appointmentDate: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          appointmentTime: { type: 'string', description: 'Time e.g. "10:00 AM" or "14:30"' }
        },
        required: ['patientId', 'doctorId', 'appointmentDate', 'appointmentTime']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancel an appointment. Search appointments first to get the ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Appointment ID to cancel' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_to_waitlist',
      description: 'Add a patient to the waitlist. You must have the patient ID.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'Patient ID' },
          priority: { type: 'number', description: 'Priority (lower = higher priority), defaults to 0' }
        },
        required: ['patientId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_whatsapp_message',
      description:
        "Send a WhatsApp message to a patient. Resolves the patient's phone number from the database " +
        'and sends it through the real WhatsApp Cloud API; every send is recorded in WhatsAppLog. ' +
        'Use search_patients (and search_appointments for appointment details) first to get the patientId ' +
        'and the real facts. Compose the full, personalised message text yourself based on the staff ' +
        "member's intent (confirmation, reminder, cancellation notice, etc.). To message several patients, " +
        'call this tool once per patient.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'ID of the patient to message (from search_patients)' },
          message: { type: 'string', description: 'The full, ready-to-send message text' }
        },
        required: ['patientId', 'message']
      }
    }
  }
];

const executeTool = async (
  name: string,
  args: Record<string, unknown>,
  clinicId: string
): Promise<unknown> => {
  const db = forClinic(clinicId);
  switch (name) {
    case 'search_patients': {
      const q = args.query as string;
      return db.patient.findMany({
        where: {
          clinicId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } }
          ]
        },
        orderBy: { name: 'asc' },
        take: 10
      });
    }

    case 'search_doctors': {
      const q = args.query as string;
      return db.doctor.findMany({
        where: {
          clinicId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { speciality: { contains: q, mode: 'insensitive' } }
          ]
        },
        orderBy: { name: 'asc' },
        take: 10
      });
    }

    case 'get_today_schedule': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return db.appointment.findMany({
        where: { clinicId, appointmentDate: { gte: today, lt: tomorrow } },
        include: {
          doctor: { select: { id: true, name: true, speciality: true } },
          patient: { select: { id: true, name: true, phone: true } }
        },
        orderBy: { appointmentTime: 'asc' }
      });
    }

    case 'search_appointments': {
      const { date, patientName, doctorName, status } = args as {
        date?: string; patientName?: string; doctorName?: string; status?: string;
      };
      const all = await getAppointments(clinicId);
      return all.filter(a => {
        if (date && !a.appointmentDate.toISOString().startsWith(date)) return false;
        if (status && a.status !== status) return false;
        if (patientName && !a.patient?.name.toLowerCase().includes(patientName.toLowerCase())) return false;
        if (doctorName && !a.doctor?.name.toLowerCase().includes(doctorName.toLowerCase())) return false;
        return true;
      });
    }

    case 'create_doctor':
      return createDoctor(clinicId, { name: args.name as string, speciality: args.speciality as string });

    case 'update_doctor':
      return updateDoctor(clinicId, args.id as string, {
        name: args.name as string | undefined,
        speciality: args.speciality as string | undefined
      });

    case 'create_patient':
      return createPatient(clinicId, {
        name: args.name as string,
        phone: args.phone as string,
        language: (args.language as string) ?? 'English'
      });

    case 'update_patient':
      return updatePatient(clinicId, args.id as string, {
        name: args.name as string | undefined,
        phone: args.phone as string | undefined,
        language: args.language as string | undefined
      });

    case 'create_appointment':
      return createAppointment(clinicId, {
        patientId: args.patientId as string,
        doctorId: args.doctorId as string,
        appointmentDate: args.appointmentDate as string,
        appointmentTime: args.appointmentTime as string
      });

    case 'cancel_appointment':
      return cancelAppointment(clinicId, args.id as string);

    case 'add_to_waitlist':
      return addToWaitlist(clinicId, {
        patientId: args.patientId as string,
        priority: (args.priority as number) ?? 0
      });

    case 'send_whatsapp_message': {
      if (!isWhatsAppConfigured()) {
        return { success: false, error: 'WhatsApp is not configured on this server (WHATSAPP_TOKEN / PHONE_NUMBER_ID / VERIFY_TOKEN).' };
      }

      const patient = await db.patient.findFirst({
        where: { id: args.patientId as string, clinicId },
        select: { id: true, name: true, phone: true }
      });
      if (!patient) {
        return { success: false, error: 'Patient not found in this clinic. Search for the patient first.' };
      }

      const body = String(args.message ?? '').trim();
      if (!body) {
        return { success: false, error: 'Message text is empty.' };
      }

      // sendWhatsAppTextMessage writes to WhatsAppLog on BOTH success and failure,
      // then throws on failure — so we report the real outcome to the model rather
      // than letting it assume the message was delivered.
      try {
        const response = await sendWhatsAppTextMessage({
          to: toWhatsAppNumber(patient.phone),
          body,
          clinicId
        });
        return {
          success: true,
          patient: patient.name,
          to: patient.phone,
          waMessageId: response.data.messages?.[0]?.id ?? null,
          note: 'Accepted by WhatsApp and recorded in WhatsAppLog as "sent". Delivery is confirmed separately via the status webhook.'
        };
      } catch (err) {
        return {
          success: false,
          patient: patient.name,
          to: patient.phone,
          error: err instanceof Error ? err.message : String(err),
          note: 'Send failed and was recorded in WhatsAppLog as "failed". Tell the user it did not send and relay the EXACT reason from the error field — e.g. "Authentication Error" / code 190 means the WhatsApp access token is expired or invalid; a 24h customer-service window error means free-form text is blocked until the patient messages first. Do not guess the cause.'
        };
      }
    }

    default:
      throw new AppError(`Unknown tool: ${name}`, 400);
  }
};

const getOrCreateConversation = async (clinicId: string, userId: string, conversationId?: string) => {
  const db = forClinic(clinicId);
  if (conversationId) {
    const existing = await db.aiConversation.findFirst({
      where: { id: conversationId, clinicId, userId },
      select: { id: true }
    });
    if (existing) return existing;
  }
  return db.aiConversation.create({ data: { clinicId, userId } });
};

const SYSTEM_PROMPT = `You are an AI admin assistant for ClinicBook AI, a clinic management system. Help clinic staff manage doctors, patients, appointments, and waitlists.

Rules:
- Always call tools to perform actions — never just describe what to do.
- Before booking an appointment, search for the patient and doctor by name to get their IDs.
- For relative dates (tomorrow, next Monday), calculate from today: {TODAY}.
- After each action, briefly confirm what was done with key details.
- Keep responses concise and professional.
- If required info is missing, search existing records first before asking the user.
- To send a WhatsApp message, first look up the real facts (patient via search_patients, and the
  appointment via search_appointments when the message is about a booking) so the message is accurate —
  never invent dates, times, or doctor names. Then call send_whatsapp_message with the patientId and the
  full composed text. Report the ACTUAL result the tool returns: if success is false, tell the user it
  failed and why — do not claim a message was sent when it was not.

Today's date: {TODAY}`;

export const chat = async (
  clinicId: string,
  userId: string,
  message: string,
  conversationId?: string
) => {
  const client = getClient();
  const db = forClinic(clinicId);
  const conversation = await getOrCreateConversation(clinicId, userId, conversationId);

  const history = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 20
  });

  await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: 'USER', content: message }
  });

  const today = new Date().toISOString().split('T')[0];
  const system = SYSTEM_PROMPT.replace(/{TODAY}/g, today);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...history.map(m => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user', content: message }
  ];

  // Agentic tool-use loop, bounded to a fixed number of steps. An unbounded
  // `while (true)` let a single authenticated request drive an arbitrary number
  // of sequential OpenAI calls (cost-amplification + event-loop starvation).
  const MAX_STEPS = 8;
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto'
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // Final text response
      const assistantText = msg.content ?? '';

      await prisma.aiMessage.create({
        data: { conversationId: conversation.id, role: 'ASSISTANT', content: assistantText }
      });
      await db.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      });

      return { conversationId: conversation.id, message: assistantText };
    }

    // Execute all tool calls
    for (const toolCall of msg.tool_calls) {
      // OpenAI SDK v6 types tool_calls as a union of function and custom tool
      // calls; we only register function tools, so narrow before reading .function.
      if (toolCall.type !== 'function') {
        continue;
      }

      let result: unknown;
      try {
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        result = await executeTool(toolCall.function.name, args, clinicId);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Unknown error' };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }
  }

  // Step budget exhausted without the model producing a final text answer.
  // Return a graceful message instead of looping indefinitely.
  const fallback =
    "I couldn't finish that request in time. Please try rephrasing it or breaking it into smaller steps.";
  await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: 'ASSISTANT', content: fallback }
  });
  await db.aiConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() }
  });
  return { conversationId: conversation.id, message: fallback };
};

export const getHistory = async (clinicId: string, userId: string, conversationId: string) => {
  const db = forClinic(clinicId);
  const conv = await db.aiConversation.findFirst({
    where: { id: conversationId, clinicId, userId },
    select: { id: true }
  });
  if (!conv) throw new AppError('Conversation not found', 404);

  return prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' }
  });
};

export const listDoctors = (clinicId: string) => getDoctors(clinicId);
export const listPatients = (clinicId: string) => getPatients(clinicId);

// Patient-facing WhatsApp concierge reply. Unlike `chat` (the staff dashboard
// assistant, which has clinic-management tools and DB access), this has NO tools
// and NO access to other patients' data — it only returns a short, friendly text
// reply. Safe to expose to inbound patient messages. Falls back to a canned
// message if OpenAI is unconfigured or errors, so the bot always answers.
export const patientAssistantReply = async (
  clinicName: string,
  patientName: string,
  message: string
): Promise<string> => {
  const fallback =
    `Thanks ${patientName}! A team member at ${clinicName} will assist you shortly.\n\n` +
    `Reply:\n1 - Book Appointment\n2 - Talk to AI Assistant\n3 - View Available Slots`;

  if (!env.OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const client = getClient();
    const res = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            `You are the friendly WhatsApp assistant for ${clinicName}, a medical clinic, ` +
            `speaking directly to a patient named ${patientName}. Keep replies concise ` +
            `(2-4 short sentences) and warm. You may help with booking, clinic hours, ` +
            `directions, services and general questions. You cannot access medical records ` +
            `or give medical diagnoses — for clinical concerns, advise contacting the clinic ` +
            `directly. Never reveal other patients' information. When relevant, remind them ` +
            `they can reply 1 to book, 2 to chat, or 3 to view available slots.`
        },
        { role: 'user', content: message }
      ]
    });
    return res.choices[0]?.message?.content?.trim() || fallback;
  } catch (err) {
    console.error('[AI] patientAssistantReply failed:', err);
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Patient-facing INTENT CLASSIFIER (the ONLY AI in the WhatsApp booking flow).
//
// The booking experience is a deterministic state machine (whatsapp.booking.ts).
// The LLM is NOT in the control loop. Its single job here is natural-language
// understanding: map a free-text patient message to (a) a coarse intent and
// (b) — when they typed a speciality in words — the matching speciality from the
// clinic's REAL list. It never picks slots, never books, never writes prose.
// A keyword fallback keeps it fully functional with no OpenAI key.
// ---------------------------------------------------------------------------

export type PatientIntent = 'book' | 'cancel' | 'reschedule' | 'check' | 'menu' | 'unknown';

export interface PatientMessageClassification {
  intent: PatientIntent;
  // Exactly one of `specialities` (case-insensitive) or null. Never invented.
  speciality: string | null;
}

// Deterministic keyword fallback — also the first pass before spending an API
// call, so obvious messages never hit OpenAI.
const keywordClassify = (message: string, specialities: string[]): PatientMessageClassification => {
  const t = message.toLowerCase();

  const speciality =
    specialities.find((s) => t.includes(s.toLowerCase())) ??
    // common shorthands → speciality substring
    (/(heart|cardio)/.test(t) ? specialities.find((s) => /cardio/i.test(s)) : undefined) ??
    (/(skin|derma)/.test(t) ? specialities.find((s) => /derma/i.test(s)) : undefined) ??
    (/(child|kid|paedia|pedia)/.test(t) ? specialities.find((s) => /p(a)?edia/i.test(s)) : undefined) ??
    (/(bone|ortho)/.test(t) ? specialities.find((s) => /ortho/i.test(s)) : undefined) ??
    null;

  let intent: PatientIntent = 'unknown';
  if (/\b(cancel|delete|remove)\b/.test(t)) intent = 'cancel';
  else if (/\b(reschedul|postpone|change.*(time|date|appoint)|move.*(appoint|time))\b/.test(t)) intent = 'reschedule';
  else if (/\b(book|appointment|schedule|consult|see a|meet|doctor|appt)\b/.test(t) || speciality) intent = 'book';
  else if (/\b(my appointment|status|when is|upcoming|check|view|show)\b/.test(t)) intent = 'check';
  else if (/^\s*(hi+|hey+|hello+|menu|start|help|options?|namaste|hola)\b/.test(t)) intent = 'menu';

  return { intent, speciality: speciality ?? null };
};

export const classifyPatientMessage = async (
  message: string,
  specialities: string[]
): Promise<PatientMessageClassification> => {
  const fallback = keywordClassify(message, specialities);

  // If the keyword pass already nailed both intent and (when relevant) speciality,
  // skip the API call entirely.
  if (!env.OPENAI_API_KEY) return fallback;
  if (fallback.intent !== 'unknown' && (fallback.intent !== 'book' || fallback.speciality)) {
    return fallback;
  }

  try {
    const client = getClient();
    const res = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 80,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an intent classifier for a clinic WhatsApp receptionist. You do NOT chat or book. ' +
            'Read the patient message and return ONLY a JSON object: ' +
            '{"intent": one of ["book","cancel","reschedule","check","menu","unknown"], ' +
            '"speciality": one EXACT value from the provided list that the patient is asking for, or null}. ' +
            'Map informal words to the list (e.g. "heart doctor"→a cardiology speciality, "skin"→dermatology). ' +
            'Never invent a speciality that is not in the list. ' +
            `Available specialities: ${JSON.stringify(specialities)}.`
        },
        { role: 'user', content: message }
      ]
    });

    const raw = res.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw) as { intent?: string; speciality?: string | null };

    const intent: PatientIntent = (['book', 'cancel', 'reschedule', 'check', 'menu', 'unknown'] as const).includes(
      parsed.intent as PatientIntent
    )
      ? (parsed.intent as PatientIntent)
      : fallback.intent;

    // Only accept a speciality that really exists in the clinic's list.
    const matched =
      parsed.speciality && specialities.find((s) => s.toLowerCase() === String(parsed.speciality).toLowerCase());

    return { intent, speciality: matched ?? fallback.speciality };
  } catch (err) {
    console.error('[AI] classifyPatientMessage failed — using keyword fallback:', err);
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Enriched receptionist UNDERSTANDING (NLU only — never acts).
//
// Used by the AI Receptionist layer (whatsapp.receptionist.ts) when
// WA_AI_RECEPTIONIST is on. It extends classifyPatientMessage with entity
// extraction (date phrase, doctor name), a confidence score, a short FAQ answer
// for generic capability questions, and an explicit "human" intent. It returns
// ONLY structured understanding — it picks no slot, books nothing. The caller
// resolves the date deterministically and validates speciality/doctor against
// the DB. Returns null when OpenAI is unconfigured or errors, so the caller
// falls back to the deterministic keyword classifier.
// ---------------------------------------------------------------------------

export type ReceptionistIntent =
  | 'book'
  | 'cancel'
  | 'reschedule'
  | 'check'
  | 'availability'
  | 'faq'
  | 'human'
  | 'menu'
  | 'unknown';

export interface PatientUnderstanding {
  intent: ReceptionistIntent;
  speciality: string | null; // EXACT value from the provided list, or null
  doctorName: string | null; // EXACT value from the provided list, or null
  dateText: string | null; // the raw date PHRASE ("tomorrow", "friday"); not resolved
  confidence: number; // 0..1
  faqAnswer: string | null; // short answer for a generic capability question, else null
}

const RECEPTIONIST_INTENTS: ReceptionistIntent[] = [
  'book',
  'cancel',
  'reschedule',
  'check',
  'availability',
  'faq',
  'human',
  'menu',
  'unknown'
];

export const understandPatientMessage = async (
  message: string,
  specialities: string[],
  doctorNames: string[]
): Promise<PatientUnderstanding | null> => {
  if (!env.OPENAI_API_KEY) return null;

  try {
    const client = getClient();
    const res = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 200,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are the natural-language UNDERSTANDING layer for a clinic WhatsApp receptionist. ' +
            'You do NOT chat, book, cancel, reschedule, or pick slots — a deterministic state machine does all of that. ' +
            'Read ONE patient message and return ONLY a JSON object with these fields: ' +
            '{"intent": one of ["book","cancel","reschedule","check","availability","faq","human","menu","unknown"], ' +
            '"speciality": one EXACT value from the speciality list or null, ' +
            '"doctorName": one EXACT value from the doctor list or null, ' +
            '"dateText": the literal date/day phrase the patient used (e.g. "tomorrow","friday","12 June") or null — DO NOT resolve it to a calendar date, ' +
            '"confidence": a number 0..1 for how clearly the message expresses a single actionable intent, ' +
            '"faqAnswer": ONLY when intent is "faq" AND it is a general capability question (what can you do, which doctors/specialities, how booking works), a friendly 1-2 sentence answer; otherwise null}. ' +
            'Intent guide: "availability" = asking whether a doctor/speciality is free (e.g. "is Dr Ruchi available today"); ' +
            '"human" = wants a person/staff/receptionist; "menu" = a bare greeting; "unknown" = unclear/none. ' +
            'NEVER invent a speciality or doctor not in the provided lists. Map informal words ("heart doctor"→a cardiology speciality, "skin"→dermatology). ' +
            'For clinic hours/address/fees you do NOT have data: set intent "human" and faqAnswer null. ' +
            `Speciality list: ${JSON.stringify(specialities)}. Doctor list: ${JSON.stringify(doctorNames)}.`
        },
        { role: 'user', content: message }
      ]
    });

    const raw = res.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw) as {
      intent?: string;
      speciality?: string | null;
      doctorName?: string | null;
      dateText?: string | null;
      confidence?: number;
      faqAnswer?: string | null;
    };

    const intent: ReceptionistIntent = RECEPTIONIST_INTENTS.includes(parsed.intent as ReceptionistIntent)
      ? (parsed.intent as ReceptionistIntent)
      : 'unknown';

    // Only accept a speciality/doctor that really exists in the provided lists.
    const speciality =
      (parsed.speciality && specialities.find((s) => s.toLowerCase() === String(parsed.speciality).toLowerCase())) ||
      null;
    const doctorName =
      (parsed.doctorName && doctorNames.find((d) => d.toLowerCase() === String(parsed.doctorName).toLowerCase())) ||
      null;

    const confidence =
      typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : intent === 'unknown'
          ? 0
          : 0.5;

    const faqAnswer =
      intent === 'faq' && typeof parsed.faqAnswer === 'string' && parsed.faqAnswer.trim()
        ? parsed.faqAnswer.trim()
        : null;

    return {
      intent,
      speciality,
      doctorName,
      dateText: typeof parsed.dateText === 'string' && parsed.dateText.trim() ? parsed.dateText.trim() : null,
      confidence,
      faqAnswer
    };
  } catch (err) {
    console.error('[AI] understandPatientMessage failed — caller will use keyword fallback:', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Patient-facing agentic WhatsApp assistant.
//
// A SEPARATE agent from staff `chat`: every tool is scoped to the messaging
// patient and their clinic, so a patient can only see/act on their OWN data.
// It can answer clinic questions, list slots, book appointments for itself, and
// read its own appointments/details. Conversation history is persisted per
// patient (AiConversation.channel = 'whatsapp') for natural multi-turn chat.
// ---------------------------------------------------------------------------


const PATIENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_clinic_info',
      description:
        'Get the clinic name and its doctors (name + speciality). Use to answer questions about the clinic or which doctors/specialities are available.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_available_slots',
      description:
        'List available appointment time slots for a date, optionally filtered by doctor name or speciality. Use for "available slots" requests.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          doctorName: { type: 'string', description: 'Optional doctor name or speciality filter' }
        },
        required: ['date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description:
        'Book an appointment for THIS patient (never anyone else). Resolve the doctor by name or speciality. Make sure you have a doctor, date and time before calling.',
      parameters: {
        type: 'object',
        properties: {
          doctorName: { type: 'string', description: 'Doctor name or speciality' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time, e.g. "10:00 AM"' }
        },
        required: ['doctorName', 'date', 'time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_appointments',
      description: "Get THIS patient's own appointments (upcoming and past).",
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_details',
      description: "Get THIS patient's own profile (name, phone, age, gender, patient ID).",
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_my_name',
      description:
        "Save the patient's real name. Call this once when a patient with a placeholder name " +
        "(starts with 'WhatsApp Patient') first tells you their name, so the clinic dashboard shows it.",
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The patient’s full name' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'claim_waitlist_offer',
      description:
        'Claim the pending waitlist slot offer for THIS patient and book it automatically. ' +
        'Call this ONLY when the system prompt says the patient has a pending slot offer AND the patient accepts it ' +
        '(e.g. replies "yes", "confirm", "book it"). Do not call it otherwise.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description:
        "Cancel one of THIS patient's own upcoming appointments. First call get_my_appointments to get the " +
        'appointmentId, confirm with the patient which one, then call this. Cancelling frees the slot for the waitlist.',
      parameters: {
        type: 'object',
        properties: { appointmentId: { type: 'string', description: 'The appointment id from get_my_appointments' } },
        required: ['appointmentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description:
        "Move one of THIS patient's own appointments to a new date/time with the SAME doctor. Get the " +
        'appointmentId from get_my_appointments and pick a real open slot (use list_available_slots). ' +
        'Confirm the new time with the patient before calling.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'The appointment id from get_my_appointments' },
          date: { type: 'string', description: 'New date YYYY-MM-DD' },
          time: { type: 'string', description: 'New time, e.g. "10:00 AM"' }
        },
        required: ['appointmentId', 'date', 'time']
      }
    }
  }
];

interface PatientToolContext {
  clinicId: string;
  patientId: string;
}

const listAvailableSlots = async (clinicId: string, dateStr: string, filter?: string) => {
  const db = forClinic(clinicId);
  const doctors = await db.doctor.findMany({ where: { clinicId } });
  if (doctors.length === 0) {
    return { date: dateStr, doctors: [], note: 'No doctors are configured for this clinic yet.' };
  }

  const f = filter?.toLowerCase();
  const filtered = doctors.filter(
    (d) => !f || d.name.toLowerCase().includes(f) || d.speciality.toLowerCase().includes(f)
  );

  // Real availability per doctor, from DoctorSchedule (minus leaves, booked, past).
  const results = await Promise.all(
    filtered.map(async (d) => ({
      doctor: d.name,
      speciality: d.speciality,
      availableSlots: await getAvailableSlots(clinicId, d.id, dateStr)
    }))
  );
  return { date: dateStr, doctors: results };
};

const executePatientTool = async (
  name: string,
  args: Record<string, unknown>,
  ctx: PatientToolContext
): Promise<unknown> => {
  const db = forClinic(ctx.clinicId);
  switch (name) {
    case 'get_clinic_info': {
      const clinic = await prisma.clinic.findUnique({ where: { id: ctx.clinicId }, select: { name: true } });
      const doctors = await db.doctor.findMany({
        where: { clinicId: ctx.clinicId },
        select: { name: true, speciality: true }
      });
      return { clinic: clinic?.name ?? null, doctors };
    }

    case 'list_available_slots':
      return listAvailableSlots(
        ctx.clinicId,
        String(args.date),
        args.doctorName ? String(args.doctorName) : undefined
      );

    case 'book_appointment': {
      const filter = String(args.doctorName ?? '').toLowerCase();
      const doctors = await db.doctor.findMany({ where: { clinicId: ctx.clinicId } });
      const doctor =
        doctors.find((d) => d.name.toLowerCase().includes(filter) || d.speciality.toLowerCase().includes(filter)) ??
        (doctors.length === 1 ? doctors[0] : undefined);

      if (!doctor) {
        return {
          success: false,
          error: doctors.length
            ? `Could not match a doctor. Available: ${doctors.map((d) => `${d.name} (${d.speciality})`).join(', ')}`
            : 'No doctors are available at this clinic yet.'
        };
      }

      // Only book a real, currently-available slot.
      const date = String(args.date);
      const time = String(args.time).trim();
      if (!(await isSlotAvailable(ctx.clinicId, doctor.id, date, time))) {
        const open = await getAvailableSlots(ctx.clinicId, doctor.id, date);
        return {
          success: false,
          error: open.length
            ? `That time isn't available. Open slots for ${doctor.name} on ${date}: ${open.join(', ')}.`
            : `${doctor.name} has no availability on ${date}. Try another date.`
        };
      }

      try {
        const appt = await createAppointment(
          ctx.clinicId,
          {
            patientId: ctx.patientId,
            doctorId: doctor.id,
            appointmentDate: String(args.date),
            appointmentTime: String(args.time)
          },
          // The agent sends its own confirmation reply — suppress the duplicate
          // booking-confirmation auto-message so the patient gets ONE response.
          { notify: false }
        );
        return {
          success: true,
          appointmentId: appt.id,
          doctor: doctor.name,
          date: appt.appointmentDate.toISOString().slice(0, 10),
          time: appt.appointmentTime,
          status: appt.status
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'get_my_appointments': {
      const appts = await db.appointment.findMany({
        where: { clinicId: ctx.clinicId, patientId: ctx.patientId },
        include: { doctor: { select: { name: true, speciality: true } } },
        orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }]
      });
      return appts.map((a) => ({
        id: a.id,
        doctor: a.doctor?.name ?? null,
        speciality: a.doctor?.speciality ?? null,
        date: a.appointmentDate.toISOString().slice(0, 10),
        time: a.appointmentTime,
        status: a.status
      }));
    }

    case 'get_my_details': {
      const pt = await db.patient.findFirst({
        where: { id: ctx.patientId, clinicId: ctx.clinicId },
        select: { name: true, phone: true, age: true, gender: true, patientCode: true, language: true }
      });
      return pt ?? { error: 'Patient record not found.' };
    }

    case 'set_my_name': {
      const newName = String(args.name ?? '').trim();
      if (newName.length < 2) {
        return { success: false, error: 'Please provide a valid name.' };
      }
      const updated = await db.patient.update({
        where: { id: ctx.patientId },
        data: { name: newName },
        select: { name: true }
      });
      return { success: true, name: updated.name };
    }

    case 'claim_waitlist_offer':
      return claimWaitlistOffer(ctx.clinicId, ctx.patientId);

    case 'cancel_appointment': {
      const id = String(args.appointmentId ?? '');
      const own = await db.appointment.findFirst({
        where: { id, clinicId: ctx.clinicId, patientId: ctx.patientId },
        select: { id: true, status: true }
      });
      if (!own) return { success: false, error: 'That appointment was not found under your account.' };
      if (own.status === 'CANCELLED') return { success: false, error: 'That appointment is already cancelled.' };
      const cancelled = await cancelAppointment(ctx.clinicId, id);
      return { success: true, status: cancelled.status, note: 'Appointment cancelled. The slot is freed and offered to the waitlist.' };
    }

    case 'reschedule_appointment': {
      const id = String(args.appointmentId ?? '');
      const date = String(args.date ?? '');
      const time = String(args.time ?? '');
      const own = await db.appointment.findFirst({
        where: { id, clinicId: ctx.clinicId, patientId: ctx.patientId },
        select: { id: true, doctorId: true }
      });
      if (!own) return { success: false, error: 'That appointment was not found under your account.' };
      if (!(await isSlotAvailable(ctx.clinicId, own.doctorId, date, time))) {
        const open = await getAvailableSlots(ctx.clinicId, own.doctorId, date);
        return {
          success: false,
          error: open.length ? `That time isn't available. Open slots on ${date}: ${open.join(', ')}.` : `No availability on ${date}. Try another date.`
        };
      }
      try {
        const updated = await updateAppointment(ctx.clinicId, id, { appointmentDate: date, appointmentTime: time });
        return { success: true, date: updated.appointmentDate.toISOString().slice(0, 10), time: updated.appointmentTime, status: updated.status };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Could not reschedule.' };
      }
    }

    default:
      throw new AppError(`Unknown patient tool: ${name}`, 400);
  }
};

const getOrCreatePatientConversation = async (clinicId: string, patientId: string) => {
  const db = forClinic(clinicId);
  const existing = await db.aiConversation.findFirst({
    where: { clinicId, patientId, channel: 'whatsapp' },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });
  if (existing) return existing;
  return db.aiConversation.create({ data: { clinicId, patientId, channel: 'whatsapp' } });
};

export interface PatientAgentParams {
  clinicId: string;
  patientId: string;
  patientName: string;
  clinicName: string;
  phone: string;
  patientCode?: string | null;
  message: string;
}

export interface PatientAgentResult {
  reply: string;
  openaiResponseIds: string[];
  toolsUsed: string[];
}

// The numbered menu is a CONVENIENCE layer over the natural-language agent, not a
// separate mode. We render it deterministically on a greeting / "menu" so it is
// always crisp, then seed it into the conversation history as the assistant's
// turn — that way a follow-up bare number ("1") is resolved by the agent against
// this list, exactly like any other numbered list it sends.
const mainMenuText = (clinicName: string, name: string): string =>
  `👋 Welcome to ${clinicName}, ${name}! How can I help you today?\n\n` +
  `1. Book Appointment\n` +
  `2. Check Existing Appointment\n` +
  `3. Cancel Appointment\n` +
  `4. Reschedule Appointment\n\n` +
  `Reply with a number, or just tell me what you need (e.g. "book a cardiologist tomorrow morning").`;

// Greeting / explicit menu request — short, low-signal openers where showing the
// menu is the most helpful reply. Actionable first messages ("book a doctor")
// are NOT greetings and fall through to the agent.
const isMenuRequest = (text: string): boolean =>
  /^\s*(hi+|hey+|hello+|hii+|yo|start|restart|menu|main\s*menu|home|help|options?|namaste|hola)\s*[!.?]*\s*$/i.test(
    text
  ) || text.trim() === '0';

export const patientAgentReply = async (params: PatientAgentParams): Promise<PatientAgentResult> => {
  const openaiResponseIds: string[] = [];
  const toolsUsed: string[] = [];
  const displayName = /^WhatsApp Patient/i.test(params.patientName) ? 'there' : params.patientName;
  const fallback =
    `Hi ${displayName}! I'm the assistant for ${params.clinicName}. ` +
    `I can help you book, reschedule, cancel, or check an appointment — just tell me what you need. 🙂`;

  if (!env.OPENAI_API_KEY) {
    return { reply: fallback, openaiResponseIds, toolsUsed };
  }

  const client = getClient();
  const conversation = await getOrCreatePatientConversation(params.clinicId, params.patientId);
  const db = forClinic(params.clinicId);

  const history = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 20
  });

  await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: 'USER', content: params.message }
  });

  // Greeting / "menu" → show the numbered menu deterministically and seed it into
  // history so the next bare number resolves against it. (Menu support is a
  // convenience; the agent below still handles everything in natural language.)
  if (isMenuRequest(params.message)) {
    const menu = mainMenuText(params.clinicName, displayName);
    await prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: 'ASSISTANT', content: menu }
    });
    await db.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return { reply: menu, openaiResponseIds, toolsUsed };
  }

  const today = new Date().toISOString().split('T')[0];
  const namePlaceholder = /^WhatsApp Patient/i.test(params.patientName);

  // Surface any pending waitlist slot offer so the agent can auto-book on "yes".
  const pendingOffer = await db.waitlist.findFirst({
    where: { clinicId: params.clinicId, patientId: params.patientId, status: 'OFFERED', offeredDoctorId: { not: null } },
    select: { offeredDoctorId: true, offeredDate: true, offeredTime: true }
  });
  let offerLine = '';
  if (pendingOffer?.offeredDoctorId && pendingOffer.offeredDate && pendingOffer.offeredTime) {
    const offerDoc = await db.doctor.findUnique({ where: { id: pendingOffer.offeredDoctorId }, select: { name: true } });
    offerLine =
      `\n\nPENDING WAITLIST OFFER: this patient was offered a freed slot with Dr. ${offerDoc?.name ?? 'the doctor'} on ` +
      `${pendingOffer.offeredDate.toISOString().slice(0, 10)} at ${pendingOffer.offeredTime}. ` +
      `If they accept (e.g. "yes", "confirm", "book it"), call claim_waitlist_offer NOW. If they decline, acknowledge politely and don't book.`;
  }

  const system =
    `You are the WhatsApp receptionist for ${params.clinicName}, a medical clinic — a real, friendly assistant ` +
    `that ALSO supports a numbered menu as a convenience (it is not a menu-only bot). ` +
    `You handle everything yourself end-to-end; clinic staff do not act on these chats. ` +
    `Patient${namePlaceholder ? ' (name unknown yet)' : `: ${params.patientName}`}` +
    `${params.patientCode ? ` (ID ${params.patientCode})` : ''}, phone ${params.phone}.\n\n` +
    `Understand NATURAL LANGUAGE — e.g. "book a cardiologist", "tomorrow morning", "10 am", "yes", ` +
    `"cancel my appointment", "reschedule to Friday", "when is my appointment". ` +
    `ALWAYS use a tool for real data or actions — NEVER invent doctors, specialities, slots, dates or appointments.\n\n` +
    `MENU SUPPORT (numbers AND natural language must both work, interchangeably):\n` +
    `- The MAIN MENU is: 1 = Book Appointment, 2 = Check Existing Appointment, 3 = Cancel Appointment, 4 = Reschedule Appointment. ` +
    `If the patient sends 1–4 with no other recent list shown, treat it as that main-menu intent.\n` +
    `- Whenever you present choices (specialities, available slots, or the patient's appointments), ALWAYS format them as a ` +
    `NUMBERED list (1., 2., 3., …).\n` +
    `- If the patient replies with just a number (or "option 2", "#3", "the 1st"), treat it as selecting that item from the ` +
    `MOST RECENT numbered list you sent, and continue — do not re-ask.\n\n` +
    `Tools:\n` +
    `- get_clinic_info — the clinic's doctors & specialities.\n` +
    `- list_available_slots — real open times for a date (filter by doctor name OR speciality).\n` +
    `- book_appointment — book for THIS patient.\n` +
    `- cancel_appointment — cancel one of their appointments (get the id via get_my_appointments first).\n` +
    `- reschedule_appointment — move one of their appointments to a new open slot.\n` +
    `- get_my_appointments — their bookings (also answers "when is my appointment" / status).\n` +
    `- get_my_details / set_my_name.\n\n` +
    `HOW TO HELP each intent:\n` +
    `• BOOK: determine speciality (or doctor) + date. If they give a SPECIALITY, auto-select the matching doctor — ` +
    `do NOT ask them to choose a doctor when the speciality already identifies one. Call list_available_slots and offer the ` +
    `REAL open times as a numbered list. Once you have doctor/speciality + date + a specific available time, FIRST show a short ` +
    `summary (doctor, speciality, date, time) and ask them to reply YES to confirm. ONLY after they confirm (e.g. "yes", "1", ` +
    `"confirm") call book_appointment. Booking never waits for their name.\n` +
    `  After book_appointment succeeds, tell them their appointment REQUEST has been received and is PENDING confirmation from ` +
    `the clinic — they'll get a confirmation message once the clinic approves it. Do NOT say it is already confirmed.\n` +
    `• CANCEL: call get_my_appointments, confirm which one, then cancel_appointment.\n` +
    `• RESCHEDULE: get_my_appointments, find an open slot via list_available_slots, confirm, then reschedule_appointment.\n` +
    `• STATUS: call get_my_appointments and tell them their upcoming appointment(s).\n` +
    `• GENERAL (hours, location, services): just answer warmly.\n\n` +
    `RULES: Compute real dates from today (${today}) for "tomorrow"/"Wednesday"/"next Monday". ` +
    `NEVER ask for info already given or already returned by a tool; never repeat a question; ask only the ONE thing you are missing. ` +
    `Always reply with something helpful — never go silent, even if a tool fails (explain briefly and offer the next step).\n` +
    (namePlaceholder
      ? `You may not know their name — never block a booking to ask it; book first, then ask and call set_my_name.\n`
      : ``) +
    `\nStyle: short, warm WhatsApp messages (1-4 sentences, minimal formatting). ` +
    `No medical diagnoses; for clinical concerns advise contacting the clinic.\n\n` +
    `Today's date: ${today}` + offerLine;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...history.map((m) => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user', content: params.message }
  ];

  try {
    // Agentic tool-use loop, bounded so a misbehaving model can't loop forever.
    for (let step = 0; step < 6; step += 1) {
      const response = await client.chat.completions.create({
        model: AI_MODEL,
        messages,
        tools: PATIENT_TOOLS,
        tool_choice: 'auto',
        max_tokens: 500
      });
      openaiResponseIds.push(response.id);

      const msg = response.choices[0].message;
      messages.push(msg);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const reply = (msg.content ?? '').trim() || fallback;
        await prisma.aiMessage.create({
          data: { conversationId: conversation.id, role: 'ASSISTANT', content: reply }
        });
        await db.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
        return { reply, openaiResponseIds, toolsUsed };
      }

      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== 'function') continue;
        toolsUsed.push(toolCall.function.name);
        let result: unknown;
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
          result = await executePatientTool(toolCall.function.name, args, {
            clinicId: params.clinicId,
            patientId: params.patientId
          });
        } catch (err) {
          result = { error: err instanceof Error ? err.message : 'Unknown error' };
        }
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }
    }

    // Hit the step cap without a final text answer.
    await prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: 'ASSISTANT', content: fallback }
    });
    return { reply: fallback, openaiResponseIds, toolsUsed };
  } catch (err) {
    console.error('[AI] patientAgentReply failed:', err);
    return { reply: fallback, openaiResponseIds, toolsUsed };
  }
};
