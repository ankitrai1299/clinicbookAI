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
// never invented. There is NO AI/OpenAI anywhere in this flow: free text is
// mapped to an intent and a real speciality by a deterministic keyword matcher
// (classifyIntent, whatsapp.intent.ts). The FSM never calls the OpenAI agent and
// never creates AiConversation / AiMessage rows.
//
// State + the exact options last presented are persisted per phone in
// WhatsAppSession, so a bare "1" on the next webhook resolves deterministically.
// ===========================================================================

import { prisma } from '../../config/prisma.js';
import { formatDoctorName } from '../../utils/doctorName.js';
import { classifyIntent } from './whatsapp.intent.js';
import { createAppointment, cancelAppointment, updateAppointment } from '../appointments/appointment.service.js';
import { getAvailableSlots } from '../../services/scheduling.service.js';

// --- States ---------------------------------------------------------------
const S = {
  IDLE: 'IDLE',
  MENU: 'MENU',
  SPECIALITY: 'SPECIALITY_SELECTION',
  DOCTOR: 'DOCTOR_SELECTION',
  SLOT: 'SLOT_SELECTION',
  CONFIRM: 'CONFIRMATION',
  BOOKED: 'BOOKED',
  CANCEL_SELECT: 'CANCEL_SELECTION',
  CANCEL_CONFIRM: 'CANCEL_CONFIRMATION',
  RESCHED_SELECT: 'RESCHEDULE_SELECTION'
} as const;

const SLOTS_PER_PAGE = 5;
const SLOT_SCAN_DAYS = 21;

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
  selected?: SlotOption;
  apptOptions?: ApptOption[];
  cancelApptId?: string;
  cancelLabel?: string;
  rescheduleApptId?: string;
}

