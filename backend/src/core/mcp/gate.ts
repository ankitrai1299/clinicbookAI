// Rollout gate for the Healthcare MCP brain (strangler-fig). Decides whether a
// given sender's inbound message is routed through the brain instead of the FSM
// directly. UNLIKE the voice allowlist, the DEFAULT (blank) is OFF: production
// behaviour stays byte-for-byte unchanged until a number is explicitly opted in.
//
//   ""  / "off" / "none" / "disabled"  → nobody (default — live path unchanged)
//   "*" / "all"                        → everyone
//   "9198..., 9199..."                 → only those (last-10 match) — test-first

import { env } from '../../config/env.js';

const nationalKey = (s: string): string => {
  const d = s.replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

const OFF = ['off', 'none', 'disabled'];
const ALL = ['*', 'all'];

let cache: { raw: string; set: Set<string>; wildcard: boolean } | null = null;
const parsed = () => {
  const raw = env.MCP_BRAIN_NUMBERS ?? '';
  if (!cache || cache.raw !== raw) {
    const entries = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    // Default (blank) = OFF. Any OFF token = OFF. "*"/"all" = everyone.
    const off = entries.length === 0 || entries.some((e) => OFF.includes(e));
    const wildcard = !off && entries.some((e) => ALL.includes(e));
    cache = {
      raw,
      wildcard,
      set: new Set(off ? [] : entries.filter((e) => ![...OFF, ...ALL].includes(e)).map(nationalKey))
    };
  }
  return cache;
};

/** True when this sender's inbound WhatsApp message should go through the brain. */
export const isBrainEnabledFor = (phone: string): boolean => {
  const { set, wildcard } = parsed();
  if (wildcard) return true;
  return set.has(nationalKey(phone));
};
