import React, { useState } from 'react';
import {
  ArrowRight, ArrowLeft, Terminal, ShieldCheck, FlaskConical, Webhook,
  KeyRound, Copy, Check, Zap, Lock
} from 'lucide-react';

import { API_BASE } from '../api/client';
import { PageType } from '../types';

// PUBLIC, unauthenticated API documentation. A hospital's developer must be able
// to evaluate the integration BEFORE anyone creates an account — so this lives on
// the marketing site, reachable from the landing page and the nav, and holds no
// secrets. The keys themselves are minted inside the dashboard (they're per-clinic
// credentials); everything here is just how the API behaves.

interface DeveloperDocsProps {
  setCurrentPage: (page: PageType) => void;
  // Logged-in → open the dashboard's Developers & API tab directly; logged-out →
  // signup (a key always belongs to a clinic, so there's nothing to issue without one).
  onGetApiKey: () => void;
  isLoggedIn: boolean;
}

const Code: React.FC<{ children: string }> = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs sm:text-[13px] overflow-x-auto leading-relaxed">
        {children}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-700/80 text-slate-100 hover:bg-slate-600 transition opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

const Endpoint: React.FC<{ method: string; path: string; scope: string; children: React.ReactNode }> = ({
  method, path, scope, children
}) => {
  const tone =
    method === 'GET' ? 'bg-sky-100 text-sky-700' : method === 'POST' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${tone}`}>{method}</span>
        <code className="text-sm font-mono text-slate-800">{path}</code>
        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-400">
          <Lock className="w-3 h-3" /> {scope}
        </span>
      </div>
      <div className="px-4 py-3 text-sm text-slate-600">{children}</div>
    </div>
  );
};

export default function DeveloperDocs({ setCurrentPage, onGetApiKey, isLoggedIn }: DeveloperDocsProps) {
  return (
    <div className="bg-white min-h-screen" id="developer-docs-root">
      {/* Hero */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <button
            onClick={() => setCurrentPage('landing')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-8 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-mono uppercase tracking-widest text-sky-300 mb-5">
            <Terminal className="w-3.5 h-3.5" /> Developers &amp; API
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Booking, reminders and WhatsApp — <span className="text-sky-400">as an API.</span>
          </h1>
          <p className="text-lg text-slate-300 mt-5 max-w-2xl leading-relaxed">
            Put a key in your app and every appointment your hospital software, website or EMR books
            flows through ClinicBook — reminders, WhatsApp confirmations and the clinic dashboard keep
            working exactly as they do today. REST, JSON, versioned. No SDK required.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button
              onClick={onGetApiKey}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition"
            >
              {isLoggedIn ? 'Open Developers & API' : 'Get an API key'} <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#quickstart"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition"
            >
              Jump to quickstart
            </a>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-14">
        {/* Two directions */}
        <section className="grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-sky-600" />
              <h3 className="font-bold text-slate-900">You call us</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your app holds the key and books through our REST API. We handle the slot locking,
              the patient record, the WhatsApp confirmation and the reminders.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Webhook className="w-4 h-4 text-sky-600" />
              <h3 className="font-bold text-slate-900">We call you</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Register a webhook and we push every booking, cancellation and reschedule to your
              server — <strong>including the ones patients make over WhatsApp</strong> — signed so you
              can trust them.
            </p>
          </div>
        </section>

        {/* Auth */}
        <section>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-4">Authentication</h2>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            Every request carries your key in an <code className="text-sky-700">Authorization</code> header.
            The key identifies your clinic — you never pass a clinic id, and you can only ever touch your
            own data.
          </p>
          <Code>{`curl ${API_BASE}/api/v1/me \\
  -H "Authorization: Bearer ck_live_your_key_here"`}</Code>
          <div className="mt-4 grid sm:grid-cols-2 gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-2"><span className="font-mono">Base URL</span> <code className="text-slate-700">{API_BASE}/api/v1</code></div>
            <div className="flex items-center gap-2"><span className="font-mono">Rate limit</span> 600 req / min per key</div>
          </div>
        </section>

        {/* Test vs live */}
        <section>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-4">Test &amp; live keys</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="w-4 h-4 text-amber-700" />
                <span className="font-bold text-slate-900 text-sm">Test</span>
                <code className="text-[11px] text-slate-500">ck_test_…</code>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Books into a private <strong>sandbox clinic</strong> with demo doctors. <strong>No WhatsApp
                message is ever sent.</strong> Build and break things freely — nothing reaches a real patient.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-slate-900 text-sm">Live</span>
                <code className="text-[11px] text-slate-500">ck_live_…</code>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Books into your real clinic. Patients get real WhatsApp confirmations and reminders.
                Switch to this only once your integration works against a test key.
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-4">
            Each key carries <strong>scopes</strong> — <code className="text-sky-700">read</code> for the GET
            endpoints, <code className="text-sky-700">write</code> for booking and changes. A call without its
            scope returns <code>403</code>.
          </p>
        </section>

        {/* Endpoints */}
        <section>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-4">Endpoints</h2>
          <div className="space-y-3">
            <Endpoint method="GET" path="/api/v1/me" scope="read">
              Confirm a key works. Echoes back the clinic, the key&apos;s mode (LIVE/TEST) and its scopes.
            </Endpoint>
            <Endpoint method="GET" path="/api/v1/doctors" scope="read">
              The clinic&apos;s bookable doctors. Native clinics: from our database. EMR clinics: read live
              from their FHIR server, returned with the same ids.
            </Endpoint>
            <Endpoint method="GET" path="/api/v1/doctors/:id/slots?date=YYYY-MM-DD" scope="read">
              Open start times for that doctor on that date, in clinic-local <code>HH:MM AM/PM</code>.
              Past and near-past slots are already filtered out.
            </Endpoint>
            <Endpoint method="POST" path="/api/v1/appointments" scope="write">
              Book. The patient is found-or-created by phone. Send an <code>Idempotency-Key</code> header so a
              retry after a timeout replays the original booking instead of creating a second one.
            </Endpoint>
            <Endpoint method="GET" path="/api/v1/appointments/:id" scope="read">
              Read one booking&apos;s current state.
            </Endpoint>
            <Endpoint method="PATCH" path="/api/v1/appointments/:id" scope="write">
              <code>{`{ "status": "CANCELLED" }`}</code> to cancel, or <code>{`{ "date", "time" }`}</code> to
              reschedule. Cancelling frees the slot for the waitlist and messages the patient once.
            </Endpoint>
          </div>
        </section>

        {/* Quickstart */}
        <section id="quickstart">
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-4">Quickstart</h2>
          <p className="text-sm text-slate-600 mb-4">
            Create a <strong>Test</strong> key in your dashboard under <em>Developers &amp; API</em>, then:
          </p>
          <Code>{`# 1. Check the key works (and which mode it is)
curl ${API_BASE}/api/v1/me \\
  -H "Authorization: Bearer ck_test_..."

# 2. List bookable doctors
curl ${API_BASE}/api/v1/doctors \\
  -H "Authorization: Bearer ck_test_..."

# 3. Free slots for a doctor on a date
curl "${API_BASE}/api/v1/doctors/DOCTOR_ID/slots?date=2026-08-01" \\
  -H "Authorization: Bearer ck_test_..."

# 4. Book. Idempotency-Key makes a retry safe.
curl -X POST ${API_BASE}/api/v1/appointments \\
  -H "Authorization: Bearer ck_test_..." \\
  -H "Idempotency-Key: any-unique-string" \\
  -H "Content-Type: application/json" \\
  -d '{"doctorId":"DOCTOR_ID","patientName":"Test Patient",
       "patientPhone":"+919876543210","date":"2026-08-01",
       "time":"10:00 AM"}'`}</Code>
        </section>

        {/* Webhooks */}
        <section>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-4">Webhooks</h2>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            We deliver <code>appointment.booked</code>, <code>appointment.cancelled</code>,
            <code> appointment.rescheduled</code> and <code>appointment.completed</code> to your endpoint —
            patient-made WhatsApp bookings included. Each POST is signed:
          </p>
          <Code>{`X-ClinicBook-Signature: t=<unix>,v1=<hex hmac_sha256(secret, \`\${t}.\${rawBody}\`)>`}</Code>
          <p className="text-sm text-slate-600 mt-4">
            Verify the signature, reject anything older than 5 minutes, and respond <code>2xx</code>. We
            retry with backoff for up to 6 attempts.
          </p>
        </section>

        {/* Errors */}
        <section>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-4">Errors</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
              <tbody>
                {[
                  ['400', 'Validation — the message names the field'],
                  ['401', 'Missing, unknown, or revoked API key'],
                  ['403', 'Valid key, but it lacks the scope this endpoint needs'],
                  ['404', 'The doctor or appointment does not exist at your clinic'],
                  ['409', 'Slot unavailable, or an idempotent request is in flight'],
                  ['429', 'Per-key rate limit — see the RateLimit-* headers']
                ].map(([code, when], i) => (
                  <tr key={code} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="px-4 py-2.5 font-mono text-slate-800 font-semibold w-20 border-r border-slate-100">{code}</td>
                    <td className="px-4 py-2.5 text-slate-600">{when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl bg-slate-900 text-white p-8 text-center">
          <KeyRound className="w-8 h-8 text-sky-400 mx-auto mb-3" />
          <h3 className="font-display text-2xl font-bold mb-2">Ready to integrate?</h3>
          <p className="text-slate-300 text-sm mb-6 max-w-md mx-auto">
            {isLoggedIn
              ? 'Open the Developers & API tab and mint a test key in seconds.'
              : 'Start a free trial, open the Developers & API tab, and mint a test key in seconds.'}
          </p>
          <button
            onClick={onGetApiKey}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition"
          >
            {isLoggedIn ? 'Open Developers & API' : 'Start free trial'} <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      </div>
    </div>
  );
}
