import React, { useCallback, useEffect, useState } from 'react';
import {
  Key, Plus, Copy, Check, Trash2, ShieldCheck, FlaskConical,
  AlertTriangle, Eye, BookOpen, Webhook
} from 'lucide-react';

import { API_BASE } from '../api/client';
import {
  ApiKeyMode, ApiKeySummary, ApiScope, IssuedApiKey,
  createApiKey, listApiKeys, revokeApiKey
} from '../api/apiKeys';

// The "Developers" tab. Its job is to let a clinic hand an integrator a key
// WITHOUT anyone opening a terminal, and to make the live/test distinction
// impossible to miss — a partner who tests against LIVE will send real WhatsApp
// messages to real patients.

const MODE_COPY: Record<ApiKeyMode, { title: string; blurb: string; tone: string; badge: string }> = {
  LIVE: {
    title: 'Live',
    blurb: 'Books into your real clinic. Patients get real WhatsApp messages and reminders.',
    tone: 'border-emerald-200 bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700'
  },
  TEST: {
    title: 'Test (Sandbox)',
    blurb: 'Books into a private copy of your clinic with demo doctors. No WhatsApp message is ever sent. Safe for developers.',
    tone: 'border-amber-200 bg-amber-50',
    badge: 'bg-amber-100 text-amber-700'
  }
};

