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

  it('scopes the lookup to the clinic + the patient\'s phone', async () => {
    latestScribeConsultation.mockResolvedValue(null);
    await run();
    expect(latestScribeConsultation).toHaveBeenCalledWith('c1', '919000009002');
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
