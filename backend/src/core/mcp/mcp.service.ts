// The brain's execution entry points. Every channel and internal caller reaches
// products THROUGH here — never by importing a product service directly. Two
// deliberately different contracts:
//
//  • invoke()  — PRECISE. Call a named capability directly (non-NL channels:
//    dashboard, REST API, cron, internal callers). Throws on an unknown
//    capability (a config bug) and lets the handler's own errors (AppError with
//    status codes, etc.) propagate unchanged, so existing precise callers keep
//    their semantics.
//  • handle()  — FORGIVING. The conversational path (WhatsApp/Voice/Chat):
//    classify → route → invoke. NEVER throws — a patient must always get a
//    reply — so failures come back as an McpResult with ok:false.

import { AppError } from '../../utils/AppError.js';
import { capabilityRegistry } from './capabilityRegistry.js';
import { route } from './mcp.router.js';
import type { McpContext, McpResult } from './mcp.types.js';

/**
 * Directly invoke a registered capability. Throws AppError(404) if the
 * capability is not registered; the handler's own errors propagate as-is.
 */
export const invoke = async <Output = unknown>(
  ctx: McpContext,
  capabilityName: string,
  input: unknown = {}
): Promise<Output> => {
  const cap = capabilityRegistry.get(capabilityName);
  if (!cap) {
    throw new AppError(`Unknown capability: ${capabilityName}`, 404);
  }
  return (await cap.handler(ctx, input)) as Output;
};

/**
 * Conversational entry point: understand free text, route it to a capability,
 * and run it. Returns a structured result and NEVER throws — the caller (a
 * messaging channel) can always turn this into a reply.
 *
 * `input` lets a channel pass extra context (resolved slots, etc.) merged over
 * the classifier's own slots when invoking the capability.
 */
export const handle = async <Data = unknown>(
  ctx: McpContext,
  text: string,
  input: Record<string, unknown> = {}
): Promise<McpResult<Data>> => {
  const decision = await route(ctx, text);

  if (!decision.capability) {
    // Either no classifier is wired yet, or no product handles this intent.
    return {
      ok: false,
      capability: null,
      intent: decision.intent,
      error:
        decision.intent === 'unknown'
          ? 'Could not understand the request.'
          : `No capability is available for "${decision.intent}" yet.`
    };
  }

  try {
    const data = await invoke<Data>(ctx, decision.capability, {
      ...(decision.slots ?? {}),
      ...input,
      text
    });
    return { ok: true, capability: decision.capability, intent: decision.intent, data };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[mcp] capability "${decision.capability}" failed:`, err);
    return { ok: false, capability: decision.capability, intent: decision.intent, error };
  }
};
