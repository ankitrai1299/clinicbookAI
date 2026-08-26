import { describe, it, expect } from 'vitest';

// PURE provisioning decisions — the rules that decide whether a clinic's number
// is usable and whether one of its templates may be sent. Tested without a DB or
// the Graph API (import without a .js extension so Vite resolves the .ts source).
import {
  classifyRegistrationError,
  decideTemplateSend,
  generateRegistrationPin,
  isDuplicateTemplateError,
  normaliseTemplateStatus,
  summariseTemplates
} from './whatsapp.provisioning';
import { TEMPLATE_DEFINITIONS } from './whatsapp.templateDefs';

describe('generateRegistrationPin', () => {
  it('always produces a 6-digit PIN', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateRegistrationPin()).toMatch(/^\d{6}$/);
    }
  });
});

describe('classifyRegistrationError — which Meta errors actually block sending', () => {
  it('treats "already registered" as success, not failure', () => {
    const r = classifyRegistrationError({ message: 'Phone number is already registered.' });
    expect(r.registered).toBe(true);
    expect(r.alreadyRegistered).toBe(true);
  });

  it('treats a PIN mismatch (133005) as registered — someone else set the PIN', () => {
    // The number IS active; we just could not set OUR pin on it. Blocking here
    // would wrongly tell a working clinic their number is dead.
    const r = classifyRegistrationError({ message: 'PIN mismatch', code: 133005 });
    expect(r.registered).toBe(true);
    expect(r.alreadyRegistered).toBe(true);
  });

  it('reports 133006 (needs verification) as a real blocker with a fixable message', () => {
    const r = classifyRegistrationError({ message: 'not verified', code: 133006 });
    expect(r.registered).toBe(false);
    expect(r.detail).toMatch(/WhatsApp Manager/i);
  });

  it('reports rate limiting (133008) as retryable', () => {
    const r = classifyRegistrationError({ message: 'too many attempts', code: 133008 });
    expect(r.registered).toBe(false);
    expect(r.detail).toMatch(/retry/i);
  });

  it('falls back to a plain failure for unknown errors', () => {
    const r = classifyRegistrationError({ message: 'boom', code: 999 });
    expect(r.registered).toBe(false);
    expect(r.detail).toContain('boom');
  });
});

describe('isDuplicateTemplateError — a name clash means the template is present', () => {
  it('detects Meta subcode 2388023', () => {
    expect(isDuplicateTemplateError({ message: 'whatever', code: 100, subcode: 2388023 })).toBe(true);
  });

  it('detects the "already exists" message shape', () => {
    expect(
      isDuplicateTemplateError({ message: 'Template name already exists in the same language' })
    ).toBe(true);
  });

  it('does not swallow unrelated errors', () => {
    expect(isDuplicateTemplateError({ message: 'Invalid parameter', code: 100 })).toBe(false);
  });
});

describe('normaliseTemplateStatus', () => {
  it('passes through Meta’s known verdicts', () => {
    expect(normaliseTemplateStatus('approved')).toBe('APPROVED');
    expect(normaliseTemplateStatus('REJECTED')).toBe('REJECTED');
    expect(normaliseTemplateStatus('PAUSED')).toBe('PAUSED');
  });

  it('defaults anything unrecognised to PENDING rather than inventing a status', () => {
    expect(normaliseTemplateStatus(undefined)).toBe('PENDING');
    expect(normaliseTemplateStatus('SOMETHING_NEW')).toBe('PENDING');
  });
});

