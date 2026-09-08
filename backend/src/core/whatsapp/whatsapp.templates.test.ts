import { describe, it, expect } from 'vitest';

import { isTemplateUnusable } from './whatsapp.service';

describe('isTemplateUnusable', () => {
  const metaError = (code: number) => ({ response: { data: { error: { code } } } });

  it('recognises a template Meta will not send', () => {
    // 132001 is what a template that is not on this WABA returns, and is how a
    // registration welcome went missing the day the ABHA variant shipped.
    expect(isTemplateUnusable(metaError(132001))).toBe(true);
    expect(isTemplateUnusable(metaError(132000))).toBe(true);
    expect(isTemplateUnusable(metaError(132015))).toBe(true);
  });

  it('does not treat every failure as one', () => {
    // The caller RESENDS on true. Widening this would resend after errors where
    // the first message may in fact have gone out.
    expect(isTemplateUnusable(metaError(131047))).toBe(false); // 24h window
    expect(isTemplateUnusable(metaError(133010))).toBe(false); // number not registered
    expect(isTemplateUnusable(metaError(4))).toBe(false); // rate limit
    expect(isTemplateUnusable(new Error('socket hang up'))).toBe(false);
    expect(isTemplateUnusable(undefined)).toBe(false);
  });
});
