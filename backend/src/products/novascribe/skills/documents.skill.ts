// Patient-facing WhatsApp skill: a patient asks for their report / document /
// consultation summary and we send back the doctor's clinical summary from their
// latest MediScribe consultation report (findings + advice). Sibling of the
// prescription skill (which returns the medicines). Read-only, linked by phone.

import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';
import type { Skill } from '../../../core/mcp/skill.types.js';
import { latestScribeConsultation } from './mediscribeData.js';

const phoneOf = (ctx: McpContext): string | undefined =>
  (typeof ctx.meta?.phone === 'string' ? (ctx.meta.phone as string) : undefined) ?? ctx.actor.externalId ?? undefined;

const documentsSkill: Skill = {
  name: 'novascribe.documents',
  product: 'novascribe',
  intents: ['document'],
  handle: async (ctx: McpContext) => {
    if (!ctx.actor.patientId) return { reply: null, done: true };

    const consult = await latestScribeConsultation(ctx.clinicId, phoneOf(ctx));
    if (!consult) {
      return {
        reply:
          'Aapke naam pe abhi koi finalized report/document nahi hai. 🙏 ' +
          'Doctor ke visit ke baad wo yahan available ho jayega.',
        done: true
      };
    }

    const doctor = consult.doctorName ? `Dr. ${consult.doctorName.replace(/^dr\.?\s*/i, '')}` : 'your doctor';
    const overview = consult.report.clinicalOverview?.trim();
    const assessment = (Array.isArray(consult.report.assessment) ? consult.report.assessment : []).filter(Boolean);
    const advice = (Array.isArray(consult.report.advice) ? consult.report.advice : []).filter(Boolean);

    const lines: string[] = [`📄 *Your consultation summary* — ${doctor}`];
    if (overview) lines.push('', overview);
    if (assessment.length) lines.push('', '*Findings:*', assessment.map((a, i) => `${i + 1}. ${a}`).join('\n'));
    if (advice.length) lines.push('', `*Advice:* ${advice.join('; ')}`);
    if (!overview && !assessment.length && !advice.length) {
      lines.push('', 'Is visit ka detailed note abhi record nahi hua. Prescription ke liye "meri parchi" bhejein.');
    }
    lines.push(
      '',
      'ℹ️ Ye doctor ke note ka summary hai — kisi bhi sawaal ke liye clinic se poochein. Medical advice ka replacement nahi hai.'
    );

    return { reply: lines.join('\n'), done: true };
  }
};

export const registerNovaScribeDocumentsSkill = (): void => {
  // Idempotent; guard on the registry so a test that clear()s it can re-register.
  if (skillRegistry.has('novascribe.documents')) return;
  skillRegistry.register(documentsSkill);
};
