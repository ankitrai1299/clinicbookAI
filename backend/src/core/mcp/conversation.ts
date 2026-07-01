// The conversation orchestrator — the brain's multi-turn dispatcher. This is the
// single entry point every messaging channel (WhatsApp now; Voice/Web/Mobile
// later) calls for a patient turn:
//
//   1. Load the channel-agnostic session for (clinic, patient, channel).
//   2. If a skill is mid-flow → RESUME it (a mid-booking message is never stolen
//      by another skill's intent).
//   3. Otherwise UNDERSTAND (classify) and route to the skill claiming that
//      intent, or the fallback skill. Classification is SKIPPED entirely when
//      only the fallback exists, so slice 1 behaves byte-for-byte like the FSM
//      path and spends zero extra AI calls.
//   4. Run one turn; persist (clear on done, else keep the skill active).
//
// Never throws — a patient must always get a reply.

import { classify } from './mcp.router.js';
import { skillRegistry } from './skillRegistry.js';
import {
  clearConversationState,
  getConversationState,
  saveConversationState
} from './session.service.js';
import type { McpContext } from './mcp.types.js';
import type { Skill } from './skill.types.js';

export interface ConversationResult {
  reply: unknown; // channel-agnostic; the channel adapter renders it. null = silent.
  skill: string | null;
  intent?: string;
  done: boolean;
}

export const runConversation = async (ctx: McpContext, message: string): Promise<ConversationResult> => {
  const patientId = ctx.actor.patientId;
  if (!patientId) {
    // No resolved patient identity → nothing to converse against.
    return { reply: null, skill: null, done: true };
  }
  const { channel, clinicId } = ctx;
  const session = await getConversationState(clinicId, patientId, channel);

  // 1) Resume an in-flight skill without re-classifying.
  let skill: Skill | undefined = session.activeSkill
    ? skillRegistry.get(session.activeSkill)
    : undefined;
  let intent: string | undefined;

  // 2) No active skill → understand + route. Skip the AI call when only the
  //    fallback skill exists (nothing to disambiguate).
  if (!skill) {
    if (skillRegistry.hasRoutableIntents()) {
      intent = (await classify(ctx, message)).intent;
      skill = skillRegistry.resolve(intent);
    } else {
      skill = skillRegistry.fallbackSkill();
    }
  }

  if (!skill) {
    return { reply: null, skill: null, intent, done: true };
  }

  let result;
  try {
    result = await skill.handle(ctx, message, session);
  } catch (err) {
    console.error(`[mcp] skill "${skill.name}" failed:`, err);
    // Settle the session so a poisoned state can't trap the patient in a loop.
    await clearConversationState(clinicId, patientId, channel).catch(() => undefined);
    return { reply: null, skill: skill.name, intent, done: true };
  }

  // 3) Persist: clear on done, else keep this skill active for the next turn.
  try {
    if (result.done) {
      await clearConversationState(clinicId, patientId, channel);
    } else {
      await saveConversationState(clinicId, patientId, channel, {
        activeSkill: skill.name,
        data: result.state ?? session.data
      });
    }
  } catch (err) {
    console.error('[mcp] failed to persist conversation state:', err);
  }

  return { reply: result.reply, skill: skill.name, intent, done: result.done };
};
