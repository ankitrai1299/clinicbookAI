// NovaScribe patient-facing skill for the Healthcare MCP brain: a patient asks
// (on WhatsApp/Voice/…) for their prescription / doctor's notes, and we send back
// the doctor's FINALIZED record. Read-only, patient-scoped, single-shot — no
// business logic beyond formatting the record NovaScribe already produced.
//
// Delivered as a REPLY to a patient's own request, so it is inside the WhatsApp
// 24h window (no template needed). Scoped strictly to ctx.actor.patientId — a
// patient can only ever see their OWN record.

import { ConsultationNoteStatus } from '@prisma/client';

import { forClinic } from '../../../config/tenantPrisma.js';
import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';
import type { Skill } from '../../../core/mcp/skill.types.js';

interface PrescriptionItem {
  drug?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  notes?: string;
}

const formatItems = (items: PrescriptionItem[]): string =>
  items
    .map((it, i) => {
      const parts = [it.dose, it.frequency, it.duration].filter(Boolean).join(', ');
      const notes = it.notes ? ` (${it.notes})` : '';
      return `${i + 1}. ${it.drug ?? 'Medicine'}${parts ? ` — ${parts}` : ''}${notes}`;
    })
    .join('\n');

const prescriptionSkill: Skill = {
  name: 'novascribe.prescription',
  product: 'novascribe',
  intents: ['prescription'],
  handle: async (ctx: McpContext) => {
    const patientId = ctx.actor.patientId;
    if (!patientId) return { reply: null, done: true };

    const db = forClinic(ctx.clinicId);
    // Latest FINALIZED (doctor-approved & locked) note for THIS patient only.
    const note = await db.consultationNote.findFirst({
      where: { clinicId: ctx.clinicId, patientId, status: ConsultationNoteStatus.FINALIZED },
      orderBy: { createdAt: 'desc' }
    });

    if (!note) {
      return {
        reply:
          'Aapke naam pe abhi koi finalized prescription record nahi hai. 🙏 ' +
          'Doctor ke visit ke baad wo yahan available ho jayegi.',
        done: true
      };
    }

    const items = Array.isArray(note.prescription) ? (note.prescription as PrescriptionItem[]) : [];
    const doctor = note.doctorName ? `Dr. ${note.doctorName.replace(/^dr\.?\s*/i, '')}` : 'your doctor';

    const lines: string[] = [`📋 *Your prescription* — ${doctor}`];
    if (items.length) {
      lines.push('', '*Medicines:*', formatItems(items));
    }
    if (note.plan && note.plan.trim()) {
      lines.push('', `*Advice:* ${note.plan.trim()}`);
    }
    if (items.length === 0 && !(note.plan && note.plan.trim())) {
      lines.push('', 'Is visit ke liye koi dawai record nahi hui.');
    }
    lines.push('', 'ℹ️ Kisi bhi dawai ko lekar sawaal ho to clinic se poochein. Ye medical advice ka replacement nahi hai.');

    return { reply: lines.join('\n'), done: true };
  }
};

export const registerNovaScribeSkills = (): void => {
  // Idempotent; guard on the registry so a test that clear()s it can re-register.
  if (skillRegistry.has('novascribe.prescription')) return;
  skillRegistry.register(prescriptionSkill);
};
