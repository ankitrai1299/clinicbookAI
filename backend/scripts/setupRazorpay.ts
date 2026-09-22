/**
 * Create the ₹999 subscription plan on Razorpay, and the webhook if this
 * account is allowed to create one by API.
 *
 * Nobody has to hand over a dashboard password for this. The three secrets are
 * set on Railway by whoever owns the account, and this script reads them from
 * the environment it is handed — it prints none of them back.
 *
 *   railway run npx tsx scripts/setupRazorpay.ts          # shows what it would do
 *   COMMIT=yes railway run npx tsx scripts/setupRazorpay.ts
 *
 * Needs, on Railway:
 *   RAZORPAY_KEY_ID          rzp_test_… (or rzp_live_…)
 *   RAZORPAY_KEY_SECRET      from the same key pair
 *   RAZORPAY_WEBHOOK_SECRET  any long random string YOU choose
 *
 * Afterwards it prints the plan id, which is the fourth variable to set:
 *   RAZORPAY_PLAN_ID
 *
 * Test and Live are separate worlds at Razorpay — a plan made with a test key
 * does not exist for a live one. Run this once per mode.
 */
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const COMMIT = process.env.COMMIT === 'yes';

// Where Razorpay should send subscription events. Overridable so a tunnel can
// be used while testing, but this is the real one.
const WEBHOOK_URL =
  process.env.RAZORPAY_WEBHOOK_URL ||
  'https://clinicbookai-production.up.railway.app/api/billing/razorpay/webhook';

const PLAN_NAME = process.env.RAZORPAY_PLAN_NAME || 'AnvayaBook Monthly';
const PLAN_PAISE = Number(process.env.RAZORPAY_PLAN_PAISE || 99900); // ₹999

// Exactly the events the webhook handler acts on. Subscribing to more would
// mean signing for deliveries nothing reads.
const EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.updated',
  'subscription.resumed'
];

if (!KEY_ID || !KEY_SECRET) {
  throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required. Set them on Railway, then run this under `railway run`.');
}
if (!WEBHOOK_SECRET) {
  throw new Error('RAZORPAY_WEBHOOK_SECRET is required — pick any long random string and set it on Railway first, so this script never has to invent one.');
}

const auth = 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
const mode = KEY_ID.startsWith('rzp_live') ? 'LIVE' : 'TEST';

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init?.headers || {}) }
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
};

console.log(`\nRazorpay account: ${mode} mode  (key ${KEY_ID.slice(0, 12)}…)`);
console.log(`Plan to create:   ${PLAN_NAME} — ₹${(PLAN_PAISE / 100).toFixed(0)} monthly`);
console.log(`Webhook URL:      ${WEBHOOK_URL}`);
if (!COMMIT) console.log('\nDRY RUN — nothing will be created. Re-run with COMMIT=yes to do it.\n');

// ── existing plans ────────────────────────────────────────────────────
// Checked first because running this twice must not leave two ₹999 plans and
// no way to tell which one the clinics are on.
const plans = await api('/plans?count=100');
if (!plans.ok) {
  throw new Error(`Could not list plans (${plans.status}): ${JSON.stringify(plans.body)}`);
}
const existing = (plans.body?.items || []).find(
  (p: any) => p.item?.amount === PLAN_PAISE && p.period === 'monthly' && p.item?.currency === 'INR'
);

let planId: string | null = existing?.id ?? null;
if (existing) {
  console.log(`\nPlan already exists: ${existing.id}  "${existing.item?.name}"  — leaving it alone.`);
} else if (!COMMIT) {
  console.log('\nWould create the plan.');
} else {
  const made = await api('/plans', {
    method: 'POST',
    body: JSON.stringify({
      period: 'monthly',
      interval: 1,
      item: { name: PLAN_NAME, amount: PLAN_PAISE, currency: 'INR' }
    })
  });
  if (!made.ok) throw new Error(`Plan creation failed (${made.status}): ${JSON.stringify(made.body)}`);
  planId = made.body.id;
  console.log(`\nPlan created: ${planId}`);
}

// ── webhook ───────────────────────────────────────────────────────────
// The create-webhook API is documented under Partners. A plain merchant
// account is often refused, and that is not a failure worth stopping for —
// it takes a minute in the dashboard. So: try, and if refused, say exactly
// what to type there instead.
const hooks = await api('/webhooks?count=100');
const already = hooks.ok
  ? (hooks.body?.items || []).find((w: any) => w.url === WEBHOOK_URL)
  : null;

if (already) {
  console.log(`\nWebhook already registered for this URL (id ${already.id}).`);
  const have = new Set<string>(Object.keys(already.events || {}).filter((k) => already.events[k]));
  const missing = EVENTS.filter((e) => !have.has(e));
  console.log(missing.length
    ? `  MISSING EVENTS — add these in the dashboard: ${missing.join(', ')}`
    : '  All nine events are subscribed.');
} else if (!hooks.ok) {
  console.log(`\nCannot read webhooks from the API (${hooks.status}) — this account is not a Razorpay partner.`);
  console.log('  Create it by hand: Settings → Webhooks → Add New Webhook');
  console.log(`  URL:    ${WEBHOOK_URL}`);
  console.log('  Secret: the same string you put in RAZORPAY_WEBHOOK_SECRET');
  console.log('  Events: ' + EVENTS.join(', '));
} else if (!COMMIT) {
  console.log('\nWould create the webhook.');
} else {
  const made = await api('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret: WEBHOOK_SECRET,
      events: Object.fromEntries(EVENTS.map((e) => [e, 1]))
    })
  });
  if (made.ok) {
    console.log(`\nWebhook created: ${made.body.id}`);
  } else {
    console.log(`\nWebhook creation refused (${made.status}): ${JSON.stringify(made.body)}`);
    console.log('  Create it by hand: Settings → Webhooks → Add New Webhook');
    console.log(`  URL:    ${WEBHOOK_URL}`);
    console.log('  Secret: the same string you put in RAZORPAY_WEBHOOK_SECRET');
    console.log('  Events: ' + EVENTS.join(', '));
  }
}

if (planId) {
  console.log(`\n\nSet this on Railway and the billing side is done:\n\n  RAZORPAY_PLAN_ID = ${planId}\n`);
}
