// ===========================================================================
// WhatsApp receptionist — DETERMINISTIC booking state machine.
//
// This is the SINGLE controller that owns the entire patient WhatsApp flow.
// The LLM is NOT in the control loop. Booking is a finite state machine:
//
//   MENU → SPECIALITY_SELECTION → DOCTOR_SELECTION → SLOT_SELECTION
//        → CONFIRMATION → BOOKED
//
// plus deterministic CHECK / CANCEL / RESCHEDULE branches. Every message maps to
// exactly one next step. Numbered replies (1, 2, 3 …) always advance the state
// against the options last shown. Doctors and slots come straight from the DB —
// never invented.
//
// AI RECEPTIONIST LAYER (optional, flag-gated by WA_AI_RECEPTIONIST): free text
// at the TOP LEVEL is interpreted by the receptionist (whatsapp.receptionist.ts)
// into an intent + extracted speciality/doctor/date + a confidence score. That
// understanding ONLY chooses which deterministic branch to enter and pre-seeds
// the date — it never books, cancels, reschedules, or picks a slot. With the flag
// off (or no OpenAI key) it falls back to the deterministic keyword classifier
// and the flow is byte-for-byte the legacy menu bot.
//
// INTERACTIVE MESSAGES (optional, flag-gated by WA_INTERACTIVE): renderers emit
// WhatsApp buttons / list messages instead of numbered text. A tapped option id
// is normalised back into the exact text the handlers already accept, so the
// state machine core is untouched.
//
// State + the exact options last presented are persisted per phone in
// WhatsAppSession, so a bare "1" (typed or tapped) on the next webhook resolves
// deterministically.
// ===========================================================================

import { forClinic } from '../../config/tenantPrisma.js';
import { env } from '../../config/env.js';
import { formatDoctorName } from '../../utils/doctorName.js';
import { classifyIntent } from './whatsapp.intent.js';
import { createAppointment, cancelAppointment, updateAppointment } from '../../products/clinicbook/appointments/appointment.service.js';
import { getAvailableSlots, getDateAvailability, clinicNow } from '../../services/scheduling.service.js';
import {
  joinWaitlist,
  pendingOfferFor,
  claimWaitlistOffer,
  declineWaitlistOffer
} from '../../products/clinicbook/waitlist/waitlist.service.js';
import { recordWhatsAppAudit } from './whatsapp.service.js';
import { understand, confidenceMin, type Understanding } from './whatsapp.receptionist.js';
import {
  type BotReply,
  type ReplyRow,
  buttons,
  list,
  optionId,
  OPT_PREFIX,
  prefixReply,
  RID
} from './whatsapp.reply.js';

// --- States ---------------------------------------------------------------
const S = {
  IDLE: 'IDLE',
  MENU: 'MENU',
  SPECIALITY: 'SPECIALITY_SELECTION',
  DOCTOR: 'DOCTOR_SELECTION',
  DATE: 'DATE_SELECTION',
  SLOT: 'SLOT_SELECTION',
  CONFIRM: 'CONFIRMATION',
  BOOKED: 'BOOKED',
  CANCEL_SELECT: 'CANCEL_SELECTION',
  CANCEL_CONFIRM: 'CANCEL_CONFIRMATION',
  RESCHED_SELECT: 'RESCHEDULE_SELECTION',
  HANDOFF: 'HUMAN_HANDOFF',
  // Offer to JOIN the waitlist (no slot available) — awaits YES/NO.
  WAITLIST_CONFIRM: 'WAITLIST_CONFIRM',
  // A freed slot has been OFFERED to this patient — awaits YES (claim) / NO (pass).
  // Set out-of-band by autoOfferFreedSlot (waitlist.service.ts) on a cancellation.
  WAITLIST_OFFER: 'WAITLIST_OFFER'
} as const;

const SLOTS_PER_PAGE = 5;
const SLOT_SCAN_DAYS = 21;
// Date picker: how many upcoming calendar days to offer (Practo/Zocdoc-style).
const DATE_PICKER_DAYS = 7;
// When the patient hasn't asked for a specific date, cap how many times we show
// per day so the first list spans SEVERAL upcoming days (today + tomorrow + …)
// instead of being filled entirely by today's many open slots. When a date IS
// requested we don't cap — that day's full set of times is shown.
const SLOTS_MAX_PER_DAY = 2;

// Modernisation toggles. When BOTH are off the flow is the legacy deterministic
// menu bot (no AI, no personalisation, plain numbered text).
const interactiveOn = (): boolean => env.WA_INTERACTIVE;
const modernEnabled = (): boolean => env.WA_AI_RECEPTIONIST || env.WA_INTERACTIVE;

// --- Session shape --------------------------------------------------------
interface DoctorOption {
  id: string;
  name: string;
  speciality: string;
}
interface SlotOption {
  date: string; // YYYY-MM-DD
  time: string; // "HH:MM AM/PM"
}
interface ApptOption {
  id: string;
  label: string;
  doctorId: string;
  doctorName: string;
  doctorSpeciality: string;
}
interface SessionData {
  mode?: 'book' | 'reschedule';
  speciality?: string;
  specialityOptions?: string[];
  doctorOptions?: DoctorOption[];
  doctorId?: string;
  doctorName?: string;
  doctorSpeciality?: string;
  slotOptions?: SlotOption[];
  slotOffset?: number;
  // Dates last shown in the DATE_SELECTION step (one per offered working day),
  // with each day's open-slot count so a tap on a full day can be re-prompted.
  dateOptions?: { date: string; available: number }[];
  // The date the patient was eyeing when offered the waitlist (WAITLIST_CONFIRM),
  // stored as their desired date if they join.
  waitlistDate?: string;
  selected?: SlotOption;
  apptOptions?: ApptOption[];
  cancelApptId?: string;
  cancelLabel?: string;
  rescheduleApptId?: string;
  // Preferred date extracted from the patient's words ("tomorrow", "friday"),
  // threaded through speciality/doctor/slot states so MORE pagination keeps it.
  preferredDate?: string;
}

export interface BookingParams {
  clinicId: string;
  patientId: string;
  patientName: string;
  clinicName: string;
  phone: string; // digits-only
  patientCode?: string | null;
  message: string;
  // Set by the inbound webhook when the patient TAPPED an interactive button /
  // list row: the stable option id (e.g. "OPT_2", "CONF_YES"). Normalised back
  // into the canonical text the handlers expect before routing.
  replyId?: string;
  // Set when this message originated from a transcribed voice note. Forces AI
  // understanding for the turn (free speech the keyword classifier can't parse).
  fromVoice?: boolean;
  // Internal (set by handlers, read by the central transition logger): a short
  // human-readable explanation of WHY the last transition happened. Last writer
  // wins, so the innermost/terminal action's reason is what gets logged.
  reason?: string;
  // Internal: the receptionist understanding for this turn (free-text top level
  // only) and the terminal action taken — both captured in WhatsAppAudit.
  understanding?: Understanding;
  action?: string;
}

// Annotate the reason for the transition about to be persisted. A one-liner so
// every handler can record its decision inline right before it returns.
const why = (params: BookingParams, reason: string): void => {
  params.reason = reason;
};

