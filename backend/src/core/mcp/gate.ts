// Rollout gate for the Healthcare MCP brain. Decides whether a sender's inbound
// message is routed through the brain instead of straight to the FSM.
//
// THE DEFAULT FLIPPED, 18 Aug 2026. It used to be OFF-when-blank, so the live
// path stayed byte-for-byte unchanged while the brain was rolled out number by
// number. That rollout is finished — the brain is what answers "meri parchi"
// and "give me my report" — and leaving it opt-in produced exactly the failure
// it was meant to avoid: a real patient asked for their report and got a
// booking menu, because their number was not on a list nobody remembered.
//
// A default of OFF also makes the feature depend on a variable being SET, and
// an unset variable looks identical to a working system with nothing to say.
//
//   ""  / "on" / "*" / "all"     → everyone (DEFAULT)
//   "off" / "none" / "disabled"  → nobody — the old FSM-only path, for rollback
//   "9198..., 9199..."           → only those (last-10 match)

import { env } from '../../config/env.js';

const nationalKey = (s: string): string => {
  const d = s.replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

const OFF = ['off', 'none', 'disabled'];
const ALL = ['*', 'all', 'on'];

let cache: { raw: string; set: Set<string>; wildcard: boolean } | null = null;
const parsed = () => {
  const raw = env.MCP_BRAIN_NUMBERS ?? '';
  if (!cache || cache.raw !== raw) {
    const entries = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    // Blank = EVERYONE. An explicit off token still turns it off, so rolling
    // back is one word and does not mean listing every number back out.
    const off = entries.some((e) => OFF.includes(e));
    const wildcard = !off && (entries.length === 0 || entries.some((e) => ALL.includes(e)));
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

/** Human-readable rollout state for the startup banner (confirms deploy + config). */
export const describeBrainRollout = (): string => {
  const raw = env.MCP_BRAIN_NUMBERS ?? '';
  const { set, wildcard } = parsed();
  if (wildcard) return `ON for EVERYONE (MCP_BRAIN_NUMBERS="${raw}")`;
  if (set.size === 0) return `OFF — everyone on FSM (MCP_BRAIN_NUMBERS="${raw}")`;
  return `ON for ${set.size} number(s) [${[...set].join(', ')}] (MCP_BRAIN_NUMBERS="${raw}")`;
};
