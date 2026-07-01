import { describe, it, expect } from 'vitest';

import { mcpIntentClassifier } from './mcp.classifier.js';
import type { McpContext } from '../mcp/index.js';

const ctx: McpContext = { clinicId: 'c1', channel: 'whatsapp', actor: { kind: 'patient', patientId: 'p1' } };
const intent = (text: string) => mcpIntentClassifier(ctx, text).intent;

describe('mcpIntentClassifier (brain router)', () => {
  it('routes prescription / scribe requests to the prescription intent', () => {
    expect(intent('mera prescription bhejo')).toBe('prescription');
    expect(intent('meri parchi chahiye')).toBe('prescription');
    expect(intent('doctor ne kya likha hai')).toBe('prescription');
    expect(intent('meri dawai batao')).toBe('prescription');
    expect(intent('send me the scribe')).toBe('prescription');
  });

  it('leaves booking-family messages as unknown (→ fallback FSM, no double AI)', () => {
    expect(intent('book appointment')).toBe('unknown');
    expect(intent('kal cardiologist se milna hai')).toBe('unknown');
    expect(intent('Hii')).toBe('unknown');
    expect(intent('10:00 AM')).toBe('unknown');
    expect(intent('cancel my appointment')).toBe('unknown');
  });
});
