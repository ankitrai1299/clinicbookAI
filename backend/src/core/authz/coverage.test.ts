import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Authorization coverage, enforced by the build — the same idea as
// architecture.test.ts, applied to route guards.
//
// The failure this exists for is not a wrong permission; it is a MISSING one. A
// new authenticated route with no `requirePermission` looks completely normal,
// compiles, passes review, and is open to every role in the clinic. Nobody
// notices until someone with the wrong job does something they should not have
// been able to.
//
// So every authenticated route must either carry a guard or be listed below with
// a reason. The list may shrink. Nothing may be added to it without writing down
// why, which is the point.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

/**
 * Routes that are authenticated but deliberately carry no permission check.
 * Each entry is `file:routePath` with the reason it is exempt.
 */
const UNGATED_BY_DESIGN: Readonly<Record<string, string>> = {
  // Identity, not data: every signed-in user must be able to ask who they are
  // and see their own clinic, whatever their role. Gating these would make it
  // impossible for a receptionist to load the app at all.
  'core/auth/auth.routes.ts:/me': 'returns the caller their own identity',
  'core/clinics/clinic.routes.ts:/me': 'the caller reading their own clinic, needed to render any screen',
  'core/clinics/clinic.routes.ts:/whatsapp-link':
    "the clinic's own shareable join link — the same information printed on their QR poster",

  // Authentication endpoints. They run BEFORE a role exists, so a permission
  // check is meaningless; they are protected by rate limits and credentials.
  'core/auth/auth.routes.ts:/login': 'establishes identity; no role exists yet',
  'core/auth/auth.routes.ts:/partner-login': 'same, behind a shared partner secret',
  'core/auth/auth.routes.ts:/verify-otp': 'completes signup verification before any role is assigned',
  'core/auth/auth.routes.ts:/resend-otp': 'reissues that verification code, also before any role exists',
  'core/clinics/clinic.routes.ts:/register': 'creates the clinic and its first user; nothing to authorize against',

  // Meta calls this one, not a person. It is verified by the X-Hub-Signature-256
  // HMAC over the raw body, which is a stronger check than any role could be.
  'core/whatsapp/whatsapp.routes.ts:/webhook': "Meta's inbound webhook, authenticated by HMAC signature, not by a session",

  // A user managing their OWN second factor and their OWN sessions. Gating these
  // on a permission would mean a receptionist could not protect their account,
  // which is backwards — the point of MFA is that everybody can turn it on.
  // Each one already proves identity: /verify by the challenge token, the rest
  // by a live session plus (for enable/disable) a current TOTP code.
  'core/auth/mfa.routes.ts:/verify': 'the second half of a sign-in; authenticated by the short-lived challenge token',
  'core/auth/mfa.routes.ts:/setup': 'a user enrolling their own authenticator; changes nothing until confirmed',
  'core/auth/mfa.routes.ts:/enable': 'a user turning on their own second factor, proven by a current code',
  'core/auth/mfa.routes.ts:/disable': 'a user turning off their own second factor, proven by a current code',
  'core/auth/mfa.routes.ts:/': 'tells the caller whether THEIR OWN second factor is on',
  'core/auth/mfa.routes.ts:/sign-out-everywhere': "ends the caller's own sessions; everyone must be able to do this"
};

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.routes.ts') && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
};

const rel = (abs: string) => path.relative(SRC, abs).split(path.sep).join('/');

interface RouteLine {
  file: string;
  route: string;
  line: string;
  guarded: boolean;
}

