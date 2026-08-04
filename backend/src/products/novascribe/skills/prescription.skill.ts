// Patient-facing WhatsApp skill: a patient asks for their prescription and we
// send back the MEDICINES from their latest MediScribe consultation report.
// Read-only, single-shot, linked to the patient by their WhatsApp phone.
//
// The answer itself lives in services/patientPrescription.service.ts, shared
// with the deterministic booking FSM — the brain and the FSM must give the same
// patient the same prescription, so there is only one implementation of it.

import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';
import type { Skill } from '../../../core/mcp/skill.types.js';
import { deliverPrescriptionToPatient } from '../../../services/patientPrescription.service.js';

const phoneOf = (ctx: McpContext): string | undefined =>
  (typeof ctx.meta?.phone === 'string' ? (ctx.meta.phone as string) : undefined) ?? ctx.actor.externalId ?? undefined;

const prescriptionSkill: Skill = {
  name: 'novascribe.prescription',
  product: 'novascribe',
  intents: ['prescription'],
  handle: async (ctx: McpContext) => {
    if (!ctx.actor.patientId) return { reply: null, done: true };

    const phone = phoneOf(ctx);
    if (!phone) return { reply: null, done: true };

    return { reply: await deliverPrescriptionToPatient({ clinicId: ctx.clinicId, phone }), done: true };
  }
};

export const registerNovaScribeSkills = (): void => {
  // Idempotent; guard on the registry so a test that clear()s it can re-register.
  if (skillRegistry.has('novascribe.prescription')) return;
  skillRegistry.register(prescriptionSkill);
};