// --- Small deterministic parsers -----------------------------------------
const parseChoice = (t: string): number | null => {
  const m = /^\s*(?:option\s*|no\.?\s*|#)?\s*(\d{1,2})\s*[.)]?\s*$/i.exec(t);
  return m ? parseInt(m[1], 10) : null;
};
const isYes = (t: string): boolean =>
  /^\s*(y|yes+|yep|yeah|yup|confirm|ok(ay)?|sure|haan?|haa?|theek|done|👍)\s*[!.]*\s*$/i.test(t);
const isNo = (t: string): boolean => /^\s*(n|no+|nope|nah|nahi|cancel)\s*[!.]*\s*$/i.test(t);
const isReset = (t: string): boolean =>
  /^\s*(menu|main\s*menu|home|start|restart|exit|hi+|hey+|hello+|hii+|namaste|hola|help|options?)\s*[!.?]*\s*$/i.test(
    t
  ) || t.trim() === '0';
const isMore = (t: string): boolean => /^\s*(more|next|aur|more\s*options?)\s*$/i.test(t);
// "Get me out of this booking" — recognised in the MIDDLE of a flow (speciality/
// doctor/slot picking) where a number/MORE is otherwise expected, so a patient who
// changes their mind ("cancel", "stop", "nahi karna", "rehne do") is taken back to
// the menu instead of being stuck on "please reply with a number".
const isAbort = (t: string): boolean =>
  /\b(cancel|stop|abort|quit|exit|chh?od(o|\s?do)?|rehne\s?do|rahne\s?do|nah?i+\s*(karna|chahiye|chahie)|nvm|never\s?mind|forget\s?it|leave\s?it|rahne\s?de)\b/i.test(
    t
  );

// Normalise a tapped interactive option id into the canonical text the existing
// handlers already accept, or a "special" out-of-band action. Keeping this here
// means a tap and a typed reply travel the exact same deterministic code path.
const normalizeReplyId = (id: string): { text?: string; special?: 'human' | 'book_again' | 'change_time' } => {
  switch (id) {
    case RID.MENU_BOOK:
      return { text: '1' };
    case RID.MENU_APPTS:
      return { text: '2' };
    case RID.MENU_CANCEL:
      return { text: '3' };
    case RID.MENU_RESCHED:
      return { text: '4' };
    case RID.CONF_YES:
      return { text: 'yes' };
    case RID.CONF_NO:
      return { text: 'no' };
    case RID.MORE:
      return { text: 'more' };
    case RID.CHANGE_TIME:
      return { special: 'change_time' };
    case RID.TALK_HUMAN:
      return { special: 'human' };
    case RID.BOOK_AGAIN:
      return { special: 'book_again' };
    default:
      if (id.startsWith(OPT_PREFIX)) return { text: id.slice(OPT_PREFIX.length) };
      return {};
  }
};

// --- Date formatting (UTC, matches the YYYY-MM-DD slot dates) --------------
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (date: string): string => {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const slotLabel = (s: SlotOption): string => `${dateLabel(s.date)} at ${s.time}`;

// Clinic-local "today" as a UTC-midnight Date, so all day math (pickers, labels)
// agrees with the IST-based slot availability instead of drifting near UTC midnight.
const clinicTodayBase = (): Date => {
  const [y, m, d] = clinicNow().dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Patient-facing status wording. The patient must NEVER see raw DB enums
// (PENDING/CONFIRMED/…) — always map to friendly text before it goes out.
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting Clinic Confirmation',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Missed'
};
export const friendlyStatus = (status: string): string => STATUS_LABEL[status] ?? 'Awaiting Clinic Confirmation';

// Friendly day label for the date picker: "Today" / "Tomorrow" / "Wed, 25 Jun".
const dayLabel = (dateStr: string): string => {
  const today = clinicTodayBase();
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return dateLabel(dateStr);
};

// --- DB helpers -----------------------------------------------------------
const distinctSpecialities = async (clinicId: string): Promise<string[]> => {
  const db = forClinic(clinicId);
  const docs = await db.doctor.findMany({ where: { clinicId }, select: { speciality: true } });
  return [...new Set(docs.map((d) => d.speciality.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
};

const doctorsForSpeciality = async (clinicId: string, speciality: string): Promise<DoctorOption[]> => {
  const db = forClinic(clinicId);
  const docs = await db.doctor.findMany({
    where: { clinicId, speciality: { equals: speciality, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, speciality: true }
  });
  return docs;
};

const doctorNamesForClinic = async (clinicId: string): Promise<string[]> => {
  const db = forClinic(clinicId);
  const docs = await db.doctor.findMany({ where: { clinicId }, select: { name: true } });
  return docs.map((d) => d.name);
};

// Resolve a free-text doctor mention ("Dr Ruchi", "ruchi") to a real doctor.
const findDoctorByName = async (clinicId: string, name: string): Promise<DoctorOption | null> => {
  const db = forClinic(clinicId);
  const docs = await db.doctor.findMany({
    where: { clinicId },
    select: { id: true, name: true, speciality: true }
  });
  const t = name.toLowerCase();
  return (
    docs.find((d) => {
      const full = d.name.toLowerCase();
      const bare = full.replace(/^dr\.?\s*/, '');
      return full.includes(t) || t.includes(full) || (bare.length >= 3 && (t.includes(bare) || bare.includes(t)));
    }) ?? null
  );
};

// Returning-patient memory: the doctor from this patient's most recent
// appointment (any status). Used to personalise the menu and offer "book again".
const lastDoctorForPatient = async (clinicId: string, patientId: string): Promise<DoctorOption | null> => {
  const db = forClinic(clinicId);
  const appt = await db.appointment.findFirst({
    where: { clinicId, patientId },
    orderBy: [{ appointmentDate: 'desc' }],
    include: { doctor: { select: { id: true, name: true, speciality: true } } }
  });
  return appt?.doctor ?? null;
};

// Scan forward and collect up to `needed` real open (date,time) slots. When
// `fromDate` (YYYY-MM-DD, today or later) is given, start the scan there so a
// patient who said "Friday" sees Friday's slots first — still falling forward to
// the next open day if that date is full.
const collectUpcomingSlots = async (
  clinicId: string,
  doctorId: string,
  needed: number,
  fromDate?: string,
  // Optional cap on slots taken from any single day, so the list spreads across
  // multiple upcoming days instead of clumping on the first day with openings.
  maxPerDay?: number
): Promise<SlotOption[]> => {
  const out: SlotOption[] = [];
  const today0 = clinicTodayBase();
  let startOffset = 0;
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime()) && from >= today0) {
      startOffset = Math.round((from.getTime() - today0.getTime()) / 86_400_000);
    }
  }
  for (let i = startOffset; i < startOffset + SLOT_SCAN_DAYS && out.length < needed; i += 1) {
    const d = new Date(today0.getTime() + i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const times = await getAvailableSlots(clinicId, doctorId, dateStr);
    const dayTimes = maxPerDay && maxPerDay > 0 ? times.slice(0, maxPerDay) : times;
    for (const time of dayTimes) {
      out.push({ date: dateStr, time });
      if (out.length >= needed) break;
    }
  }
  return out;
};

const activeAppointments = async (clinicId: string, patientId: string) => {
  const db = forClinic(clinicId);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return db.appointment.findMany({
    where: {
      clinicId,
      patientId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      appointmentDate: { gte: today }
    },
    include: { doctor: { select: { id: true, name: true, speciality: true } } },
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }]
  });
};

// Duplicate-booking guard. A patient must not stack a second active
// (PENDING/CONFIRMED) appointment that either (a) duplicates the same doctor on
// the same day, or (b) collides with another booking at the exact same date+time
// (a time clash, even with a different doctor). Returns the offending
// appointment so the caller can explain it, or null when the slot is clear.
const findConflictingActiveAppointment = async (
  clinicId: string,
  patientId: string,
  doctorId: string,
  date: string,
  time: string
) => {
  const db = forClinic(clinicId);
  const target = new Date(`${date}T00:00:00.000Z`);
  return db.appointment.findFirst({
    where: {
      clinicId,
      patientId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      appointmentDate: target,
      OR: [{ doctorId }, { appointmentTime: time }]
    },
    include: { doctor: { select: { name: true, speciality: true } } }
  });
};

// --- Session persistence --------------------------------------------------
const loadSession = async (clinicId: string, phone: string): Promise<{ state: string; data: SessionData }> => {
  const db = forClinic(clinicId);
  // Session is keyed per (clinicId, phone): the same patient phone has an
  // independent booking flow at each clinic. clinic A can't read clinic B's row.
  const row = await db.whatsAppSession.findUnique({ where: { clinicId_phone: { clinicId, phone } } });
  if (!row) return { state: S.IDLE, data: {} };
  let data: SessionData = {};
  try {
    data = JSON.parse(row.data || '{}') as SessionData;
  } catch {
    data = {};
  }
  return { state: row.state, data };
};

const saveSession = async (params: BookingParams, state: string, data: SessionData): Promise<void> => {
  const serialized = JSON.stringify(data);
  const db = forClinic(params.clinicId);
  await db.whatsAppSession.upsert({
    where: { clinicId_phone: { clinicId: params.clinicId, phone: params.phone } },
    create: { phone: params.phone, clinicId: params.clinicId, patientId: params.patientId, state, data: serialized },
    update: { clinicId: params.clinicId, patientId: params.patientId, state, data: serialized }
  });
};

const resetSession = (params: BookingParams, state: string = S.IDLE): Promise<void> => saveSession(params, state, {});

// States where the FSM is ACTIVELY awaiting a specific selection — here the next
// message belongs to THIS flow, so the brain must resume booking (never re-route).
// Resting states (IDLE/MENU/BOOKED/HANDOFF) are deliberately NOT included: at a
// rest point the next message could be anything, so the brain is free to route it
// to another skill (prescription, reminder, …). Without this distinction the FSM
// would hog the session forever (it is rarely truly IDLE) and cross-product
// routing would never fire.
const MID_FLOW_STATES = new Set<string>([
  S.SPECIALITY,
  S.DOCTOR,
  S.DATE,
  S.SLOT,
  S.CONFIRM,
  S.CANCEL_SELECT,
  S.CANCEL_CONFIRM,
  S.RESCHED_SELECT,
  S.WAITLIST_CONFIRM,
  S.WAITLIST_OFFER
]);

// Read-only helper for the Healthcare MCP brain: is the patient CURRENTLY mid a
// booking sub-selection? The booking skill maps this to `done` (mid-flow → not
// done → brain keeps booking active; resting → done → brain re-routes next turn).
// Pure read — does NOT change the FSM's behaviour.
export const isBookingFlowActive = async (clinicId: string, phone: string): Promise<boolean> => {
  const { state } = await loadSession(clinicId, phone);
  return MID_FLOW_STATES.has(state);
};

// --- Renderers ------------------------------------------------------------
const displayName = (name: string): string => (/^WhatsApp Patient/i.test(name) ? 'there' : name.split(' ')[0]);

// Legacy plain menu — kept EXACTLY as-is for the flag-off (non-modern) path.
const menuText = (params: BookingParams): string =>
  `👋 Welcome to ${params.clinicName}, ${displayName(params.patientName)}!\n\n` +
  `1. Book Appointment\n` +
  `2. My Appointments\n` +
  `3. Cancel Appointment\n` +
  `4. Reschedule Appointment\n\n` +
  `Reply with a number (1-4).`;

const numbered = (items: string[]): string => items.map((it, i) => `${i + 1}. ${it}`).join('\n');

// Conversational, optionally personalised menu. Returns plain text or an
// interactive list depending on WA_INTERACTIVE.
const buildMenu = async (params: BookingParams): Promise<BotReply> => {
  if (!modernEnabled()) return menuText(params);

  const lastDoc = await lastDoctorForPatient(params.clinicId, params.patientId);
  const name = displayName(params.patientName);
  const hello = lastDoc ? `👋 Welcome back, ${name}!` : `👋 Hi ${name}!`;
  const memory = lastDoc ? ` Last time you saw ${formatDoctorName(lastDoc.name)} (${lastDoc.speciality}).` : '';

  if (!interactiveOn()) {
    return (
      `${hello}${memory}\n\nHow can I help you today?\n\n` +
      `1. Book Appointment\n2. My Appointments\n3. Cancel Appointment\n4. Reschedule Appointment\n\n` +
      `Reply with a number, or just tell me what you need (e.g. "book a cardiologist tomorrow").`
    );
  }

  const rows: ReplyRow[] = [{ id: RID.MENU_BOOK, title: 'Book Appointment' }];
  if (lastDoc) {
    rows.push({
      id: RID.BOOK_AGAIN,
      title: 'Book again',
      description: `With ${formatDoctorName(lastDoc.name)} (${lastDoc.speciality})`
    });
  }
  rows.push(
    { id: RID.MENU_APPTS, title: 'My Appointments' },
    { id: RID.MENU_CANCEL, title: 'Cancel Appointment' },
    { id: RID.MENU_RESCHED, title: 'Reschedule' },
    { id: RID.TALK_HUMAN, title: 'Talk to clinic staff' }
  );

  return list({
    header: params.clinicName,
    body: `${hello}${memory} How can I help you today?`,
    button: 'Choose option',
    rows
  });
};

// ===========================================================================
// Flow entry points
// ===========================================================================

const showMenu = async (params: BookingParams): Promise<BotReply> => {
  await resetSession(params, S.MENU);
  if (!params.reason) why(params, 'rendering main menu (MENU)');
  return buildMenu(params);
};

// Low-confidence / ambiguous free text — ask the patient to clarify with quick
// options instead of guessing an intent. (AI mode only.)
const clarifyReply = async (params: BookingParams): Promise<BotReply> => {
  await resetSession(params, S.MENU);
  why(params, 'low-confidence understanding → clarify (no guess)');
  const body = `I want to make sure I help you correctly 🙂 What would you like to do?`;
  if (!interactiveOn()) {
    return (
      `${body}\n\n1. Book Appointment\n2. My Appointments\n3. Cancel Appointment\n4. Reschedule Appointment\n\n` +
      `Reply with a number, or type what you need — or say "staff" to reach a person.`
    );
  }
  return buttons({
    body,
    buttons: [
      { id: RID.MENU_BOOK, title: 'Book Appointment' },
      { id: RID.MENU_APPTS, title: 'My Appointments' },
      { id: RID.TALK_HUMAN, title: 'Talk to staff' }
    ]
  });
};

// Abort the current booking flow (patient said cancel/stop/nahi karna mid-way) →
// abandon and show the menu. Works in both deterministic and AI modes.
const abortToMenu = async (params: BookingParams): Promise<BotReply> => {
  await resetSession(params, S.MENU);
  params.action = 'aborted';
  why(params, 'patient aborted current booking flow (cancel/stop) → MENU');
  const menu = await buildMenu(params);
  return prefixReply(`No problem — I've stopped that. 🙆\n\n`, menu);
};

// Human handoff — flag a dashboard notification for staff and go quiet until the
// patient re-engages with a greeting/menu. The FSM still owns this: AI only
// surfaced the request.
const handleHandoff = async (params: BookingParams, reason: string): Promise<BotReply> => {
  await saveSession(params, S.HANDOFF, {});
  params.action = 'handoff';
  why(params, `human handoff: ${reason} → HANDOFF`);
  try {
    const db = forClinic(params.clinicId);
    await db.notification.create({
      data: {
        clinicId: params.clinicId,
        type: 'SYSTEM_ALERT',
        title: 'Patient asked to talk to staff (WhatsApp)',
        body:
          `${params.patientName}${params.patientCode ? ` (${params.patientCode})` : ''} on ${params.phone} ` +
          `asked to speak with a person. Last message: "${params.message.trim()}".`
      }
    });
  } catch (err) {
    console.error('[WhatsApp][booking] handoff notification failed:', err);
  }
  return (
    `No problem — I've let the ${params.clinicName} team know and someone will reach out to you shortly. 🙏\n\n` +
    `Reply MENU anytime to continue on your own.`
  );
};

// "Book again with Dr X" quick action — jump straight to that doctor's slots.
// Still flows through SLOT → CONFIRM in the FSM (no auto-booking).
const startBookAgain = async (params: BookingParams): Promise<BotReply> => {
  const lastDoc = await lastDoctorForPatient(params.clinicId, params.patientId);
  if (!lastDoc) return startBooking(params);
  why(params, `book-again → last doctor ${lastDoc.name}, present dates`);
  return proceedAfterDoctor(params, lastDoc, { mode: 'book' });
};

// --- BOOK: speciality -----------------------------------------------------
const startBooking = async (
  params: BookingParams,
  presetSpeciality?: string | null,
  preferredDate?: string | null,
  doctorName?: string | null
): Promise<BotReply> => {
  const specs = await distinctSpecialities(params.clinicId);
  if (specs.length === 0) {
    await resetSession(params);
    why(params, 'no doctors configured at clinic → reset to IDLE');
    return `Sorry, no doctors are set up yet. Please contact ${params.clinicName} directly.`;
  }

  // Patient named a doctor directly (e.g. "book Dr Ruchi") → jump to that
  // doctor's slots, skipping speciality + doctor selection. Still goes through
  // SLOT → CONFIRM, so nothing is booked without explicit confirmation.
  if (doctorName) {
    const doc = await findDoctorByName(params.clinicId, doctorName);
    if (doc) {
      why(params, `doctor named "${doctorName}" → ${preferredDate ? 'present slots' : 'present dates'} for ${doc.name}`);
      return proceedAfterDoctor(params, doc, { mode: 'book', preferredDate });
    }
  }

  // If the patient already named a real speciality, honour it and go straight to
  // the doctor list. We never auto-pick a speciality just because the clinic has
  // one — the patient still selects, so every step waits for input.
  const preset = presetSpeciality ? specs.find((s) => s.toLowerCase() === presetSpeciality.toLowerCase()) : undefined;
  if (preset) return presentDoctors(params, preset, preferredDate ?? undefined);

  await saveSession(params, S.SPECIALITY, {
    mode: 'book',
    specialityOptions: specs,
    preferredDate: preferredDate ?? undefined
  });
  why(params, `book intent → present ${specs.length} specialities, await choice`);
  if (!interactiveOn()) {
    return `Which speciality would you like to see?\n\n${numbered(specs)}\n\nReply with a number.`;
  }
  return list({
    header: 'Book Appointment',
    body: 'Which speciality would you like to see?',
    button: 'Choose speciality',
    rows: specs.slice(0, 10).map((s, i) => ({ id: optionId(i + 1), title: s }))
  });
};

const handleSpeciality = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  const opts = data.specialityOptions ?? [];
  const n = parseChoice(t);
  let speciality: string | undefined;

  if (n && opts[n - 1]) {
    speciality = opts[n - 1];
  } else {
    // Free text → deterministic keyword match to a real speciality from the list.
    const { speciality: mapped } = classifyIntent(t, opts);
    speciality = mapped ?? undefined;
  }

  if (!speciality) {
    why(params, `input "${t}" did not match any speciality → re-prompt SPECIALITY (no advance)`);
    return `Please choose a speciality by number:\n\n${numbered(opts)}`;
  }
  return presentDoctors(params, speciality, data.preferredDate);
};

// --- BOOK: doctor ---------------------------------------------------------
const presentDoctors = async (
  params: BookingParams,
  speciality: string,
  preferredDate?: string
): Promise<BotReply> => {
  const docs = await doctorsForSpeciality(params.clinicId, speciality);
  if (docs.length === 0) {
    const specs = await distinctSpecialities(params.clinicId);
    await saveSession(params, S.SPECIALITY, { mode: 'book', specialityOptions: specs, preferredDate });
    why(params, `no doctors for "${speciality}" → re-show speciality list`);
    return `No doctors found for ${speciality}. Choose a speciality:\n\n${numbered(specs)}\n\nReply with a number.`;
  }

  // Single doctor → skip the pointless one-option prompt and present slots.
  if (docs.length === 1) {
    why(params, `speciality "${speciality}" has a single doctor (${docs[0].name}) → auto-select, present dates`);
    return proceedAfterDoctor(params, docs[0], { mode: 'book', preferredDate });
  }

  // Multiple doctors → present the list and wait for an explicit choice.
  await saveSession(params, S.DOCTOR, { mode: 'book', speciality, doctorOptions: docs, preferredDate });
  why(params, `speciality "${speciality}" → present ${docs.length} doctor(s), await choice`);
  if (!interactiveOn()) {
    return (
      `${speciality} — please choose a doctor:\n\n` +
      `${numbered(docs.map((d) => formatDoctorName(d.name)))}\n\n` +
      `Reply with a number.`
    );
  }
  return list({
    header: speciality,
    body: 'Please choose a doctor:',
    button: 'Choose doctor',
    rows: docs.slice(0, 10).map((d, i) => ({ id: optionId(i + 1), title: formatDoctorName(d.name), description: d.speciality }))
  });
};

const handleDoctor = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  const opts = data.doctorOptions ?? [];
  const n = parseChoice(t);
  if (!n || !opts[n - 1]) {
    why(params, `input "${t}" is not a valid doctor number → re-prompt DOCTOR (no advance)`);
    return `Please choose a doctor by number:\n\n${numbered(opts.map((d) => formatDoctorName(d.name)))}`;
  }
  return proceedAfterDoctor(params, opts[n - 1], { mode: data.mode ?? 'book', preferredDate: data.preferredDate });
};