export interface BookingParams {
  clinicId: string;
  patientId: string;
  patientName: string;
  clinicName: string;
  phone: string; // digits-only
  patientCode?: string | null;
  message: string;
  // Internal (set by handlers, read by the central transition logger): a short
  // human-readable explanation of WHY the last transition happened. Last writer
  // wins, so the innermost/terminal action's reason is what gets logged.
  reason?: string;
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

// --- Date formatting (UTC, matches the YYYY-MM-DD slot dates) --------------
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (date: string): string => {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const slotLabel = (s: SlotOption): string => `${dateLabel(s.date)} at ${s.time}`;

// --- DB helpers -----------------------------------------------------------
const distinctSpecialities = async (clinicId: string): Promise<string[]> => {
  const docs = await prisma.doctor.findMany({ where: { clinicId }, select: { speciality: true } });
  return [...new Set(docs.map((d) => d.speciality.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
};

const doctorsForSpeciality = async (clinicId: string, speciality: string): Promise<DoctorOption[]> => {
  const docs = await prisma.doctor.findMany({
    where: { clinicId, speciality: { equals: speciality, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, speciality: true }
  });
  return docs;
};

// Scan forward from today and collect up to `needed` real open (date,time) slots.
const collectUpcomingSlots = async (clinicId: string, doctorId: string, needed: number): Promise<SlotOption[]> => {
  const out: SlotOption[] = [];
  const now = new Date();
  for (let i = 0; i < SLOT_SCAN_DAYS && out.length < needed; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    const dateStr = d.toISOString().slice(0, 10);
    const times = await getAvailableSlots(clinicId, doctorId, dateStr);
    for (const time of times) {
      out.push({ date: dateStr, time });
      if (out.length >= needed) break;
    }
  }
  return out;
};

const activeAppointments = async (clinicId: string, patientId: string) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return prisma.appointment.findMany({
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
  const target = new Date(`${date}T00:00:00.000Z`);
  return prisma.appointment.findFirst({
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
const loadSession = async (phone: string): Promise<{ state: string; data: SessionData }> => {
  const row = await prisma.whatsAppSession.findUnique({ where: { phone } });
  if (!row) return { state: S.IDLE, data: {} };
  let data: SessionData = {};
  try {
    data = JSON.parse(row.data || '{}') as SessionData;
  } catch {
    data = {};
  }
  return { state: row.state, data };
};

const saveSession = async (
  params: BookingParams,
  state: string,
  data: SessionData
): Promise<void> => {
  const serialized = JSON.stringify(data);
  await prisma.whatsAppSession.upsert({
    where: { phone: params.phone },
    create: { phone: params.phone, clinicId: params.clinicId, patientId: params.patientId, state, data: serialized },
    update: { clinicId: params.clinicId, patientId: params.patientId, state, data: serialized }
  });
};

const resetSession = (params: BookingParams, state: string = S.IDLE): Promise<void> =>
  saveSession(params, state, {});

// --- Renderers ------------------------------------------------------------
const displayName = (name: string): string => (/^WhatsApp Patient/i.test(name) ? 'there' : name.split(' ')[0]);

const menuText = (params: BookingParams): string =>
  `👋 Welcome to ${params.clinicName}, ${displayName(params.patientName)}!\n\n` +
  `1. Book Appointment\n` +
  `2. My Appointments\n` +
  `3. Cancel Appointment\n` +
  `4. Reschedule Appointment\n\n` +
  `Reply with a number (1-4).`;

const numbered = (items: string[]): string => items.map((it, i) => `${i + 1}. ${it}`).join('\n');

// ===========================================================================
// Flow entry points
// ===========================================================================

const showMenu = async (params: BookingParams): Promise<string> => {
  await resetSession(params, S.MENU);
  if (!params.reason) why(params, 'rendering main menu (MENU)');
  return menuText(params);
};

// --- BOOK: speciality -----------------------------------------------------
const startBooking = async (params: BookingParams, presetSpeciality?: string | null): Promise<string> => {
  const specs = await distinctSpecialities(params.clinicId);
  if (specs.length === 0) {
    await resetSession(params);
    why(params, 'no doctors configured at clinic → reset to IDLE');
    return `Sorry, no doctors are set up yet. Please contact ${params.clinicName} directly.`;
  }

  // If the patient already named a real speciality (e.g. free text "cardiologist"),
  // honour that explicit choice and go straight to the doctor list. We do NOT
  // auto-pick a speciality just because the clinic happens to have only one — the
  // patient still selects from the list, so every step waits for input.
  const preset = presetSpeciality
    ? specs.find((s) => s.toLowerCase() === presetSpeciality.toLowerCase())
    : undefined;
  if (preset) return presentDoctors(params, preset);

  await saveSession(params, S.SPECIALITY, { mode: 'book', specialityOptions: specs });
  why(params, `book intent → present ${specs.length} specialities, await choice`);
  return `Which speciality would you like to see?\n\n${numbered(specs)}\n\nReply with a number.`;
};

const handleSpeciality = async (params: BookingParams, data: SessionData, t: string): Promise<string> => {
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
  return presentDoctors(params, speciality);
};

// --- BOOK: doctor ---------------------------------------------------------
const presentDoctors = async (params: BookingParams, speciality: string): Promise<string> => {
  const docs = await doctorsForSpeciality(params.clinicId, speciality);
  if (docs.length === 0) {
    const specs = await distinctSpecialities(params.clinicId);
    await saveSession(params, S.SPECIALITY, { mode: 'book', specialityOptions: specs });
    why(params, `no doctors for "${speciality}" → re-show speciality list`);
    return `No doctors found for ${speciality}. Choose a speciality:\n\n${numbered(specs)}\n\nReply with a number.`;
  }

  // ALWAYS present the doctor list and wait — never auto-select, even when the
  // speciality has only one doctor. The patient must explicitly choose.
  await saveSession(params, S.DOCTOR, { mode: 'book', speciality, doctorOptions: docs });
  why(params, `speciality "${speciality}" → present ${docs.length} doctor(s), await choice`);
  return (
    `${speciality} — please choose a doctor:\n\n` +
    `${numbered(docs.map((d) => formatDoctorName(d.name)))}\n\n` +
    `Reply with a number.`
  );
};

const handleDoctor = async (params: BookingParams, data: SessionData, t: string): Promise<string> => {
  const opts = data.doctorOptions ?? [];
  const n = parseChoice(t);
  if (!n || !opts[n - 1]) {
    why(params, `input "${t}" is not a valid doctor number → re-prompt DOCTOR (no advance)`);
    return `Please choose a doctor by number:\n\n${numbered(opts.map((d) => formatDoctorName(d.name)))}`;
  }
  return presentSlots(params, opts[n - 1], 0, data.mode ?? 'book');
};

// --- Shared: slots (used by both book and reschedule) ---------------------
const presentSlots = async (
  params: BookingParams,
  doctor: DoctorOption,
  offset: number,
  mode: 'book' | 'reschedule',
  rescheduleApptId?: string
): Promise<string> => {
  const all = await collectUpcomingSlots(params.clinicId, doctor.id, offset + SLOTS_PER_PAGE + 1);
  const page = all.slice(offset, offset + SLOTS_PER_PAGE);

  if (page.length === 0) {
    await resetSession(params);
    why(params, `no open slots for ${doctor.name} (offset ${offset}) → reset to IDLE`);
    return offset === 0
      ? `Sorry, ${doctor.name} has no open slots in the next ${SLOT_SCAN_DAYS} days. Reply MENU to start over.`
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
    rescheduleApptId
  });

  const hasMore = all.length > offset + SLOTS_PER_PAGE;
  const footer = hasMore
    ? `\n\nReply with a number to pick a time, or MORE for later dates.`
    : `\n\nReply with a number to pick a time.`;
  why(
    params,
    `${mode === 'reschedule' ? 'reschedule' : 'doctor'} "${doctor.name}" → present ${page.length} slots (offset ${offset}), await choice`
  );
  return `Available times with ${formatDoctorName(doctor.name)} (${doctor.speciality}):\n\n${numbered(page.map(slotLabel))}${footer}`;
};

const handleSlot = async (params: BookingParams, data: SessionData, t: string): Promise<string> => {
  const opts = data.slotOptions ?? [];
  const doctor: DoctorOption = {
    id: data.doctorId ?? '',
    name: data.doctorName ?? 'the doctor',
    speciality: data.doctorSpeciality ?? ''
  };

  if (isMore(t)) {
    return presentSlots(params, doctor, (data.slotOffset ?? 0) + SLOTS_PER_PAGE, data.mode ?? 'book', data.rescheduleApptId);
  }

  const n = parseChoice(t);
  if (!n || !opts[n - 1]) {
    why(params, `input "${t}" is not a valid slot number → re-prompt SLOT (no advance)`);
    return `Please reply with a number to choose a time${opts.length ? '' : ''}:\n\n${numbered(opts.map(slotLabel))}`;
  }

  const selected = opts[n - 1];
  await saveSession(params, S.CONFIRM, { ...data, selected });
  why(params, `slot #${n} (${slotLabel(selected)}) chosen → ask CONFIRMATION, await YES/NO`);
  return (
    `Please confirm your appointment:\n\n` +
    `👨‍⚕️ ${formatDoctorName(doctor.name)} (${doctor.speciality})\n` +
    `📅 ${slotLabel(selected)}\n\n` +
    `Reply YES to confirm or NO to cancel.`
  );
};

// --- Shared: confirmation -------------------------------------------------
const handleConfirm = async (params: BookingParams, data: SessionData, t: string): Promise<string> => {
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
      why(params, 'patient replied YES → appointment RESCHEDULED, terminal state BOOKED');
      return (
        `✅ Your appointment has been moved to:\n\n` +
        `👨‍⚕️ ${formatDoctorName(updated.doctor?.name ?? data.doctorName)}\n` +
        `📅 ${slotLabel(selected)}\n\n` +
        `Reply MENU for more options.`
      );
    }

    // Duplicate-booking guard: refuse to stack a second active appointment that
    // duplicates the same doctor that day or clashes with the same date+time.
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
      why(
        params,
        `duplicate guard: patient already has active appt ${conflict.id} (${sameDoctor ? 'same doctor' : 'same time'}) → not booked, MENU`
      );
      return (
        `⚠️ You already have an appointment with ${formatDoctorName(conflict.doctor?.name)} ` +
        `on ${slotLabel({ date: selected.date, time: conflict.appointmentTime })} [${conflict.status}].\n\n` +
        `I didn't book a duplicate. Reply 2 to view your appointments, or 4 to reschedule.`
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
      // The state machine sends its own single confirmation — suppress the
      // duplicate auto-message from the booking side-effect.
      { notify: false }
    );
    await resetSession(params, S.BOOKED);
    why(params, 'patient replied YES → appointment CREATED (PENDING), terminal state BOOKED');
    return (
      `✅ Appointment request received!\n\n` +
      `👨‍⚕️ ${formatDoctorName(data.doctorName)} (${data.doctorSpeciality})\n` +
      `📅 ${slotLabel(selected)}\n\n` +
      `Status: PENDING — ${params.clinicName} will confirm shortly and you'll get a confirmation message. ` +
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
    const reshow = await presentSlots(params, doctor, 0, data.mode ?? 'book', data.rescheduleApptId);
    why(params, `booking failed on confirm (${msg}) → re-show fresh slots, back to SLOT`);
    return `⚠️ ${msg}\n\n${reshow}`;
  }
};

// --- CHECK ----------------------------------------------------------------
const doCheck = async (params: BookingParams): Promise<string> => {
  const appts = await activeAppointments(params.clinicId, params.patientId);
  await resetSession(params, S.MENU);
  why(params, `menu option 2 → listed ${appts.length} appointment(s), back to MENU`);
  if (appts.length === 0) {
    return `You have no upcoming appointments. Reply 1 to book one.`;
  }
  const lines = appts.map(
    (a) =>
      `${formatDoctorName(a.doctor?.name)} (${a.doctor?.speciality ?? ''}) — ` +
      `${dateLabel(a.appointmentDate.toISOString().slice(0, 10))} at ${a.appointmentTime} [${a.status}]`
  );
  return `Your upcoming appointments:\n\n${numbered(lines)}\n\nReply MENU for options.`;
};

// --- CANCEL ---------------------------------------------------------------
const startCancel = async (params: BookingParams): Promise<string> => {
  const appts = await activeAppointments(params.clinicId, params.patientId);
  if (appts.length === 0) {
    await resetSession(params, S.MENU);
    why(params, 'menu option 3 but no appointments to cancel → MENU');
    return `You have no upcoming appointments to cancel. Reply MENU for options.`;
  }
  const apptOptions: ApptOption[] = appts.map((a) => ({
    id: a.id,
    doctorId: a.doctorId,
    doctorName: a.doctor?.name ?? 'Doctor',
    doctorSpeciality: a.doctor?.speciality ?? '',
    label: `${formatDoctorName(a.doctor?.name)} — ${dateLabel(a.appointmentDate.toISOString().slice(0, 10))} at ${a.appointmentTime}`
  }));
  await saveSession(params, S.CANCEL_SELECT, { apptOptions });
  why(params, `menu option 3 → present ${apptOptions.length} appt(s) to cancel, await choice`);
  return `Which appointment would you like to cancel?\n\n${numbered(apptOptions.map((a) => a.label))}\n\nReply with a number, or NO to keep them.`;
};

const handleCancelSelect = async (params: BookingParams, data: SessionData, t: string): Promise<string> => {
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
  return `Cancel this appointment?\n\n${chosen.label}\n\nReply YES to cancel, NO to keep it.`;
};

const handleCancelConfirm = async (params: BookingParams, data: SessionData, t: string): Promise<string> => {
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
  why(params, 'patient replied YES → appointment CANCELLED, terminal state BOOKED');
  return `Your appointment has been cancelled. Reply 1 to book a new one, or MENU for options.`;
};

// --- RESCHEDULE -----------------------------------------------------------
const startReschedule = async (params: BookingParams): Promise<string> => {
  const appts = await activeAppointments(params.clinicId, params.patientId);
  if (appts.length === 0) {
    await resetSession(params, S.MENU);
    why(params, 'menu option 4 but no appointments to reschedule → MENU');
    return `You have no upcoming appointments to reschedule. Reply 1 to book one.`;
  }
  const apptOptions: ApptOption[] = appts.map((a) => ({
    id: a.id,
    doctorId: a.doctorId,
    doctorName: a.doctor?.name ?? 'Doctor',
    doctorSpeciality: a.doctor?.speciality ?? '',
    label: `${formatDoctorName(a.doctor?.name)} — ${dateLabel(a.appointmentDate.toISOString().slice(0, 10))} at ${a.appointmentTime}`
  }));
  await saveSession(params, S.RESCHED_SELECT, { mode: 'reschedule', apptOptions });
  why(params, `menu option 4 → present ${apptOptions.length} appt(s) to reschedule, await choice`);
  return `Which appointment would you like to reschedule?\n\n${numbered(apptOptions.map((a) => a.label))}\n\nReply with a number, or NO to cancel.`;
};

const handleRescheduleSelect = async (params: BookingParams, data: SessionData, t: string): Promise<string> => {
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
  // Reuse the slot-selection flow for the SAME doctor.
  return presentSlots(
    params,
    { id: chosen.doctorId, name: chosen.doctorName, speciality: chosen.doctorSpeciality },
    0,
    'reschedule',
    chosen.id
  );
};

// ===========================================================================
// Public entry point — called once per inbound text by the webhook controller.
// Always returns a single reply string; every branch sets the next state.
// ===========================================================================
export const handleWhatsAppMessage = async (params: BookingParams): Promise<string> => {
  const t = params.message.trim();
  const { state, data } = await loadSession(params.phone);

  // [FSM] One inbound message = one turn. We log the state we ENTERED this turn
  // with and the patient text that drives it, run exactly ONE handler (which
  // persists the single next state and returns the single prompt to send), then
  // log the state we LEFT in. There is no loop here: the function returns after
  // one handler, so the bot sends one prompt and waits for the next webhook.
  console.info('[FSM] ▶ turn start', {
    phone: params.phone,
    currentState: state,
    patientMessage: t
  });

  let reply: string;
  try {
    // Universal escape hatch: greetings / "menu" always reset to the main menu.
    if (isReset(t)) {
      why(params, `input "${t}" matched reset/greeting → MENU`);
      reply = await showMenu(params);
    } else {
      switch (state) {
        case S.SPECIALITY:
          reply = await handleSpeciality(params, data, t);
          break;
        case S.DOCTOR:
          reply = await handleDoctor(params, data, t);
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

        // IDLE / MENU / BOOKED — interpret as a fresh top-level choice.
        default:
          reply = await handleTopLevel(params, t);
          break;
      }
    }
  } catch (err) {
    console.error('[WhatsApp][booking] handler error:', err);
    // Never strand the patient: reset to a known-good state and show the menu.
    why(params, 'handler threw → safe reset to MENU');
    reply = await showMenu(params);
  }

  // Re-read the persisted state so the log reflects what was ACTUALLY saved
  // (authoritative — handlers own their own saveSession calls).
  const { state: nextState } = await loadSession(params.phone);
  console.info('[FSM] ◀ transition', {
    phone: params.phone,
    currentState: state,
    patientMessage: t,
    nextState,
    reason: params.reason ?? '(no transition — re-prompted same state)',
    waiting: nextState !== S.BOOKED
  });

  return reply;
};

// Top-level routing: numbered menu choice first (deterministic), then AI intent.
const handleTopLevel = async (params: BookingParams, t: string): Promise<string> => {
  const n = parseChoice(t);
  if (n === 1) return startBooking(params);
  if (n === 2) return doCheck(params);
  if (n === 3) return startCancel(params);
  if (n === 4) return startReschedule(params);

  // Free text → AI maps to intent (+ speciality). AI does control flow nowhere
  // else; here it only decides which deterministic branch to enter.
  const specs = await distinctSpecialities(params.clinicId);
  const { intent, speciality } = classifyIntent(t, specs);
  console.info('[FSM] free-text classified (deterministic)', { patientMessage: t, intent, speciality: speciality ?? null });

  switch (intent) {
    case 'book':
      return startBooking(params, speciality);
    case 'cancel':
      return startCancel(params);
    case 'reschedule':
      return startReschedule(params);
    case 'check':
      return doCheck(params);
    default:
      why(params, `input "${t}" did not map to a known intent → MENU`);
      return showMenu(params);
  }
};