/** Every `xRouter.get('/path', …)` in a file, with whether its line names a guard. */
const routesIn = (abs: string): RouteLine[] => {
  const src = fs.readFileSync(abs, 'utf8');
  const file = rel(abs);

  // A router-wide `use(requirePermission(...))` covers every route in the file.
  const blanket = /\.use\([^)]*requirePermission\(/.test(src) || /\.use\(\s*requirePermission/.test(src);

  const out: RouteLine[] = [];
  // A route declaration spans as many lines as it likes, so the statement is
  // read by balancing parentheses rather than by a line-shaped regex. Getting
  // this wrong is not a cosmetic bug: every multi-line route would read as
  // ungated, the list would fill with noise, and the noise is what makes a
  // ratchet get switched off.
  const re = /(\w+Router)\.(get|post|put|patch|delete)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const decl = src.slice(m.index, end + 1);
    // The first argument is the path — a quoted string, or a regex literal for
    // the audio routes.
    const pathMatch = decl.match(/\(\s*(['"`])([^'"`]*)\1/);
    out.push({
      file,
      route: pathMatch ? pathMatch[2] : decl.slice(m[0].length, m[0].length + 40).split('\n')[0].trim(),
      line: decl.split('\n')[0],
      guarded:
        blanket ||
        /requirePermission\(/.test(decl) ||
        // Named guards assigned once at the top of the file (see whatsapp.routes).
        /manageChannel|messagePatient/.test(decl)
    });
  }
  return out;
};

// Public/unauthenticated surfaces are a different question — they are protected
// by not exposing tenant data at all, and by their own rate limits.
const PUBLIC_FILES = [
  'core/patients/public.routes.ts', // the shareable /register page and booking funnel
  'core/publicapi/v1.routes.ts', // partner API, authenticated by ApiKey + scopes
  'core/webhooks/webhook.routes.ts', // outbound webhook management, mounted separately
  'routes/health.routes.ts', // liveness
  'core/billing/billing.routes.ts', // Stripe, verified by webhook signature
  // UNMOUNTED — routes/index.ts does not register this router (a doctor is a
  // bookable resource in this product, not an account). Nothing can reach it, so
  // gating it would be gating dead code; if it is ever remounted it must be
  // gated first, and removing this line is how that gets noticed.
  'modules/doctor-portal/doctorPortal.routes.ts'
];

describe('every authenticated route is authorized', () => {
  const files = walk(SRC).filter((f) => !PUBLIC_FILES.includes(rel(f)));

  it('finds the routers, so a broken parser cannot pass this vacuously', () => {
    const all = files.flatMap(routesIn);
    expect(all.length).toBeGreaterThan(30);
    expect(all.some((r) => r.file.endsWith('patient.routes.ts'))).toBe(true);
  });

  it('leaves no route ungated without a stated reason', () => {
    const ungated = files
      .flatMap(routesIn)
      .filter((r) => !r.guarded)
      .filter((r) => !(`${r.file}:${r.route}` in UNGATED_BY_DESIGN))
      .map((r) => `${r.file}:${r.route}`);

    expect(
      ungated,
      'These routes are behind requireAuth but have no permission check, so every ' +
        'role in the clinic can call them. Add requirePermission(...), or add the ' +
        'route to UNGATED_BY_DESIGN with the reason:\n  ' + ungated.join('\n  ')
    ).toEqual([]);
  });

  it('states a real reason for every exemption', () => {
    const thin = Object.entries(UNGATED_BY_DESIGN).filter(([, why]) => (why || '').trim().length < 20);
    expect(thin.map(([r]) => r), 'exemptions need a reason someone can check later').toEqual([]);
  });

  it('keeps the exemption list honest — every entry still names a real route', () => {
    // A stale entry silently exempts nothing, or worse, hides that a route was
    // renamed and is now ungated under its new name.
    const actual = new Set(walk(SRC).flatMap(routesIn).map((r) => `${r.file}:${r.route}`));
    const stale = Object.keys(UNGATED_BY_DESIGN).filter((k) => !actual.has(k));
    expect(stale, `UNGATED_BY_DESIGN entries that no longer exist — delete them:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});

describe('the clinical routes of the scribe are authorized too', () => {
  // MediScribe is one large router rather than many *.routes.ts files, so its
  // most sensitive endpoints are pinned by name.
  const router = fs.readFileSync(path.join(SRC, 'products/mediscribe/router.ts'), 'utf8');

  const guardFor = (needle: string): string | null => {
    const at = router.indexOf(needle);
    if (at < 0) return null;
    const decl = router.slice(at, at + 300);
    const m = decl.match(/requirePermission\('([^']+)'\)/);
    return m ? m[1] : null;
  };

  it('guards playback and deletion of consultation audio', () => {
    expect(guardFor("mediscribeRouter.get(/^\\/audio\\/")).toBe('recording.read');
    expect(guardFor("mediscribeRouter.delete(\n  /^\\/audio\\/")).toBe('recording.delete');
  });

  it('guards recording, report generation and finalisation', () => {
    expect(guardFor("'/transcribe'")).toBe('consultation.write');
    expect(guardFor("'/generate-report'")).toBe('consultation.write');
    expect(guardFor("'/save-consultation'")).toBe('consultation.write');
  });

  it('guards sending a prescription and downloading a document', () => {
    expect(guardFor("'/consultations/:id/send-prescription'")).toBe('prescription.send');
    expect(guardFor("'/render-pdf'")).toBe('document.download');
  });
});
