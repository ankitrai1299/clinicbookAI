// ===========================================================================
// Skill — a MULTI-TURN capability (vs the single-shot Capability in
// mcp.types.ts). Real patient conversations span turns:
//
//   "appointment chahiye" → "kis cheez ke liye?" → "heart" → "kal" → slots →
//   "10 baje" → "confirm? YES" → booked ✅
//
// A Skill owns one such flow. The brain (conversation.ts) holds a
// channel-agnostic session, dispatches each turn to the ACTIVE skill until it
// signals `done`, then returns to intent-routing for the next request.
//
// HYBRID control model: the brain uses AI only to UNDERSTAND (pick the skill);
// the skill itself performs DETERMINISTIC actions (real slots, real booking) so
// the AI can never fabricate a booking. `reply` is intentionally opaque
// (`unknown`) here — the brain stays channel-agnostic and the channel adapter
// renders it (a WhatsApp adapter treats it as a BotReply, a Voice adapter as
// speech, etc.).
// ===========================================================================

import type { McpContext, McpProduct } from './mcp.types.js';

// Brain-managed conversation state for one (clinic, patient, channel) thread.
export interface ConversationState {
  activeSkill: string | null;
  data: Record<string, unknown>;
}

export interface SkillTurnResult {
  // Channel-agnostic reply payload. `null` means "stay silent" (send nothing).
  reply: unknown;
  // true → this skill's conversation is complete; the brain clears activeSkill so
  // the next message is re-routed by intent. false → the brain keeps this skill
  // active and resumes it on the next turn (a mid-flow message is never stolen by
  // another skill).
  done: boolean;
  // Optional brain-managed state to persist for the next turn. Skills backed by
  // their own store (e.g. the FSM-wrapping booking skill) can omit this.
  state?: Record<string, unknown>;
}

export interface Skill {
  // Stable id, e.g. "clinicbook.booking".
  name: string;
  product: McpProduct;
  // Coarse intents this skill claims. The brain routes a classified intent to the
  // skill declaring it. Omit for the fallback skill (it catches everything not
  // claimed by a more specific skill).
  intents?: string[];
  // The catch-all when no skill's intent matches (at most one). Slice-1 booking
  // is the fallback so, until other products' skills register intents, every
  // patient message lands on it — byte-for-byte the existing behaviour.
  isFallback?: boolean;
  // Handle ONE turn. `session` is the brain-managed state; per-turn channel extras
  // (phone, tapped replyId, fromVoice, patientName, …) arrive via `ctx.meta`.
  handle: (ctx: McpContext, message: string, session: ConversationState) => Promise<SkillTurnResult>;
}
