import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the data helper; the skill's formatting + scoping run for real.
const latestScribeConsultation = vi.fn();
vi.mock('./mediscribeData.js', () => ({
  latestScribeConsultation: (...a: unknown[]) => latestScribeConsultation(...a)
}));

import { registerNovaScribeDocumentsSkill } from './documents.skill.js';
import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';

const ctx: McpContext = {
  clinicId: 'c1',
  channel: 'whatsapp',
  actor: { kind: 'patient', patientId: 'p1', externalId: '919000009002' }
};

const run = (over?: Partial<McpContext>) => {
  registerNovaScribeDocumentsSkill();
  return skillRegistry.get('novascribe.documents')!.handle({ ...ctx, ...over }, '', { activeSkill: null, data: {} });
};

describe('novascribe.documents skill', () => {
  beforeEach(() => {
    skillRegistry.clear();
    latestScribeConsultation.mockReset();
  });

  it('sends the doctor\'s findings + advice from the latest MediScribe report', async () => {
    latestScribeConsultation.mockResolvedValue({
      doctorName: 'Dr. Rao',
      report: { clinicalOverview: 'Viral fever, improving', assessment: ['Viral fever'], advice: ['Rest', 'Fluids'] }
    });
    const res = await run();
    expect(res.done).toBe(true);
    expect(String(res.reply)).toContain('Dr. Rao');
    expect(String(res.reply)).toContain('Viral fever');
    expect(String(res.reply)).toContain('Rest; Fluids');
  });

  it('scopes the lookup to the clinic, and passes BOTH the phone and the patient id', async () => {
    // The patient id is what actually finds the consultation. MediScribe shares
    // ClinicBook's patient table, so a patient who arrived through booking has no
    // row in the scribe's own patients collection — looking them up by phone alone
    // returned nothing, and they were told they had no report while it sat in the
    // app. The phone stays as the fallback for scribe-only walk-ins.
    latestScribeConsultation.mockResolvedValue(null);
    await run();
    expect(latestScribeConsultation).toHaveBeenCalledWith('c1', '919000009002', 'p1');
  });

  it('handles no report gracefully', async () => {
    latestScribeConsultation.mockResolvedValue(null);
    const res = await run();
    expect(String(res.reply)).toMatch(/koi finalized report\/document nahi/i);
  });

  it('stays silent when there is no patient identity', async () => {
    const res = await run({ actor: { kind: 'patient' } });
    expect(res).toEqual({ reply: null, done: true });
  });
});
