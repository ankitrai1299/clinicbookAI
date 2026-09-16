import { describe, it, expect, beforeEach } from 'vitest';

import { startReportJob, readReportJob, _resetReportJobs } from './reportJobs';

const settle = () => new Promise((r) => setTimeout(r, 0));
const OWNER = { clinicId: 'clinic-1', userId: 'user-1' };

beforeEach(() => _resetReportJobs());

describe('a report that outlives its request', () => {
  it('reports running, then the finished report', async () => {
    let finish: (v: unknown) => void = () => {};
    const id = startReportJob(OWNER, () => new Promise((r) => { finish = r; }));

    expect(readReportJob(id, OWNER)?.status).toBe('running');
    finish({ clinicalOverview: 'ok' });
    await settle();

    const job = readReportJob(id, OWNER);
    expect(job?.status).toBe('done');
    expect(job?.report).toEqual({ clinicalOverview: 'ok' });
  });

  it('keeps the failure message instead of losing it', async () => {
    // The doctor pressed a button and it did not work. Telling them why is the
    // difference between retrying and giving up.
    const id = startReportJob(OWNER, async () => { throw new Error('Sarvam is out of credit'); });
    await settle();
    const job = readReportJob(id, OWNER);
    expect(job?.status).toBe('failed');
    expect(job?.error).toBe('Sarvam is out of credit');
  });

  it('does not let one clinic collect another clinic\'s report', async () => {
    // A report is a patient's record. Another clinic asking for it is told
    // nothing exists, which is also what an unknown id is told — so no one can
    // learn a report exists by guessing at it.
    const id = startReportJob(OWNER, async () => ({ secret: true }));
    await settle();
    expect(readReportJob(id, { clinicId: 'clinic-2', userId: 'user-9' })).toBeNull();
    expect(readReportJob('no-such-id', OWNER)).toBeNull();
  });

  it('lets a colleague in the same clinic collect it', async () => {
    // The doctor's phone lost signal and they picked the consultation up on the
    // desktop. Same clinic, same consultation, different session.
    const id = startReportJob(OWNER, async () => ({ ok: true }));
    await settle();
    expect(readReportJob(id, { clinicId: 'clinic-1', userId: 'user-2' })?.status).toBe('done');
  });

  it('drops the oldest jobs rather than growing without limit', async () => {
    // A ceiling, so a bug in a caller cannot fill the process with reports.
    const ids: string[] = [];
    for (let i = 0; i < 260; i++) ids.push(startReportJob(OWNER, async () => i));
    await settle();
    startReportJob(OWNER, async () => 'newest'); // starting one sweeps

    const surviving = ids.filter((id) => readReportJob(id, OWNER) !== null);
    expect(surviving.length).toBeLessThanOrEqual(200);
    // The ones kept are the newest, because those are the ones a doctor is
    // still waiting on.
    expect(readReportJob(ids[ids.length - 1], OWNER)).not.toBeNull();
    expect(readReportJob(ids[0], OWNER)).toBeNull();
  });
});
