// Tamper-EVIDENCE for the audit trail. Pure except for node:crypto.
//
// Be precise about what this buys, because "tamper-proof" is a claim nobody can
// honestly make about a table their own application can write to:
//
//   • Each row's `hash` covers its own content AND the previous row's hash.
//     Editing a row's content invalidates its hash. Recomputing that row's hash
//     then invalidates every row after it. Deleting a row leaves the next row
//     pointing at a hash that no longer exists.
//
//   • So any single-row edit or deletion is DETECTABLE by re-walking the chain.
//     An attacker with direct database write access can still rewrite the chain
//     forward — this makes that expensive and noisy, not impossible.
//
//   • The structural control is the one that actually matters: the application
//     exposes no endpoint that updates or deletes an audit row, and none may be
//     added. The chain exists to catch what happens BELOW the application.
//
// Concurrency: two simultaneous writes may read the same previous hash and both
// chain from it, forking the chain. That is tolerated and expected. A fork is not
// corruption — every row still commits to its own content and to a real
// predecessor, so content tampering and deletion remain detectable. Serialising
// every audit write to keep a single strand would cost more than it is worth.

import { createHash } from 'node:crypto';

/** The fields a hash commits to. Anything not listed here is not protected. */
export interface HashableEntry {
  clinicId?: string | null;
  actorId?: string | null;
  actorType: string;
  actorRole?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  patientId?: string | null;
  outcome: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
}

/**
 * A stable string for an entry. Key order is fixed by this function rather than
 * by object insertion order, so the same row always hashes the same way — a
 * detail that decides whether verification works at all a year from now.
 */
export const canonicalise = (entry: HashableEntry): string => {
  const meta = entry.metadata ?? {};
  const metaCanonical = Object.keys(meta)
    .sort()
    .map((k) => `${k}=${String((meta as Record<string, unknown>)[k])}`)
    .join('&');

  return [
    entry.clinicId ?? '',
    entry.actorId ?? '',
    entry.actorType,
    entry.actorRole ?? '',
    entry.action,
    entry.resourceType ?? '',
    entry.resourceId ?? '',
    entry.patientId ?? '',
    entry.outcome,
    entry.reason ?? '',
    metaCanonical,
    typeof entry.createdAt === 'string' ? entry.createdAt : entry.createdAt.toISOString()
  ].join('|');
};

/** `hash` for a row, given the hash of the row it follows. */
export const hashEntry = (entry: HashableEntry, prevHash: string | null | undefined): string =>
  createHash('sha256')
    .update(`${prevHash ?? ''}\n${canonicalise(entry)}`)
    .digest('hex');

export interface ChainRow extends HashableEntry {
  id: string;
  prevHash: string | null;
  hash: string;
}

export type ChainProblem =
  | { id: string; problem: 'content-altered' }
  | { id: string; problem: 'broken-link'; missingPrevHash: string };

/**
 * Re-walk a clinic's rows and report what does not add up.
 *
 * `content-altered` — the row's stored hash does not match its own content.
 * `broken-link`     — the row points at a predecessor hash that is not present,
 *                     i.e. the row before it was deleted.
 *
 * Rows must be passed oldest-first. Returns an empty array when the chain is
 * intact.
 */
export const verifyChain = (rows: ChainRow[]): ChainProblem[] => {
  const problems: ChainProblem[] = [];
  const seenHashes = new Set<string>();

  for (const row of rows) {
    if (hashEntry(row, row.prevHash) !== row.hash) {
      problems.push({ id: row.id, problem: 'content-altered' });
    }
    // The first row of a chain legitimately has no predecessor.
    if (row.prevHash && !seenHashes.has(row.prevHash)) {
      problems.push({ id: row.id, problem: 'broken-link', missingPrevHash: row.prevHash });
    }
    seenHashes.add(row.hash);
  }

  return problems;
};