const CopyButton: React.FC<{ value: string; label?: string }> = ({ value, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
};

const ScopePills: React.FC<{ scopes: ApiScope[] }> = ({ scopes }) => (
  <div className="flex gap-1">
    {(['read', 'write'] as ApiScope[]).map((s) => (
      <span
        key={s}
        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
          scopes.includes(s) ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-400 line-through'
        }`}
      >
        {s}
      </span>
    ))}
  </div>
);

const DeveloperApi: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [sandboxClinicId, setSandboxClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ApiKeyMode>('TEST');
  const [canWrite, setCanWrite] = useState(true);
  const [creating, setCreating] = useState(false);

  // The plaintext key, held in memory only until the user dismisses it. It is
  // genuinely unrecoverable afterwards — the server stored only its hash.
  const [justIssued, setJustIssued] = useState<IssuedApiKey | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listApiKeys()
      .then((data) => {
        setKeys(data.keys);
        setSandboxClinicId(data.sandboxClinicId);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const submit = () => {
    if (!name.trim()) return;
    setCreating(true);
    const scopes: ApiScope[] = canWrite ? ['read', 'write'] : ['read'];
    createApiKey({ name: name.trim(), mode, scopes })
      .then((issued) => {
        setJustIssued(issued);
        setShowForm(false);
        setName('');
        load();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCreating(false));
  };

  const revoke = (key: ApiKeySummary) => {
    if (!window.confirm(`Revoke "${key.name}"?\n\nAny app using it stops working immediately. This cannot be undone.`)) return;
    revokeApiKey(key.id)
      .then(load)
      .catch((e: Error) => setError(e.message));
  };

  const live = keys.filter((k) => k.mode === 'LIVE');
  const test = keys.filter((k) => k.mode === 'TEST');

  const KeyRow: React.FC<{ k: ApiKeySummary }> = ({ k }) => (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border ${k.revokedAt ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'}`}>
      <div className="flex-1 min-w-[180px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{k.name}</span>
          {k.revokedAt && <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">REVOKED</span>}
        </div>
        <code className="text-xs text-slate-500">{k.prefix}••••••••••••••••</code>
      </div>
      <ScopePills scopes={k.scopes} />
      <div className="text-xs text-slate-500 w-32">
        {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never used'}
      </div>
      {!k.revokedAt && (
        <button
          onClick={() => revoke(k)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
        >
          <Trash2 className="w-3.5 h-3.5" /> Revoke
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* What is this? Plain language, before any jargon. */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-sky-50"><Key className="w-5 h-5 text-sky-600" /></div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Developers &amp; API</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Give your hospital software, website or EMR an <strong>API key</strong>. They put it in their app,
              and every appointment they book flows through ClinicBook — so reminders, WhatsApp confirmations
              and your dashboard keep working exactly as they do today.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* The one-time reveal. Deliberately loud and modal-ish. */}
      {justIssued && (
        <div className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-5 h-5 text-sky-700" />
            <h3 className="font-bold text-slate-900">Copy this key now — it will never be shown again</h3>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            We only store a fingerprint of it. If you lose it, revoke it and create a new one.
          </p>
          <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
            <code className="flex-1 text-sm font-mono text-slate-800 break-all">{justIssued.plaintext}</code>
            <CopyButton value={justIssued.plaintext} />
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className={`px-2 py-1 rounded text-[11px] font-bold ${MODE_COPY[justIssued.mode].badge}`}>
              {MODE_COPY[justIssued.mode].title.toUpperCase()}
            </span>
            <button onClick={() => setJustIssued(null)} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
              I&apos;ve saved it — close
            </button>
          </div>
        </div>
      )}

      {/* Live vs Test, explained side by side before they choose. */}
      <div className="grid md:grid-cols-2 gap-4">
        {(['LIVE', 'TEST'] as ApiKeyMode[]).map((m) => (
          <div key={m} className={`rounded-2xl border p-5 ${MODE_COPY[m].tone}`}>
            <div className="flex items-center gap-2 mb-1">
              {m === 'LIVE' ? <ShieldCheck className="w-4 h-4 text-emerald-700" /> : <FlaskConical className="w-4 h-4 text-amber-700" />}
              <span className="font-bold text-slate-900 text-sm">{MODE_COPY[m].title}</span>
              <code className="text-[11px] text-slate-500">{m === 'LIVE' ? 'ck_live_…' : 'ck_test_…'}</code>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{MODE_COPY[m].blurb}</p>
          </div>
        ))}
      </div>

      {/* Create */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900">Your API keys</h3>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition"
          >
            <Plus className="w-4 h-4" /> Create key
          </button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Who is this key for?
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Apollo hospital website"
                maxLength={60}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Environment</label>
              <div className="grid grid-cols-2 gap-2">
                {(['TEST', 'LIVE'] as ApiKeyMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition text-left ${
                      mode === m ? 'border-sky-500 bg-white ring-2 ring-sky-100' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {m === 'LIVE' ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> : <FlaskConical className="w-3.5 h-3.5 text-amber-600" />}
                      {MODE_COPY[m].title}
                    </div>
                  </button>
                ))}
              </div>
              {mode === 'LIVE' && (
                <p className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                  This key books real appointments and messages real patients. Give developers a Test key instead.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Permissions</label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked readOnly className="rounded accent-sky-600" />
                <span><strong>Read</strong> — see doctors, slots and appointments</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 mt-1.5">
                <input
                  type="checkbox"
                  checked={canWrite}
                  onChange={(e) => setCanWrite(e.target.checked)}
                  className="rounded accent-sky-600"
                />
                <span><strong>Write</strong> — book, reschedule and cancel appointments</span>
              </label>
              {!canWrite && (
                <p className="mt-2 text-[11px] text-slate-600">
                  Read-only. Useful for a website that only shows available slots.
                </p>
              )}
            </div>

            <button
              onClick={submit}
              disabled={creating || !name.trim()}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-slate-800 transition"
            >
              {creating ? 'Creating…' : 'Create key'}
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No keys yet. Create a <strong>Test</strong> key to let a developer start integrating safely.
          </p>
        ) : (
          <div className="space-y-5">
            {test.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Test keys</h4>
                </div>
                <div className="space-y-2">{test.map((k) => <KeyRow key={k.id} k={k} />)}</div>
                {sandboxClinicId && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    Sandbox clinic <code className="text-slate-600">{sandboxClinicId}</code> — separate doctors,
                    separate appointments, WhatsApp disabled.
                  </p>
                )}
              </div>
            )}
            {live.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Live keys</h4>
                </div>
                <div className="space-y-2">{live.map((k) => <KeyRow key={k.id} k={k} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quickstart — the exact thing to send the integrator. */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-900 text-sm">Send this to your developer</h3>
        </div>
        <p className="text-xs text-slate-600 mb-3">
          Every request carries the key in an <code>Authorization</code> header. Start with <code>/me</code> —
          it echoes back which clinic and which mode the key is bound to.
        </p>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto">
{`# 1. Check the key works (and which mode it is)
curl ${API_BASE}/api/v1/me \\
  -H "Authorization: Bearer ck_test_..."

# 2. List bookable doctors
curl ${API_BASE}/api/v1/doctors \\
  -H "Authorization: Bearer ck_test_..."

# 3. Free slots for a doctor on a date
curl "${API_BASE}/api/v1/doctors/DOCTOR_ID/slots?date=2026-07-20" \\
  -H "Authorization: Bearer ck_test_..."

# 4. Book. Idempotency-Key makes a retry safe.
curl -X POST ${API_BASE}/api/v1/appointments \\
  -H "Authorization: Bearer ck_test_..." \\
  -H "Idempotency-Key: any-unique-string" \\
  -H "Content-Type: application/json" \\
  -d '{"doctorId":"DOCTOR_ID","patientName":"Test Patient",
       "patientPhone":"+919876543210","date":"2026-07-20",
       "time":"10:00 AM"}'`}
          </pre>
          <div className="absolute top-3 right-3">
            <CopyButton value={`curl ${API_BASE}/api/v1/me -H "Authorization: Bearer YOUR_KEY"`} label="Copy /me" />
          </div>
        </div>

        <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <Webhook className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600">
            <strong>Want the other direction?</strong> Webhooks push every booking, cancellation and reschedule
            back to your partner&apos;s server — including bookings made by patients over WhatsApp.
            Ask support to register an endpoint.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeveloperApi;
