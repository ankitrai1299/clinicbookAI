// ClinicBook patient-facing "status" skill for the Healthcare MCP brain: a
// patient asks (WhatsApp/Voice/…) "meri appointment kab hai?" and we reply with
// their UPCOMING appointment(s). Read-only, single-shot, strictly scoped to
// ctx.actor.patientId — a patient can only ever see their OWN appointments.
//
// No business logic is duplicated here: it wraps the existing tested
// getAppointments read and reuses slotMath to decide what is still upcoming, the
// same source of truth booking uses for "future slot".

import { AppointmentStatus } from '@prisma/client';

import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';
import type { Skill } from '../../../core/mcp/skill.types.js';
import { getAppointments } from '../appointments/appointment.service.js';
import { clinicNow, labelToMinutes, slotIsFuture } from '../../../services/slotMath.js';

// Statuses a patient still cares about seeing under "upcoming" (a booked visit
// that hasn't happened yet). Cancelled/completed/no-show are settled → hidden.
const LIVE = new Set<AppointmentStatus>([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]);

// The stored appointmentDate is a UTC-midnight calendar day → its ISO date part
// is the clinic-local calendar day, exactly the YYYY-MM-DD slotMath compares on.
const dateStrOf = (d: Date): string => d.toISOString().slice(0, 10);

// "12 Jul" for the calendar day (rendered in UTC so the UTC-midnight date never
// slips to the previous day).
const prettyDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);

const statusSkill: Skill = {
  name: 'clinicbook.status',
  product: 'clinicbook',
  intents: ['status'],
  handle: async (ctx: McpContext) => {
    const patientId = ctx.actor.patientId;
    if (!patientId) return { reply: null, done: true };

    const now = clinicNow();
    const upcoming = (await getAppointments(ctx.clinicId))
      .filter((a) => a.patientId === patientId)
      .filter((a) => LIVE.has(a.status))
      .filter((a) => slotIsFuture(labelToMinutes(a.appointmentTime) ?? 0, dateStrOf(a.appointmentDate), now))
      .sort(
        (a, b) =>
          dateStrOf(a.appointmentDate).localeCompare(dateStrOf(b.appointmentDate)) ||
          (labelToMinutes(a.appointmentTime) ?? 0) - (labelToMinutes(b.appointmentTime) ?? 0)
      );

    if (upcoming.length === 0) {
      return {
        reply:
          'Aapki koi upcoming appointment abhi book nahi hai. 🙏 ' +
          'Nayi appointment ke liye bas "appointment chahiye" bhej dijiye.',
        done: true
      };
    }

    const lines: string[] = ['📅 *Aapki upcoming appointment' + (upcoming.length > 1 ? 'ein' : '') + ':*', ''];
    for (const a of upcoming) {
      const doctor = a.doctor?.name ? `Dr. ${a.doctor.name.replace(/^dr\.?\s*/i, '')}` : 'your doctor';
      const pending = a.status === AppointmentStatus.PENDING ? ' _(confirmation pending)_' : '';
      lines.push(`• ${prettyDate(a.appointmentDate)}, ${a.appointmentTime} — ${doctor}${pending}`);
    }
    lines.push('', 'Badalna ya cancel karna ho to clinic ko bata dijiye. 🙏');

    return { reply: lines.join('\n'), done: true };
  }
};

export const registerClinicBookStatusSkill = (): void => {
  // Idempotent; guard on the registry so a test that clear()s it can re-register.
  if (skillRegistry.has('clinicbook.status')) return;
  skillRegistry.register(statusSkill);
};
