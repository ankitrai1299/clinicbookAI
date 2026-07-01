// DB-backed, channel-agnostic conversation session for the brain. Persistent (not
// in-memory) because a healthcare assistant must be restart-safe, auditable, and
// horizontally scalable — an in-flight booking can't vanish on a redeploy. Keyed
// on (clinicId, patientId, channel): the SAME patient identity continues one
// thread across WhatsApp today and Voice/Web/Mobile later.

import { forClinic } from '../../config/tenantPrisma.js';
import type { ConversationState } from './skill.types.js';

export const getConversationState = async (
  clinicId: string,
  patientId: string,
  channel: string
): Promise<ConversationState> => {
  const db = forClinic(clinicId);
  const row = await db.conversationSession.findUnique({
    where: { clinicId_patientId_channel: { clinicId, patientId, channel } }
  });
  if (!row) return { activeSkill: null, data: {} };

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(row.data || '{}') as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { activeSkill: row.activeSkill ?? null, data };
};

export const saveConversationState = async (
  clinicId: string,
  patientId: string,
  channel: string,
  state: ConversationState
): Promise<void> => {
  const db = forClinic(clinicId);
  const data = JSON.stringify(state.data ?? {});
  await db.conversationSession.upsert({
    where: { clinicId_patientId_channel: { clinicId, patientId, channel } },
    create: { clinicId, patientId, channel, activeSkill: state.activeSkill, data },
    update: { activeSkill: state.activeSkill, data }
  });
};

/** Clear the active skill + state (conversation settled). Row is kept for audit. */
export const clearConversationState = async (
  clinicId: string,
  patientId: string,
  channel: string
): Promise<void> => {
  await saveConversationState(clinicId, patientId, channel, { activeSkill: null, data: {} });
};
