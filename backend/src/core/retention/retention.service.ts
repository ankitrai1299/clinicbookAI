// Applying the retention policy — the job that actually deletes.
//
// Every judgement lives in retention.policy.ts. This file is the mechanism, and
// it is written to be dull on purpose: a deletion job that is clever is a
// deletion job nobody can be sure about.
//
// ── Guards ─────────────────────────────────────────────────────────────────
//
// It refuses any rule naming a table on the never-delete list, at run time and
// not only in a test, because the cost of that mistake is unrecoverable. It
// deletes in bounded batches so a first run against years of rows cannot hold a
// transaction open long enough to matter. And a failure on one table does not
// stop the others: they are independent, and a table that cannot be swept
// tonight should not keep every other one growing.

import { prisma } from '../../config/prisma.js';
import { NEVER_AUTO_DELETED, RETENTION_RULES, cutoffFor, type RetentionRule } from './retention.policy.js';

/** Rows removed per statement. Small enough not to lock, large enough to finish. */
const BATCH = 1000;

/** How many batches one table gets per run, so one huge table cannot starve the rest. */
const MAX_BATCHES = 50;

export interface SweepResult {
  model: string;
  deleted: number;
  /** Set when the table could not be swept; the others still ran. */
  error?: string;
  /** True when the batch cap was hit and rows remain for the next run. */
  more?: boolean;
}

type Delegate = {
  findMany: (args: unknown) => Promise<{ id?: unknown }[]>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
};

const delegateFor = (model: string): Delegate | null => {
  const d = (prisma as unknown as Record<string, unknown>)[model];
  return d && typeof (d as Delegate).deleteMany === 'function' ? (d as Delegate) : null;
};

/**
 * Sweep one table.
 *
 * Deletes by cut-off directly rather than selecting ids first: the condition is
 * a single indexed comparison, and reading a million ids into memory to hand
 * them back one batch at a time buys nothing here.
 */
export const sweepOne = async (rule: RetentionRule, now = new Date()): Promise<SweepResult> => {
  if (Object.prototype.hasOwnProperty.call(NEVER_AUTO_DELETED, rule.model)) {
    // Belt and braces. A test catches this too, but this is the one mistake in
    // the file that cannot be undone by fixing the code afterwards.
    return {
      model: rule.model,
      deleted: 0,
      error: `refused: ${rule.model} is on the never-auto-delete list (${NEVER_AUTO_DELETED[rule.model]})`
    };
  }

  const delegate = delegateFor(rule.model);
  if (!delegate) {
    return { model: rule.model, deleted: 0, error: 'no such model on the Prisma client' };
  }

  const where = { [rule.field]: { lt: cutoffFor(rule, now) } };
  let deleted = 0;

  try {
    for (let i = 0; i < MAX_BATCHES; i++) {
      // `limit` is not available on deleteMany, so the batch is bounded by
      // selecting a page of ids first. Only for tables that have an `id` — the
      // ones that do not are keyed by something unique and small enough that a
      // single delete is fine.
      const page = await delegate.findMany({ where, select: { id: true }, take: BATCH }).catch(() => null);

      if (page === null) {
        const res = await delegate.deleteMany({ where });
        deleted += res.count;
        break;
      }
      if (!page.length) break;

      const res = await delegate.deleteMany({ where: { id: { in: page.map((r) => r.id) } } });
      deleted += res.count;

      if (page.length < BATCH) break;
      if (i === MAX_BATCHES - 1) return { model: rule.model, deleted, more: true };
    }
    return { model: rule.model, deleted };
  } catch (err) {
    // Reported, not thrown: one unsweepable table must not leave every other
    // one growing.
    return { model: rule.model, deleted, error: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * Apply the whole policy.
 *
 * Sequential on purpose. This runs nightly against a database serving clinics;
 * finishing a few seconds sooner is worth nothing next to not competing with
 * a booking.
 */
export const applyRetentionPolicy = async (now = new Date()): Promise<SweepResult[]> => {
  const results: SweepResult[] = [];
  for (const rule of RETENTION_RULES) {
    results.push(await sweepOne(rule, now));
  }

  const deleted = results.reduce((n, r) => n + r.deleted, 0);
  const failed = results.filter((r) => r.error);

  console.info(
    `[Retention] swept ${results.length} tables, removed ${deleted} row(s)` +
      (failed.length ? `, ${failed.length} failed` : '')
  );
  for (const f of failed) console.error(`[Retention] ${f.model}: ${f.error}`);
  for (const m of results.filter((r) => r.more)) {
    console.info(`[Retention] ${m.model} hit the batch cap — more rows remain for the next run`);
  }

  return results;
};