// --- BOOK/RESCHEDULE: date picker -----------------------------------------
// After a doctor is chosen, offer a date BEFORE times (Practo/Zocdoc-style). If
// the patient already named a date (voice/AI extracted it), we skip the picker
// and jump straight to that day's times. `mode`/`rescheduleApptId` are threaded
// through so reschedule reuses the exact same date → slot → confirm path.
const proceedAfterDoctor = async (
  params: BookingParams,
  doctor: DoctorOption,
  opts: { mode: 'book' | 'reschedule'; rescheduleApptId?: string; preferredDate?: string | null }
): Promise<BotReply> => {
  if (opts.preferredDate) {
    return presentSlots(params, doctor, 0, opts.mode, opts.rescheduleApptId, opts.preferredDate);
  }
  return presentDates(params, doctor, opts);
};

const presentDates = async (
  params: BookingParams,
  doctor: DoctorOption,
  opts: { mode: 'book' | 'reschedule'; rescheduleApptId?: string }
): Promise<BotReply> => {
  // Build the next N calendar days and ask the DB how many slots each has open.
  // getDateAvailability counts only FUTURE slots (clinic-local), so "today" once
  // its last slot has passed reports available:0.
  const today0 = clinicTodayBase();
  const todayStr = clinicNow().dateStr;
  const days: { date: string; available: number }[] = [];
  for (let i = 0; i < DATE_PICKER_DAYS; i += 1) {
    const d = new Date(today0.getTime() + i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const { working, available } = await getDateAvailability(params.clinicId, doctor.id, dateStr);
    // Skip days the doctor doesn't work (no schedule / on leave). Also HIDE today
    // once all of today's slots are over (available:0) — there is nothing left to
    // book today. A FUTURE working day that is full is still shown, labelled
    // "Fully booked".
    if (!working) continue;
    if (dateStr === todayStr && available === 0) continue;
    days.push({ date: dateStr, available });
  }

  // No working days in the window → don't dead-end; fall back to the rolling
  // next-available scan (which looks further out than the 7-day picker).
  if (days.length === 0) {
    why(params, `no working days for ${doctor.name} in next ${DATE_PICKER_DAYS} days → next-available scan`);
    return presentSlots(params, doctor, 0, opts.mode, opts.rescheduleApptId);
  }

  await saveSession(params, S.DATE, {
    mode: opts.mode,
    speciality: doctor.speciality,
    doctorId: doctor.id,
    doctorName: doctor.name,
    doctorSpeciality: doctor.speciality,
    rescheduleApptId: opts.rescheduleApptId,
    dateOptions: days
  });
  why(params, `doctor "${doctor.name}" → present ${days.length} date(s), await choice`);

  if (!interactiveOn()) {
    const lines = days.map((d) => `${dayLabel(d.date)} — ${d.available > 0 ? `${d.available} slots` : 'Fully booked'}`);
    return `Choose a date for ${formatDoctorName(doctor.name)} (${doctor.speciality}):\n\n${numbered(lines)}\n\nReply with a number.`;
  }
  return list({
    header: formatDoctorName(doctor.name),
    body: `Choose a date (${doctor.speciality}):`,
    button: 'Choose date',
    rows: days.slice(0, 10).map((d, i) => ({
      id: optionId(i + 1),
      title: dayLabel(d.date),
      description: d.available > 0 ? `${d.available} slot${d.available === 1 ? '' : 's'} available` : 'Fully booked'
    }))
  });
};

const handleDate = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  const opts = data.dateOptions ?? [];
  const doctor: DoctorOption = {
    id: data.doctorId ?? '',
    name: data.doctorName ?? 'the doctor',
    speciality: data.doctorSpeciality ?? ''
  };
  const n = parseChoice(t);
  if (!n || !opts[n - 1]) {
    why(params, `input "${t}" is not a valid date number → re-prompt DATE (no advance)`);
    const lines = opts.map((d) => `${dayLabel(d.date)} — ${d.available > 0 ? `${d.available} slots` : 'Fully booked'}`);
    return `Please choose a date by number:\n\n${numbered(lines)}`;
  }

  const chosen = opts[n - 1];
  // Tapped a fully-booked day. For a normal booking, offer the waitlist for that
  // doctor+date. For a reschedule, just send them back to the date picker.
  if (chosen.available <= 0) {
    if ((data.mode ?? 'book') === 'book') {
      return offerJoinWaitlist(params, doctor, chosen.date);
    }
    why(params, `date ${chosen.date} is fully booked (reschedule) → re-show date picker`);
    return prefixReply(
      `📅 ${dayLabel(chosen.date)} is fully booked. Please pick another date:\n\n`,
      await presentDates(params, doctor, { mode: data.mode ?? 'book', rescheduleApptId: data.rescheduleApptId })
    );
  }

  // A concrete date is chosen → show that day's full set of times.
  return presentSlots(params, doctor, 0, data.mode ?? 'book', data.rescheduleApptId, chosen.date);
};

