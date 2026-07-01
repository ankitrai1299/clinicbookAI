// The router — the ONLY place that turns "what the user wants" into "which
// capability runs". It does NOT execute anything (that is mcp.service.invoke);
// it decides. Two responsibilities:
//
//  1. Natural-language understanding is PLUGGABLE. The brain lives in `core` and
//     must not hard-depend on the AI service, so an intent classifier is
//     injected at startup (Phase 3 wires one backed by core/ai). Until then,
//     `route()` degrades gracefully to the 'unknown' intent.
//  2. Intent → capability resolution is DATA-DRIVEN. Products declare which
//     intents they satisfy on their capabilities; the registry indexes them.
//     The router never hardcodes "book → ClinicBook".

import { capabilityRegistry } from './capabilityRegistry.js';
import type { IntentClassification, IntentClassifier, McpContext } from './mcp.types.js';

let classifier: IntentClassifier | null = null;

/** Inject the NL intent classifier (called once at startup). */
export const setIntentClassifier = (fn: IntentClassifier | null): void => {
  classifier = fn;
};

export const hasIntentClassifier = (): boolean => classifier !== null;

/**
 * Run the injected NL classifier (intent + slots). Never throws — an unconfigured
 * or failing classifier degrades to `{ intent: 'unknown' }` so callers can route
 * to a fallback. Used by both capability routing (route) and the multi-turn
 * conversation orchestrator.
 */
export const classify = async (ctx: McpContext, text: string): Promise<IntentClassification> => {
  if (!classifier) return { intent: 'unknown' };
  try {
    return await classifier(ctx, text);
  } catch (err) {
    console.error('[mcp] intent classifier failed — treating as unknown:', err);
    return { intent: 'unknown' };
  }
};

export interface RouteDecision {
  intent: string;
  confidence?: number;
  slots?: Record<string, unknown>;
  // The capability that fulfils this intent, or null if none is registered yet
  // (e.g. a PatientLoop intent before PatientLoop ships).
  capability: string | null;
}

/**
 * Classify free text and resolve the capability that should handle it. Never
 * throws — an unconfigured classifier or an unroutable intent both come back as
 * a decision with `capability: null`, so the caller can reply gracefully.
 */
export const route = async (ctx: McpContext, text: string): Promise<RouteDecision> => {
  const classification = await classify(ctx, text);
  const capability = capabilityRegistry.resolveIntent(classification.intent) ?? null;
  return {
    intent: classification.intent,
    confidence: classification.confidence,
    slots: classification.slots,
    capability
  };
};
