import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound, Plus, Copy, Check, Trash2, ShieldCheck, FlaskConical,
  AlertTriangle, BookOpen, Webhook, Terminal, X, Sparkles, ArrowRight, Lock,
  Plug, CheckCircle2, XCircle
} from 'lucide-react';

import { API_BASE } from '../api/client';
import {
  ApiKeyMode, ApiKeySummary, ApiScope, IssuedApiKey,
  createApiKey, listApiKeys, revokeApiKey
} from '../api/apiKeys';

// The "Developers & API" tab. Lets a clinic hand an integrator a key without a
// terminal, and makes the live/test distinction impossible to miss — a partner
// who tests against LIVE would message real patients. Presentation is premium on
// purpose: this is a surface we sell on.

const MODE_META: Record<ApiKeyMode, {
  title: string; blurb: string; ring: string; chip: string; icon: React.ElementType; glow: string;
}> = {
  LIVE: {
    title: 'Live',
    blurb: 'Books into your real clinic. Patients receive real WhatsApp confirmations and reminders.',
    ring: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white',
    chip: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20',
    icon: ShieldCheck,
    glow: 'shadow-emerald-100'
  },
  TEST: {
    title: 'Test · Sandbox',
    blurb: 'A private copy of your clinic with demo doctors. No WhatsApp is ever sent — safe for developers.',
    ring: 'border-amber-200/70 bg-gradient-to-br from-amber-50 to-white',
    chip: 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20',
    icon: FlaskConical,
    glow: 'shadow-amber-100'
  }
};