// --- WAITLIST -------------------------------------------------------------
// Offer to join the waitlist when no slot is available. Parks the doctor + the
// date they wanted on the session so a YES adds a targeted waitlist entry.
const offerJoinWaitlist = async (
  params: BookingParams,
  doctor: DoctorOption,
  dateStr?: string
): Promise<BotReply> => {
  await saveSession(params, S.WAITLIST_CONFIRM, {
    doctorId: doctor.id,
    doctorName: doctor.name,
    doctorSpeciality: doctor.speciality,
    waitlistDate: dateStr
  });
  why(params, `no slot for ${doctor.name}${dateStr ? ` on ${dateStr}` : ''} → offer Join Waitlist`);
  const body =
    `😔 No open slots${dateStr ? ` on ${dayLabel(dateStr)}` : ''} with ${formatDoctorName(doctor.name)} (${doctor.speciality}) right now.\n\n` +
    `Want me to add you to the waitlist? I'll message you the moment a slot frees up.`;
  if (!interactiveOn()) {
    return `${body}\n\nReply YES to join the waitlist, or MENU to go back.`;
  }
  return buttons({
    header: 'Join waitlist',
    body,
    buttons: [
      { id: RID.CONF_YES, title: '🔔 Join waitlist' },
      { id: RID.CONF_NO, title: '↩️ Back to menu' }
    ]
  });
};

