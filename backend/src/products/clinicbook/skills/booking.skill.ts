// ClinicBook's patient-conversation skill for the Healthcare MCP brain.
//
// Strangler-fig: this does NOT re-implement booking. It WRAPS the existing,
// production-tested deterministic FSM (handleWhatsAppMessage) so behaviour is
// identical by construction — the brain simply becomes the entry point. The FSM
// keeps owning its own detailed state (WhatsAppSession); the brain only needs to
// know whether the flow is still mid-turn (so it resumes here) or settled (so the
// next message is re-routed by intent — this is where a future reminder/scribe
// skill peels off its intents).
//
// Registered as the FALLBACK skill: until PatientLoop/NovaScribe skills claim
// their intents, every patient message lands here — byte-for-byte the current
// live behaviour.

import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';
import type { Skill } from '../../../core/mcp/skill.types.js';
import { handleWhatsAppMessage, isBookingFlowActive } from '../../../core/whatsapp/whatsapp.booking.js';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const bookingSkill: Skill = {
  name: 'clinicbook.booking',
  product: 'clinicbook',
  isFallback: true,
  handle: async (ctx: McpContext, message) => {
    const meta = ctx.meta ?? {};
    const phone = str(meta.phone) ?? ctx.actor.externalId ?? '';

    const reply = await handleWhatsAppMessage({
      clinicId: ctx.clinicId,
      patientId: ctx.actor.patientId ?? '',
      patientName: str(meta.patientName) ?? ctx.actor.displayName ?? 'there',
      clinicName: str(meta.clinicName) ?? 'our clinic',
      phone,
      patientCode: str(meta.patientCode) ?? null,
      message,
      replyId: str(meta.replyId),
      fromVoice: meta.fromVoice === true
    });

    // The FSM owns its own state. It's "done" (from the brain's view) when it has
    // returned to IDLE; while mid-flow the brain keeps this skill active so the
    // next turn resumes here.
    const done = !(await isBookingFlowActive(ctx.clinicId, phone));
    return { reply, done };
  }
};

export const registerClinicBookSkills = (): void => {
  // Idempotent; guard on the registry so a test that clear()s it can re-register.
  if (skillRegistry.has('clinicbook.booking')) return;
  skillRegistry.register(bookingSkill);
};
