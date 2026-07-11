// Patient-facing WhatsApp skill: a patient asks for their prescription and we
// send back the MEDICINES from their latest MediScribe consultation report.
// Read-only, single-shot, linked to the patient by their WhatsApp phone (see
// mediscribeData.ts). Delivered as a reply to the patient's own request (inside
// the WhatsApp 24h window, no template needed).

import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';
import type { Skill } from '../../../core/mcp/skill.types.js';
import { latestScribeConsultation, type MedRow } from './mediscribeData.js';

const formatMeds = (items: MedRow[]): string =>
  items
    .map((it, i) => {
      const parts = [it.dose || it.dosage, it.strength, it.frequency, it.duration].filter(Boolean).join(', ');
      const notes = it.instructions ? ` (${it.instructions})` : '';
      return `${i + 1}. ${it.medicine ?? 'Medicine'}${parts ? ` — ${parts}` : ''}${notes}`;
    })
    .join('\n');

const phoneOf = (ctx: McpContext): string | undefined =>
  (typeof ctx.meta?.phone === 'string' ? (ctx.meta.phone as string) : undefined) ?? ctx.actor.externalId ?? undefined;

const prescriptionSkill: Skill = {
  name: 'novascribe.prescription',
  product: 'novascribe',
  intents: ['prescription'],
  handle: async (ctx: McpContext) => {
    if (!ctx.actor.patientId) return { reply: null, done: true };

    const consult = await latestScribeConsultation(ctx.clinicId, phoneOf(ctx));
    if (!consult) {
      return {
        reply:
          'Aapke naam pe abhi koi prescription record nahi hai. 🙏 ' +
          'Doctor ke visit ke baad wo yahan available ho jayegi.',
        done: true
      };
    }

    const meds = Array.isArray(consult.report.prescribedMedications) ? consult.report.prescribedMedications : [];
    const advice = Array.isArray(consult.report.advice) ? consult.report.advice.filter(Boolean) : [];
    const doctor = consult.doctorName ? `Dr. ${consult.doctorName.replace(/^dr\.?\s*/i, '')}` : 'your doctor';

    const lines: string[] = [`📋 *Your prescription* — ${doctor}`];
    if (meds.length) lines.push('', '*Medicines:*', formatMeds(meds));
    if (advice.length) lines.push('', `*Advice:* ${advice.join('; ')}`);
    if (meds.length === 0 && advice.length === 0) lines.push('', 'Is visit ke liye koi dawai record nahi hui.');
    lines.push('', 'ℹ️ Kisi bhi dawai ko lekar sawaal ho to clinic se poochein. Ye medical advice ka replacement nahi hai.');

    return { reply: lines.join('\n'), done: true };
  }
};

export const registerNovaScribeSkills = (): void => {
  // Idempotent; guard on the registry so a test that clear()s it can re-register.
  if (skillRegistry.has('novascribe.prescription')) return;
  skillRegistry.register(prescriptionSkill);
};