// WAITLIST_CONFIRM: patient answered the "join the waitlist?" prompt.
const handleWaitlistConfirm = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  if (!isYes(t)) {
    why(params, 'declined to join waitlist → MENU');
    return showMenu(params);
  }
  await joinWaitlist({
    clinicId: params.clinicId,
    patientId: params.patientId,
    doctorId: data.doctorId ?? null,
    speciality: data.doctorSpeciality ?? null,
    date: data.waitlistDate ?? null
  });
  await resetSession(params, S.BOOKED);
  params.action = 'waitlist_join';
  why(params, 'patient joined the waitlist → BOOKED');
  return (
    `🔔 Done — you're on the waitlist${data.doctorName ? ` for ${formatDoctorName(data.doctorName)}` : ''}` +
    `${data.waitlistDate ? ` (${dayLabel(data.waitlistDate)})` : ''}.\n\n` +
    `The moment a slot opens I'll message you here — just reply YES then to grab it. Reply MENU anytime.`
  );
};

// WAITLIST_OFFER: a freed slot was offered to this patient (session set by
// autoOfferFreedSlot on a cancellation). YES claims it, NO passes it on.
const handleWaitlistOffer = async (params: BookingParams, t: string): Promise<BotReply> => {
  const offer = await pendingOfferFor(params.clinicId, params.patientId);
  if (!offer) {
    await resetSession(params, S.MENU);
    why(params, 'no live waitlist offer (expired/none) → MENU');
    return prefixReply(`That slot offer has expired. `, await showMenu(params));
  }
  if (isNo(t)) {
    await declineWaitlistOffer(params.clinicId, params.patientId);
    await resetSession(params, S.MENU);
    why(params, 'patient passed on the slot offer → rolled to next in line');
    return `No problem — I've offered it to the next person in line. Reply MENU anytime.`;
  }
  if (isYes(t)) {
    const res = await claimWaitlistOffer(params.clinicId, params.patientId);
    await resetSession(params, S.BOOKED);
    if (res.success) {
      params.action = 'waitlist_claim';
      why(params, 'patient claimed the waitlist offer → appointment created');
      return (
        `✅ Booked! ${formatDoctorName(res.doctor ?? 'your doctor')} on ${dateLabel(res.date as string)} at ${res.time}.\n` +
        `🟡 ${friendlyStatus('PENDING')}\n\n${params.clinicName} will confirm it shortly. Reply MENU for options.`
      );
    }
    why(params, `waitlist claim failed: ${res.error}`);
    return `😔 ${res.error}\n\nReply MENU to try booking again.`;
  }
  why(params, 'awaiting YES/NO on the live waitlist offer');
  return (
    `You have a slot offer waiting — ${dateLabel(offer.offeredDate ? offer.offeredDate.toISOString().slice(0, 10) : '')} at ${offer.offeredTime}.\n\n` +
    `Reply YES to claim it or NO to pass.`
  );
};

