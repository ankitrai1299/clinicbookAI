import { describe, it, expect } from 'vitest';

// Pure — the judgement only, no database.
import { readBillingRefusal } from './whatsapp.onboarding';

// The real refusal, copied from the status webhook the day a clinic's very
// first patient registration was rejected. The link inside it is the one the
// dashboard offers, so the shape of this string matters.
const REAL_ERROR =
  '[131042] Business eligibility payment issue — Message failed to send because no payment ' +
  'method is set up for your WhatsApp Business account. Visit ' +
  'https://business.facebook.com/billing_hub/accounts/details/?business_id=1126069602115685' +
  '&asset_id=1051961681040741&wizard_name=ADD_PM&account_type=whatsapp-business-account ' +
  'to resolve this issue.';

const at = (iso: string) => new Date(iso);

describe('readBillingRefusal — did Meta refuse this clinic for want of a card', () => {
  it('says nothing when no send was ever refused', () => {
    expect(readBillingRefusal(null, null)).toBeNull();
    expect(readBillingRefusal(null, { createdAt: at('2026-09-22T05:40:00Z') })).toBeNull();
  });

  it('reports not-ready on a refusal with no later delivery', () => {
    const out = readBillingRefusal({ createdAt: at('2026-09-22T05:40:52Z'), error: REAL_ERROR }, null);
    expect(out?.ready).toBe(false);
  });

  it("hands back Meta's own add-a-card link rather than the billing list", () => {
    const out = readBillingRefusal({ createdAt: at('2026-09-22T05:40:52Z'), error: REAL_ERROR }, null);
    expect(out?.manageUrl).toBe(
      'https://business.facebook.com/billing_hub/accounts/details/?business_id=1126069602115685' +
        '&asset_id=1051961681040741&wizard_name=ADD_PM&account_type=whatsapp-business-account'
    );
  });

  it('does not swallow the trailing full stop into the link', () => {
    const out = readBillingRefusal(
      { createdAt: at('2026-09-22T05:40:52Z'), error: 'no payment method. Visit https://business.facebook.com/billing_hub/accounts/x.' },
      null
    );
    expect(out?.manageUrl).toBe('https://business.facebook.com/billing_hub/accounts/x');
  });

  it('still reports not-ready when the error carries no link', () => {
    const out = readBillingRefusal({ createdAt: at('2026-09-22T05:40:52Z'), error: '[131042] payment issue' }, null);
    expect(out).toEqual({ ready: false, manageUrl: null });
  });

  // The case that decides whether a clinic who has already paid keeps being
  // nagged: a message got through afterwards, so whatever was wrong is fixed.
  it('goes quiet once a later message was delivered', () => {
    expect(
      readBillingRefusal(
        { createdAt: at('2026-09-22T05:40:52Z'), error: REAL_ERROR },
        { createdAt: at('2026-09-22T06:10:00Z') }
      )
    ).toBeNull();
  });

  it('keeps warning when the delivery came BEFORE the refusal', () => {
    const out = readBillingRefusal(
      { createdAt: at('2026-09-22T05:40:52Z'), error: REAL_ERROR },
      { createdAt: at('2026-09-20T09:00:00Z') }
    );
    expect(out?.ready).toBe(false);
  });
});