describe('decideTemplateSend — fails OPEN unless Meta positively rejected it', () => {
  it('allows a template we have never synced (clinic may be on the env channel)', () => {
    expect(decideTemplateSend({ known: false })).toEqual({ allowed: true });
  });

  it('allows an approved template', () => {
    expect(decideTemplateSend({ known: true, status: 'APPROVED' })).toEqual({ allowed: true });
  });

  it('allows a still-pending template rather than stalling reminders', () => {
    // Review can take hours. Blocking would silently kill every out-of-window
    // message in the meantime; Meta will reject the send itself if it is early.
    expect(decideTemplateSend({ known: true, status: 'PENDING' })).toEqual({ allowed: true });
  });

  it('blocks a rejected template', () => {
    const d = decideTemplateSend({ known: true, status: 'REJECTED' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('template_not_approved:rejected');
  });

  it('blocks a disabled template and a local submission error', () => {
    expect(decideTemplateSend({ known: true, status: 'DISABLED' }).allowed).toBe(false);
    expect(decideTemplateSend({ known: true, status: 'ERROR' }).allowed).toBe(false);
  });
});

describe('summariseTemplates — dashboard readiness roll-up', () => {
  const row = (name: string, status: string) => ({ name, language: 'en_US', status, reason: null });

  it('is only ready when every canonical template is approved', () => {
    const all = TEMPLATE_DEFINITIONS.map((t) => row(t.name, 'APPROVED'));
    const s = summariseTemplates(all, null);
    expect(s.approved).toBe(TEMPLATE_DEFINITIONS.length);
    expect(s.ready).toBe(true);
    expect(s.pending).toBe(0);
  });

  it('is not ready while any template is still pending', () => {
    const rows = TEMPLATE_DEFINITIONS.map((t, i) => row(t.name, i === 0 ? 'PENDING' : 'APPROVED'));
    const s = summariseTemplates(rows, null);
    expect(s.ready).toBe(false);
    expect(s.pending).toBe(1);
  });

  it('counts ERROR alongside REJECTED as needing attention', () => {
    const s = summariseTemplates([row('a', 'REJECTED'), row('b', 'ERROR'), row('c', 'APPROVED')], null);
    expect(s.rejected).toBe(2);
    expect(s.approved).toBe(1);
  });

  it('reports an empty (freshly connected) WABA as not ready', () => {
    const s = summariseTemplates([], null);
    expect(s.ready).toBe(false);
    expect(s.total).toBe(TEMPLATE_DEFINITIONS.length);
    expect(s.missing).toBe(TEMPLATE_DEFINITIONS.length);
  });

  // The case of a clinic that connected BEFORE a template was added to the
  // canonical list. It is neither pending nor rejected — it was never sent —
  // and counting it as pending would tell that clinic Meta was reviewing a
  // template it has never seen, with nothing on screen able to fix it.
  it('counts a never-submitted template as missing, not pending', () => {
    const rows = TEMPLATE_DEFINITIONS.slice(0, -1).map((t) => row(t.name, 'APPROVED'));
    const s = summariseTemplates(rows, null);
    expect(s.missing).toBe(1);
    expect(s.pending).toBe(0);
    expect(s.rejected).toBe(0);
    expect(s.ready).toBe(false);
  });

  it('does not count a WABA’s own unrelated templates as ours', () => {
    const rows = [
      ...TEMPLATE_DEFINITIONS.map((t) => row(t.name, 'APPROVED')),
      row('something_the_clinic_made_itself', 'APPROVED')
    ];
    const s = summariseTemplates(rows, null);
    expect(s.missing).toBe(0);
    expect(s.ready).toBe(true);
  });
});

describe('TEMPLATE_DEFINITIONS — the shared source of truth', () => {
  it('gives every template a unique name', () => {
    const names = TEMPLATE_DEFINITIONS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('supplies exactly one example value per {{n}} placeholder', () => {
    // Meta rejects a submission whose example count does not match the body.
    for (const tpl of TEMPLATE_DEFINITIONS) {
      const placeholders = new Set(tpl.bodyText.match(/\{\{\d+\}\}/g) ?? []);
      expect(tpl.example.length, `${tpl.name} example count`).toBe(placeholders.size);
    }
  });

  it('numbers placeholders contiguously from 1', () => {
    for (const tpl of TEMPLATE_DEFINITIONS) {
      const nums = [...new Set(tpl.bodyText.match(/\{\{(\d+)\}\}/g) ?? [])]
        .map((p) => Number(p.replace(/\D/g, '')))
        .sort((a, b) => a - b);
      expect(nums, `${tpl.name} placeholders`).toEqual(nums.map((_, i) => i + 1));
    }
  });
});