// --- Shared: slots (used by both book and reschedule) ---------------------
const presentSlots = async (
  params: BookingParams,
  doctor: DoctorOption,
  offset: number,
  mode: 'book' | 'reschedule',
  rescheduleApptId?: string,
  preferredDate?: string
): Promise<BotReply> => {
  // No specific date requested → spread a few times across several upcoming days
  // so the list isn't filled by today alone. A requested date shows its full times.
  const maxPerDay = preferredDate ? undefined : SLOTS_MAX_PER_DAY;
  const all = await collectUpcomingSlots(params.clinicId, doctor.id, offset + SLOTS_PER_PAGE + 1, preferredDate, maxPerDay);
  const page = all.slice(offset, offset + SLOTS_PER_PAGE);

  if (page.length === 0) {
    // Genuine dead-end on a fresh booking → offer the waitlist instead of a dead
    // "no slots" message. (Paging past the end, or a reschedule, just resets.)
    if (offset === 0 && mode === 'book') {
      return offerJoinWaitlist(params, doctor, preferredDate);
    }
    await resetSession(params);
    why(params, `no open slots for ${doctor.name} (offset ${offset}) → reset to IDLE`);
    return offset === 0
      ? `Sorry, ${formatDoctorName(doctor.name)} has no open slots right now. Reply MENU to start over.`
      : `No more slots available. Reply MENU to start over.`;
  }

  await saveSession(params, S.SLOT, {
    mode,
    speciality: doctor.speciality,
    doctorId: doctor.id,
    doctorName: doctor.name,
    doctorSpeciality: doctor.speciality,
    slotOptions: page,
    slotOffset: offset,
    rescheduleApptId,
    preferredDate
  });

  const hasMore = all.length > offset + SLOTS_PER_PAGE;
  why(
    params,
    `${mode === 'reschedule' ? 'reschedule' : 'doctor'} "${doctor.name}" → present ${page.length} slots (offset ${offset}), await choice`
  );

  if (!interactiveOn()) {
    const footer = hasMore
      ? `\n\nReply with a number to pick a time, or MORE for later dates.`
      : `\n\nReply with a number to pick a time.`;
    return `Available times with ${formatDoctorName(doctor.name)} (${doctor.speciality}):\n\n${numbered(page.map(slotLabel))}${footer}`;
  }

  const rows = page.map((s, i) => ({ id: optionId(i + 1), title: s.time, description: dateLabel(s.date) }));
  if (hasMore) rows.push({ id: RID.MORE, title: 'See more times', description: 'Later dates' });
  return list({
    header: formatDoctorName(doctor.name),
    body: `Available times (${doctor.speciality}):`,
    button: 'Pick a time',
    rows
  });
};

const handleSlot = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  const opts = data.slotOptions ?? [];
  const doctor: DoctorOption = {
    id: data.doctorId ?? '',
    name: data.doctorName ?? 'the doctor',
    speciality: data.doctorSpeciality ?? ''
  };

  if (isMore(t)) {
    return presentSlots(
      params,
      doctor,
      (data.slotOffset ?? 0) + SLOTS_PER_PAGE,
      data.mode ?? 'book',
      data.rescheduleApptId,
      data.preferredDate
    );
  }

  const n = parseChoice(t);
  if (!n || !opts[n - 1]) {
    why(params, `input "${t}" is not a valid slot number → re-prompt SLOT (no advance)`);
    return `Please reply with a number to choose a time:\n\n${numbered(opts.map(slotLabel))}`;
  }

  const selected = opts[n - 1];
  await saveSession(params, S.CONFIRM, { ...data, selected });
  why(params, `slot #${n} (${slotLabel(selected)}) chosen → ask CONFIRMATION, await YES/NO`);

  if (!interactiveOn()) {
    return (
      `Please confirm your appointment:\n\n` +
      `👨‍⚕️ ${formatDoctorName(doctor.name)} (${doctor.speciality})\n` +
      `📅 ${slotLabel(selected)}\n\n` +
      `Reply YES to confirm or NO to cancel.`
    );
  }
  return buttons({
    header: 'Confirm appointment',
    body: `👨‍⚕️ ${formatDoctorName(doctor.name)} (${doctor.speciality})\n📅 ${slotLabel(selected)}`,
    buttons: [
      { id: RID.CONF_YES, title: '✅ Confirm' },
      { id: RID.CHANGE_TIME, title: '🔁 Change time' }
    ]
  });
};

// --- Shared: confirmation -------------------------------------------------
const handleConfirm = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  if (isNo(t)) {
    await resetSession(params);
    why(params, 'patient replied NO at CONFIRMATION → nothing booked, reset to IDLE');
    return `No problem — nothing was booked. Reply MENU anytime to start again.`;
  }
  if (!isYes(t)) {
    why(params, `input "${t}" is neither YES nor NO → re-prompt CONFIRMATION (no advance)`);
    return `Please reply YES to confirm or NO to cancel.`;
  }

  const selected = data.selected;
  const doctorId = data.doctorId;
  if (!selected || !doctorId) {
    why(params, 'CONFIRMATION reached with no pending slot in session → MENU');
    return showMenu(params);
  }

  try {
    if (data.mode === 'reschedule' && data.rescheduleApptId) {
      const updated = await updateAppointment(params.clinicId, data.rescheduleApptId, {
        appointmentDate: selected.date,
        appointmentTime: selected.time
      });
      await resetSession(params, S.BOOKED);
      params.action = 'reschedule';
      why(params, 'patient replied YES → appointment RESCHEDULED, terminal state BOOKED');
      return (
        `✅ Your appointment has been moved to:\n\n` +
        `👨‍⚕️ ${formatDoctorName(updated.doctor?.name ?? data.doctorName)}\n` +
        `📅 ${slotLabel(selected)}\n\n` +
        `Reply MENU for more options.`
      );
    }

    // Duplicate-booking guard.
    const conflict = await findConflictingActiveAppointment(
      params.clinicId,
      params.patientId,
      doctorId,
      selected.date,
      selected.time
    );
    if (conflict) {
      await resetSession(params, S.MENU);
      const sameDoctor = conflict.doctorId === doctorId;
      params.action = 'book_blocked_duplicate';
      why(
        params,
        `duplicate guard: patient already has active appt ${conflict.id} (${sameDoctor ? 'same doctor' : 'same time'}) → not booked, MENU`
      );
      return (
        `⚠️ You already have an appointment with ${formatDoctorName(conflict.doctor?.name)} ` +
        `on ${slotLabel({ date: selected.date, time: conflict.appointmentTime })} (${friendlyStatus(conflict.status)}).\n\n` +
        `I didn't book a duplicate. Reply MENU to view or reschedule it.`
      );
    }

    await createAppointment(
      params.clinicId,
      {
        patientId: params.patientId,
        doctorId,
        appointmentDate: selected.date,
        appointmentTime: selected.time
      },
      { notify: false }
    );
    await resetSession(params, S.BOOKED);
    params.action = 'book';
    why(params, 'patient replied YES → appointment CREATED (PENDING), terminal state BOOKED');
    return (
      `✅ Appointment request received!\n\n` +
      `👨‍⚕️ ${formatDoctorName(data.doctorName)} (${data.doctorSpeciality})\n` +
      `📅 ${slotLabel(selected)}\n` +
      `🟡 ${friendlyStatus('PENDING')}\n\n` +
      `${params.clinicName} will confirm it shortly and you'll get a confirmation message here. ` +
      `Reply MENU for more options.`
    );
  } catch (err) {
    // Most likely the slot was taken between display and confirm (409). Re-show
    // fresh slots so the patient never lands on a dead end.
    const msg = err instanceof Error ? err.message : 'Could not book that slot.';
    const doctor: DoctorOption = {
      id: doctorId,
      name: data.doctorName ?? 'the doctor',
      speciality: data.doctorSpeciality ?? ''
    };
    const reshow = await presentSlots(params, doctor, 0, data.mode ?? 'book', data.rescheduleApptId, data.preferredDate);
    why(params, `booking failed on confirm (${msg}) → re-show fresh slots, back to SLOT`);
    return prefixReply(`⚠️ ${msg}\n\n`, reshow);
  }
};

