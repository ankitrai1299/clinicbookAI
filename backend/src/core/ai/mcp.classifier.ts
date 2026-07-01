// Adapter that plugs core/ai's natural-language UNDERSTANDING into the MCP brain.
// The brain (core/mcp) stays free of any AI dependency; at startup we inject this
// classifier via setIntentClassifier. HYBRID model: this only UNDERSTANDS (intent
// + entities) — it never acts.
//
// It reuses the existing, tested understanding: understandPatientMessage (AI) with
// a deterministic keyword fallback (classifyIntent) so it works with no OpenAI key
// and never throws. Slots (speciality/doctor/date phrase) are passed through for a
// skill to resolve deterministically.

import { forClinic } from '../../config/tenantPrisma.js';
import { classifyIntent } from '../whatsapp/whatsapp.intent.js';
import type { IntentClassification, IntentClassifier, McpContext } from '../mcp/index.js';
import { understandPatientMessage } from './ai.service.js';

const clinicVocabulary = async (clinicId: string): Promise<{ specialities: string[]; doctorNames: string[] }> => {
  const db = forClinic(clinicId);
  const doctors = await db.doctor.findMany({ where: { clinicId }, select: { name: true, speciality: true } });
  const specialities = [...new Set(doctors.map((d) => d.speciality).filter(Boolean))];
  const doctorNames = doctors.map((d) => d.name).filter(Boolean);
  return { specialities, doctorNames };
};

export const mcpIntentClassifier: IntentClassifier = async (
  ctx: McpContext,
  text: string
): Promise<IntentClassification> => {
  const { specialities, doctorNames } = await clinicVocabulary(ctx.clinicId);

  // Preferred: AI understanding (intent + speciality/doctor/date + confidence).
  const ai = await understandPatientMessage(text, specialities, doctorNames);
  if (ai) {
    return {
      intent: ai.intent,
      confidence: ai.confidence,
      slots: { speciality: ai.speciality, doctorName: ai.doctorName, dateText: ai.dateText }
    };
  }

  // Fallback: deterministic keyword classifier (no OpenAI key or AI errored).
  const kw = classifyIntent(text, specialities);
  return { intent: kw.intent, slots: { speciality: kw.speciality } };
};
