// Patient-facing WhatsApp skill: a patient asks for their full record / history /
// "poori jankari" and we send back a concise 360 summary — upcoming appointments +
// current medicines + last visit — keyed by their patient id. Read-only. Reuses
// the shared patient360 aggregation (bookings + scribe notes + reminders).

import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';
import type { Skill } from '../../../core/mcp/skill.types.js';
import { getPatientRecord, formatRecordForWhatsApp } from '../../../services/patient360.service.js';

const recordSkill: Skill = {
  name: 'clinicbook.record',
  product: 'clinicbook',
  intents: ['record'],
  handle: async (ctx: McpContext) => {
    const patientId = ctx.actor.patientId;
    if (!patientId) return { reply: null, done: true };

    const record = await getPatientRecord(ctx.clinicId, patientId);
    if (!record) {
      return { reply: 'Aapke naam pe abhi koi record nahi mila. 🙏 Registration ke baad yahan dikhega.', done: true };
    }
    return { reply: formatRecordForWhatsApp(record), done: true };
  }
};

export const registerClinicBookRecordSkill = (): void => {
  // Idempotent; guard so a test that clear()s the registry can re-register.
  if (skillRegistry.has('clinicbook.record')) return;
  skillRegistry.register(recordSkill);
};