// --- CHECK ----------------------------------------------------------------
const doCheck = async (params: BookingParams): Promise<BotReply> => {
  const appts = await activeAppointments(params.clinicId, params.patientId);
  await resetSession(params, S.MENU);
  why(params, `menu option 2 → listed ${appts.length} appointment(s), back to MENU`);
  if (appts.length === 0) {
    return `You have no upcoming appointments. Reply MENU to book one.`;
  }
  const lines = appts.map(
    (a) =>
      `${formatDoctorName(a.doctor?.name)} (${a.doctor?.speciality ?? ''}) — ` +
      `${dateLabel(a.appointmentDate.toISOString().slice(0, 10))} at ${a.appointmentTime} (${friendlyStatus(a.status)})`
  );
  return `Your upcoming appointments:\n\n${numbered(lines)}\n\nReply MENU for options.`;
};

// --- CANCEL ---------------------------------------------------------------
const apptOptionsFrom = (
  appts: Awaited<ReturnType<typeof activeAppointments>>
): ApptOption[] =>
  appts.map((a) => ({
    id: a.id,
    doctorId: a.doctorId,
    doctorName: a.doctor?.name ?? 'Doctor',
    doctorSpeciality: a.doctor?.speciality ?? '',
    label: `${formatDoctorName(a.doctor?.name)} — ${dateLabel(a.appointmentDate.toISOString().slice(0, 10))} at ${a.appointmentTime}`
  }));

// Render an appointment-selection prompt (shared by cancel + reschedule).
const apptSelectReply = (opts: ApptOption[], verb: 'cancel' | 'reschedule'): BotReply => {
  if (!interactiveOn()) {
    return (
      `Which appointment would you like to ${verb}?\n\n${numbered(opts.map((a) => a.label))}\n\n` +
      `Reply with a number, or NO to ${verb === 'cancel' ? 'keep them' : 'cancel'}.`
    );
  }
  const rows = opts.slice(0, 9).map((a, i) => ({
    id: optionId(i + 1),
    title: formatDoctorName(a.doctorName),
    description: a.label.replace(/^.*?—\s*/, '')
  }));
  rows.push({ id: RID.CONF_NO, title: verb === 'cancel' ? 'Keep all' : 'Never mind', description: 'Go back to menu' });
  return list({
    header: verb === 'cancel' ? 'Cancel appointment' : 'Reschedule appointment',
    body: `Which appointment would you like to ${verb}?`,
    button: 'Select',
    rows
  });
};

const startCancel = async (params: BookingParams): Promise<BotReply> => {
  const appts = await activeAppointments(params.clinicId, params.patientId);
  if (appts.length === 0) {
    await resetSession(params, S.MENU);
    why(params, 'menu option 3 but no appointments to cancel → MENU');
    return `You have no upcoming appointments to cancel. Reply MENU for options.`;
  }
  const apptOptions = apptOptionsFrom(appts);
  await saveSession(params, S.CANCEL_SELECT, { apptOptions });
  why(params, `menu option 3 → present ${apptOptions.length} appt(s) to cancel, await choice`);
  return apptSelectReply(apptOptions, 'cancel');
};

const handleCancelSelect = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  if (isNo(t)) {
    why(params, 'patient replied NO at CANCEL_SELECTION → keep appointments, MENU');
    return showMenu(params);
  }
  const opts = data.apptOptions ?? [];
  const n = parseChoice(t);
  if (!n || !opts[n - 1]) {
    why(params, `input "${t}" is not a valid appointment number → re-prompt CANCEL_SELECTION`);
    return `Please choose by number which appointment to cancel:\n\n${numbered(opts.map((a) => a.label))}`;
  }
  const chosen = opts[n - 1];
  await saveSession(params, S.CANCEL_CONFIRM, { cancelApptId: chosen.id, cancelLabel: chosen.label });
  why(params, `appointment #${n} chosen → ask CANCEL_CONFIRMATION, await YES/NO`);
  if (!interactiveOn()) {
    return `Cancel this appointment?\n\n${chosen.label}\n\nReply YES to cancel, NO to keep it.`;
  }
  return buttons({
    header: 'Cancel appointment',
    body: chosen.label,
    buttons: [
      { id: RID.CONF_YES, title: 'Yes, cancel' },
      { id: RID.CONF_NO, title: 'No, keep it' }
    ]
  });
};

const handleCancelConfirm = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  if (isNo(t)) {
    await resetSession(params, S.MENU);
    why(params, 'patient replied NO at CANCEL_CONFIRMATION → keep appointment, MENU');
    return `Okay, your appointment is unchanged. Reply MENU for options.`;
  }
  if (!isYes(t)) {
    why(params, `input "${t}" is neither YES nor NO → re-prompt CANCEL_CONFIRMATION`);
    return `Please reply YES to cancel or NO to keep it.`;
  }
  if (!data.cancelApptId) {
    why(params, 'CANCEL_CONFIRMATION with no target appointment → MENU');
    return showMenu(params);
  }
  try {
    await cancelAppointment(params.clinicId, data.cancelApptId);
  } catch {
    // ignore — fall through to a clean message
  }
  await resetSession(params, S.BOOKED);
  params.action = 'cancel';
  why(params, 'patient replied YES → appointment CANCELLED, terminal state BOOKED');
  return `Your appointment has been cancelled. Reply MENU to book a new one.`;
};

// --- RESCHEDULE -----------------------------------------------------------
const startReschedule = async (params: BookingParams): Promise<BotReply> => {
  const appts = await activeAppointments(params.clinicId, params.patientId);
  if (appts.length === 0) {
    await resetSession(params, S.MENU);
    why(params, 'menu option 4 but no appointments to reschedule → MENU');
    return `You have no upcoming appointments to reschedule. Reply MENU to book one.`;
  }
  const apptOptions = apptOptionsFrom(appts);
  await saveSession(params, S.RESCHED_SELECT, { mode: 'reschedule', apptOptions });
  why(params, `menu option 4 → present ${apptOptions.length} appt(s) to reschedule, await choice`);
  return apptSelectReply(apptOptions, 'reschedule');
};

const handleRescheduleSelect = async (params: BookingParams, data: SessionData, t: string): Promise<BotReply> => {
  if (isNo(t)) {
    why(params, 'patient replied NO at RESCHEDULE_SELECTION → MENU');
    return showMenu(params);
  }
  const opts = data.apptOptions ?? [];
  const n = parseChoice(t);
  if (!n || !opts[n - 1]) {
    why(params, `input "${t}" is not a valid appointment number → re-prompt RESCHEDULE_SELECTION`);
    return `Please choose by number which appointment to reschedule:\n\n${numbered(opts.map((a) => a.label))}`;
  }
  const chosen = opts[n - 1];
  // Reuse the date → slot flow for the SAME doctor (no preset date → date picker).
  return proceedAfterDoctor(
    params,
    { id: chosen.doctorId, name: chosen.doctorName, speciality: chosen.doctorSpeciality },
    { mode: 'reschedule', rescheduleApptId: chosen.id }
  );
};

