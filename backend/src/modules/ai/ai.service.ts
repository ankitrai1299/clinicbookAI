import OpenAI from 'openai';

import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { cancelAppointment, createAppointment, getAppointments } from '../appointments/appointment.service.js';
import { createDoctor, getDoctors, updateDoctor } from '../doctors/doctor.service.js';
import { createPatient, getPatients, updatePatient } from '../patients/patient.service.js';
import { addToWaitlist } from '../waitlist/waitlist.service.js';

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
  }
];

const executeTool = async (
  name: string,
  args: Record<string, unknown>,
  clinicId: string
): Promise<unknown> => {
  switch (name) {
    case 'search_patients': {
      const q = args.query as string;
      return prisma.patient.findMany({
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
      return prisma.doctor.findMany({
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
      return prisma.appointment.findMany({
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

    default:
      throw new AppError(`Unknown tool: ${name}`, 400);
  }
};

const getOrCreateConversation = async (clinicId: string, userId: string, conversationId?: string) => {
  if (conversationId) {
    const existing = await prisma.aiConversation.findFirst({
      where: { id: conversationId, clinicId, userId },
      select: { id: true }
    });
    if (existing) return existing;
  }
  return prisma.aiConversation.create({ data: { clinicId, userId } });
};

const SYSTEM_PROMPT = `You are an AI admin assistant for ClinicBook AI, a clinic management system. Help clinic staff manage doctors, patients, appointments, and waitlists.

Rules:
- Always call tools to perform actions — never just describe what to do.
- Before booking an appointment, search for the patient and doctor by name to get their IDs.
- For relative dates (tomorrow, next Monday), calculate from today: {TODAY}.
- After each action, briefly confirm what was done with key details.
- Keep responses concise and professional.
- If required info is missing, search existing records first before asking the user.

Today's date: {TODAY}`;

export const chat = async (
  clinicId: string,
  userId: string,
  message: string,
  conversationId?: string
) => {
  const client = getClient();
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

  // Agentic tool-use loop
  while (true) {
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
      await prisma.aiConversation.update({
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
};

export const getHistory = async (clinicId: string, userId: string, conversationId: string) => {
  const conv = await prisma.aiConversation.findFirst({
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