/** Inline copy control. `mono` renders the copied value; otherwise a labelled button. */
const CopyChip: React.FC<{ value: string; label?: string; className?: string }> = ({ value, label = 'Copy', className = '' }) => {
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
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition ${className}`}
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
        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
          scopes.includes(s) ? 'bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20' : 'bg-slate-100 text-slate-300 line-through'
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

  // Create form (rendered as a modal)
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ApiKeyMode>('TEST');
  const [canWrite, setCanWrite] = useState(true);
  const [creating, setCreating] = useState(false);

  // Plaintext key, held in memory only until dismissed. Unrecoverable after —
  // the server stored only its hash.
  const [justIssued, setJustIssued] = useState<IssuedApiKey | null>(null);

  // "Test connection" — paste a key, we hit the real public API's /me from the
  // browser and report whether it authenticates. Gives a non-technical owner a
  // one-click "is this key alive?" without a terminal.
  const [testKey, setTestKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; clinicName: string; mode: string; scopes: string[] } | { ok: false; error: string } | null
  >(null);

  // `explicitKey` lets "Test it now" pass the freshly-minted key directly instead
  // of racing the setTestKey state update. `retriesLeft` covers the moment right
  // after creation: the row can take a beat to become readable (commit/replica
  // lag), so a first "invalid" is retried once before we believe it.
  const runTest = async (explicitKey?: string, retriesLeft = 0) => {
    const key = (explicitKey ?? testKey).trim();
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/me`, { headers: { Authorization: `Bearer ${key}` } });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && (json as { success?: boolean }).success) {
        const data = (json as { data: { clinicName: string; mode: string; scopes: string[] } }).data;
        setTestResult({ ok: true, clinicName: data.clinicName, mode: data.mode, scopes: data.scopes });
      } else if (retriesLeft > 0) {
        await new Promise((r) => setTimeout(r, 1200));
        return runTest(key, retriesLeft - 1);
      } else {
        setTestResult({ ok: false, error: (json as { message?: string }).message || `HTTP ${res.status}` });
      }
    } catch (e) {
      if (retriesLeft > 0) {
        await new Promise((r) => setTimeout(r, 1200));
        return runTest(key, retriesLeft - 1);
      }
      setTestResult({ ok: false, error: (e as Error).message || 'Could not reach the API' });
    } finally {
      setTesting(false);
    }
  };

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
    <div className={`group flex flex-wrap items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all ${
      k.revokedAt ? 'border-slate-200 bg-slate-50/60 opacity-70' : 'border-slate-200/80 bg-white hover:border-sky-300 hover:shadow-md hover:shadow-sky-50'
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.mode === 'LIVE' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
        {k.mode === 'LIVE' ? <ShieldCheck className="w-4.5 h-4.5" /> : <FlaskConical className="w-4.5 h-4.5" />}
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{k.name}</span>
          {k.revokedAt && <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 text-[10px] font-bold">REVOKED</span>}
        </div>
        <code className="text-xs text-slate-400 font-mono">{k.prefix}{'•'.repeat(18)}</code>
      </div>
      <ScopePills scopes={k.scopes} />
      <div className="text-xs text-slate-400 w-28 hidden sm:block">
        {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never used'}
      </div>
      {!k.revokedAt && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <CopyChip value={k.prefix} label="ID" className="px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100" />
          <button
            onClick={() => revoke(k)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> Revoke
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-8">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] font-mono uppercase tracking-widest text-sky-300 mb-4">
            <Terminal className="w-3.5 h-3.5" /> Developers &amp; API
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight max-w-2xl leading-tight">
            Connect your website, hospital software or EMR
          </h2>
          <p className="text-slate-300 text-sm mt-3 max-w-2xl leading-relaxed">
            Issue an API key and every appointment they book flows through ClinicBook — reminders,
            WhatsApp confirmations and this dashboard keep working untouched.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => { setMode('TEST'); setCanWrite(true); setShowForm(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm transition shadow-lg shadow-sky-900/40"
            >
              <Plus className="w-4 h-4" /> Create API key
            </button>
            <a
              href={`${API_BASE}/api/v1/me`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition"
            >
              API base <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Live vs Test explainer ───────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        {(['LIVE', 'TEST'] as ApiKeyMode[]).map((m) => {
          const meta = MODE_META[m];
          const Icon = meta.icon;
          return (
            <div key={m} className={`rounded-2xl border p-5 shadow-sm ${meta.ring} ${meta.glow}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`w-4 h-4 ${m === 'LIVE' ? 'text-emerald-600' : 'text-amber-600'}`} />
                <span className="font-bold text-slate-900 text-sm">{meta.title}</span>
                <code className={`text-[10px] px-1.5 py-0.5 rounded ${meta.chip}`}>{m === 'LIVE' ? 'ck_live_…' : 'ck_test_…'}</code>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{meta.blurb}</p>
            </div>
          );
        })}
      </div>

      {/* ── Keys ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-100">
              <KeyRound className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">Your API keys</h3>
              <p className="text-xs text-slate-400">Shown once at creation — store them safely.</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Create key
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 ring-1 ring-slate-100">
              <KeyRound className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No keys yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-5 max-w-xs mx-auto">
              Create a <strong className="text-amber-600">Test</strong> key to let a developer start integrating safely — no risk to real patients.
            </p>
            <button
              onClick={() => { setMode('TEST'); setCanWrite(true); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition"
            >
              <Plus className="w-4 h-4" /> Create your first key
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {test.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Test keys</h4>
                </div>
                <div className="space-y-2">{test.map((k) => <KeyRow key={k.id} k={k} />)}</div>
                {sandboxClinicId && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2.5 px-1">
                    <Lock className="w-3 h-3" />
                    Sandbox clinic <code className="text-slate-500">{sandboxClinicId}</code> — separate doctors &amp; appointments, WhatsApp disabled.
                  </div>
                )}
              </div>
            )}
            {live.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Live keys</h4>
                </div>
                <div className="space-y-2">{live.map((k) => <KeyRow key={k.id} k={k} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Test connection ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-100">
            <Plug className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 leading-tight">Test a key</h3>
            <p className="text-xs text-slate-400">Paste a key to check it works — no terminal needed.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <input
            value={testKey}
            onChange={(e) => { setTestKey(e.target.value); setTestResult(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') runTest(); }}
            placeholder="Paste ck_test_… or ck_live_…"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
          />
          <button
            onClick={runTest}
            disabled={testing || !testKey.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-40 transition shrink-0"
          >
            {testing ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Testing…</>
            ) : (
              <><Plug className="w-4 h-4" /> Test connection</>
            )}
          </button>
        </div>

        {testResult && (
          testResult.ok ? (
            <div className="mt-4 flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-bold text-emerald-800">This key works ✅</div>
                <div className="text-emerald-700 text-xs mt-0.5">
                  Connected to <strong>{testResult.clinicName}</strong> · mode{' '}
                  <span className="font-mono">{testResult.mode}</span> · can{' '}
                  <span className="font-mono">{testResult.scopes.join(' + ')}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-rose-50 border border-rose-200 animate-fadeIn">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-bold text-rose-800">This key does not work</div>
                <div className="text-rose-700 text-xs mt-0.5">{testResult.error}</div>
                <div className="text-rose-400 text-[11px] mt-1">A revoked or mistyped key, or one from a different environment.</div>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Quickstart ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-slate-400" />
          <h3 className="font-bold text-slate-900">Send this to your developer</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Every request carries the key in an <code className="text-sky-700">Authorization</code> header.
          Start with <code className="text-sky-700">/me</code> — it echoes back the clinic and the key&apos;s mode.
        </p>
        <div className="relative rounded-2xl overflow-hidden ring-1 ring-slate-800">
          <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-950">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-2 text-[11px] font-mono text-slate-500">quickstart.sh</span>
            <div className="ml-auto">
              <CopyChip
                value={`curl ${API_BASE}/api/v1/me -H "Authorization: Bearer YOUR_KEY"`}
                label="Copy /me"
                className="px-2.5 py-1 text-[11px] bg-white/10 text-slate-200 hover:bg-white/20"
              />
            </div>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 text-xs overflow-x-auto leading-relaxed">
{`# 1. Check the key works (and which mode it is)
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
       "time":"10:00 AM"}'`}
          </pre>
        </div>

        <div className="flex items-start gap-2 mt-4 px-3.5 py-3 rounded-2xl bg-slate-50 border border-slate-100">
          <Webhook className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600">
            <strong>Want the other direction?</strong> Webhooks push every booking, cancellation and
            reschedule to your partner&apos;s server — including bookings patients make over WhatsApp.
            Ask support to register an endpoint.
          </p>
        </div>
      </div>

      {/* ═══ Create-key modal ════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn" onClick={() => !creating && setShowForm(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-100">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Create an API key</h3>
                <p className="text-xs text-slate-400">You&apos;ll see the full key once — copy it right away.</p>
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Who is this key for?</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apollo hospital website"
              maxLength={60}
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 mb-5"
            />

            <label className="block text-xs font-semibold text-slate-700 mb-2">Environment</label>
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {(['TEST', 'LIVE'] as ApiKeyMode[]).map((m) => {
                const meta = MODE_META[m];
                const Icon = meta.icon;
                const selected = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`text-left px-3.5 py-3 rounded-2xl border-2 transition ${
                      selected ? 'border-sky-500 bg-sky-50/50 ring-2 ring-sky-100' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800">
                      <Icon className={`w-4 h-4 ${m === 'LIVE' ? 'text-emerald-600' : 'text-amber-600'}`} />
                      {meta.title}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      {m === 'TEST' ? 'Sandbox. No real messages.' : 'Real clinic. Real patients.'}
                    </p>
                  </button>
                );
              })}
            </div>
            {mode === 'LIVE' && (
              <div className="flex items-start gap-2 -mt-2 mb-5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                This key books real appointments and messages real patients. Give developers a Test key.
              </div>
            )}

            <label className="block text-xs font-semibold text-slate-700 mb-2">Permissions</label>
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                <input type="checkbox" checked readOnly className="rounded accent-sky-600" />
                <span className="text-xs text-slate-700"><strong>Read</strong> — doctors, slots, appointments</span>
              </div>
              <label className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                <input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} className="rounded accent-sky-600" />
                <span className="text-xs text-slate-700"><strong>Write</strong> — book, reschedule, cancel</span>
              </label>
            </div>

            <button
              onClick={submit}
              disabled={creating || !name.trim()}
              className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40 hover:bg-slate-800 transition"
            >
              {creating ? 'Creating…' : 'Create key'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ One-time reveal modal ═══════════════════════════════════════ */}
      {justIssued && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-7 relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-100">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Your key is ready</h3>
                <p className="text-xs text-rose-500 font-semibold">Copy it now — it will never be shown again.</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4 mt-2">
              We only keep a fingerprint of it. If you lose it, revoke and create a new one.
            </p>

            <div className="flex items-center gap-2 bg-slate-900 rounded-2xl px-4 py-3.5 mb-4">
              <code className="flex-1 text-sm font-mono text-emerald-300 break-all">{justIssued.plaintext}</code>
              <CopyChip
                value={justIssued.plaintext}
                label="Copy key"
                className="px-3.5 py-2 text-xs bg-white text-slate-900 hover:bg-slate-100 shrink-0"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-6 text-[11px]">
              <span className={`px-2 py-1 rounded-lg font-bold ${MODE_META[justIssued.mode].chip}`}>
                {MODE_META[justIssued.mode].title.toUpperCase()}
              </span>
              <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold">
                {justIssued.scopes.join(' + ')}
              </span>
              <span className="text-slate-400">“{justIssued.name}”</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { const k = justIssued.plaintext; setTestKey(k); setJustIssued(null); runTest(k, 3); }}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition inline-flex items-center justify-center gap-2"
              >
                <Plug className="w-4 h-4" /> Test it now
              </button>
              <button
                onClick={() => setJustIssued(null)}
                className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition"
              >
                I&apos;ve saved it — done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeveloperApi;