// ===========================================================================
// Public entry point — called once per inbound text by the webhook controller.
// Always returns a single reply (text or interactive), or null to stay silent;
// every branch sets the next state.
// ===========================================================================
export const handleWhatsAppMessage = async (params: BookingParams): Promise<BotReply | null> => {
  let t = params.message.trim();
  const { state, data } = await loadSession(params.clinicId, params.phone);

  // A tapped interactive option is normalised to the canonical text the handlers
  // already accept (or a special out-of-band action).
  let special: 'human' | 'book_again' | 'change_time' | null = null;
  if (params.replyId) {
    const norm = normalizeReplyId(params.replyId);
    if (norm.special) special = norm.special;
    else if (norm.text !== undefined) t = norm.text;
  }

  console.info('[FSM] ▶ turn start', {
    phone: params.phone,
    currentState: state,
    patientMessage: params.message.trim(),
    tappedReplyId: params.replyId ?? null
  });

  let reply: BotReply | null;
  try {
    if (special === 'human') {
      reply = await handleHandoff(params, 'tapped "Talk to staff"');
    } else if (special === 'book_again') {
      reply = await startBookAgain(params);
    } else if (special === 'change_time') {
      const doctor: DoctorOption = {
        id: data.doctorId ?? '',
        name: data.doctorName ?? 'the doctor',
        speciality: data.doctorSpeciality ?? ''
      };
      why(params, 'tapped "Change time" → re-show slots');
      reply = doctor.id
        ? await presentSlots(params, doctor, 0, data.mode ?? 'book', data.rescheduleApptId, data.preferredDate)
        : await showMenu(params);
    } else if (isReset(t)) {
      why(params, `input "${t}" matched reset/greeting → MENU`);
      reply = await showMenu(params);
    } else if (isAbort(t) && (state === S.SPECIALITY || state === S.DOCTOR || state === S.DATE || state === S.SLOT)) {
      // Mid-booking "cancel / stop / nahi karna" → abandon this flow, show menu.
      // (At the top level "cancel" instead means the cancel-an-appointment flow,
      // and at CONFIRM/selection steps the handlers' own NO already abandons.)
      reply = await abortToMenu(params);
    } else {
      switch (state) {
        case S.SPECIALITY:
          reply = await handleSpeciality(params, data, t);
          break;
        case S.DOCTOR:
          reply = await handleDoctor(params, data, t);
          break;
        case S.DATE:
          reply = await handleDate(params, data, t);
          break;
        case S.SLOT:
          reply = await handleSlot(params, data, t);
          break;
        case S.CONFIRM:
          reply = await handleConfirm(params, data, t);
          break;
        case S.CANCEL_SELECT:
          reply = await handleCancelSelect(params, data, t);
          break;
        case S.CANCEL_CONFIRM:
          reply = await handleCancelConfirm(params, data, t);
          break;
        case S.RESCHED_SELECT:
          reply = await handleRescheduleSelect(params, data, t);
          break;
        case S.WAITLIST_CONFIRM:
          reply = await handleWaitlistConfirm(params, data, t);
          break;
        case S.WAITLIST_OFFER:
          reply = await handleWaitlistOffer(params, t);
          break;
        case S.HANDOFF:
          // After a handoff stay quiet until a greeting/menu re-engages (handled
          // by the isReset branch above). Any other chatter → no reply.
          why(params, 'in HANDOFF, non-reset message → STAY SILENT (no reply)');
          reply = null;
          break;

        // IDLE / MENU / BOOKED — interpret as a fresh top-level choice.
        default:
          reply = await handleTopLevel(params, t);
          break;
      }
    }
  } catch (err) {
    console.error('[WhatsApp][booking] handler error:', err);
    why(params, 'handler threw → safe reset to MENU');
    reply = await showMenu(params);
  }

  // Re-read the persisted state so the log reflects what was ACTUALLY saved.
  const { state: nextState } = await loadSession(params.clinicId, params.phone);
  const u = params.understanding;
  console.info('[FSM] ◀ transition', {
    phone: params.phone,
    currentState: state,
    patientMessage: t,
    nextState,
    intent: u?.intent ?? null,
    confidence: u?.confidence ?? null,
    source: u?.source ?? 'fsm',
    action: params.action ?? null,
    reason: params.reason ?? '(no transition — re-prompted same state)',
    waiting: nextState !== S.BOOKED
  });

  // Audit trail (best-effort, never blocks the reply): message → understanding →
  // FSM transition → action. Proves the AI only understood; the FSM transitioned.
  void recordWhatsAppAudit({
    phone: params.phone,
    clinicId: params.clinicId,
    patientId: params.patientId,
    message: params.message.trim(),
    intent: u?.intent ?? null,
    confidence: u?.confidence ?? null,
    speciality: u?.speciality ?? null,
    fsmStateFrom: state,
    fsmStateTo: nextState,
    action: params.action ?? null,
    source: u?.source ?? 'fsm'
  });

  return reply;
};

// Top-level routing: numbered menu choice first (deterministic), then the AI
// receptionist understanding. Returns null to mean "stay silent" for
// non-actionable chatter in a settled state.
const handleTopLevel = async (params: BookingParams, t: string): Promise<BotReply | null> => {
  const n = parseChoice(t);
  if (n === 1) return startBooking(params);
  if (n === 2) return doCheck(params);
  if (n === 3) return startCancel(params);
  if (n === 4) return startReschedule(params);

  // Free text → AI Receptionist understanding (or deterministic fallback). It
  // ONLY classifies + extracts; the branch it routes into is pure FSM.
  const [specs, doctorNames] = await Promise.all([
    distinctSpecialities(params.clinicId),
    doctorNamesForClinic(params.clinicId)
  ]);
  const u = await understand({ message: t, specialities: specs, doctorNames, forceAi: params.fromVoice });
  params.understanding = u;
  console.info('[FSM] receptionist understanding', {
    patientMessage: t,
    intent: u.intent,
    speciality: u.speciality,
    doctorName: u.doctorName,
    preferredDate: u.preferredDate,
    confidence: u.confidence,
    wantsHuman: u.wantsHuman,
    source: u.source
  });

  // --- AI-only enrichments (never affect the deterministic/flag-off path) ----
  if (u.source === 'ai') {
    // Generic capability FAQ → answer, then show the menu.
    if (u.faqAnswer) {
      params.action = 'faq';
      why(params, 'receptionist answered FAQ → MENU');
      const menu = await showMenu(params);
      return prefixReply(`${u.faqAnswer}\n\n`, menu);
    }
    // Explicit human request or data we can't answer → handoff.
    if (u.wantsHuman) {
      return handleHandoff(params, 'patient asked for a person');
    }
    // Low confidence → clarify instead of guessing (menu greetings excepted).
    if (u.confidence < confidenceMin() && u.intent !== 'menu') {
      params.action = 'clarify';
      return clarifyReply(params);
    }
  }

  switch (u.intent) {
    case 'book':
    case 'availability':
      // "availability" (e.g. "is Dr Ruchi free today?") presents that doctor's /
      // speciality's real open slots — read-only info that flows into the normal
      // book → confirm path; nothing is booked without explicit confirmation.
      return startBooking(params, u.speciality, u.preferredDate, u.doctorName);
    case 'cancel':
      return startCancel(params);
    case 'reschedule':
      return startReschedule(params);
    case 'check':
      return doCheck(params);
    case 'menu':
      why(params, `input "${t}" is a greeting/menu request → MENU`);
      return showMenu(params);
    default:
      // Nothing actionable in a settled state — stay SILENT (existing behaviour).
      why(params, `input "${t}" is not an actionable command in a settled state → STAY SILENT (no reply)`);
      return null;
  }
};
