import React, { useEffect, useState } from 'react';
import { Shield, ShieldCheck, LogOut, AlertCircle, Copy, Check } from 'lucide-react';

import { disableMfa, enableMfa, getMfaStatus, setupMfa, signOutEverywhere } from '../api/auth';
import { useAuth } from '../context/AuthContext';

// The "Security" tab: two-factor authentication, and ending every session.
//
// Enrolment is two steps and the screen shows both, because the failure it
// prevents is the expensive one: if turning MFA on did not require proving a
// code first, anyone whose QR scan silently failed would be locked out of their
// own clinic with no way back in.
//
// The QR is rendered as a link rather than an image on purpose. Drawing one
// needs a QR library, and the artifact CSP plus our own no-new-dependency
// preference make the secret-typed-in path the reliable one — every
// authenticator app supports manual entry, and the otpauth:// link opens the app
// directly on a phone.

interface Props {
  /** Called after sign-out-everywhere, so the host can return to the login screen. */
  onSignedOut?: () => void;
}

export default function SecuritySettings({ onSignedOut }: Props) {
  const { user, logout } = useAuth();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getMfaStatus()
      .then((s) => setEnabled(s.mfaEnabled))
      .catch(() => setEnabled(false));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () => run(async () => setSetup(await setupMfa()));

  const confirmEnable = () =>
    run(async () => {
      await enableMfa(code);
      setEnabled(true);
      setSetup(null);
      setCode('');
    });

  const turnOff = () =>
    run(async () => {
      await disableMfa(code);
      setEnabled(false);
      setCode('');
    });

  const endAllSessions = () =>
    run(async () => {
      await signOutEverywhere();
      // This session is one of the ones just ended, so the local token is now
      // dead. Clearing it here means the user sees the login screen instead of a
      // wall of 401s.
      logout();
      onSignedOut?.();
    });

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Two-factor authentication ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
            {enabled ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900">Two-factor authentication</h3>
            <p className="text-sm text-slate-500 mt-1">
              A 6-digit code from an authenticator app, on top of your password. Without it, anyone who
              learns your password has your clinic's records for a week.
            </p>
            {enabled !== null && (
              <p className={`text-xs font-semibold mt-2 ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                {enabled ? 'On for this account' : 'Off'}
              </p>
            )}
          </div>
        </div>

        {/* Step 1 → 2: a secret is generated, then a code proves it works. */}
        {enabled === false && !setup && (
          <button
            onClick={startSetup}
            disabled={busy}
            className="mt-4 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white font-semibold rounded-xl text-sm cursor-pointer"
          >
            Set up
          </button>
        )}

        {setup && (
          <div className="mt-5 space-y-4">
            <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
              <li>Open an authenticator app (Google Authenticator, Authy, 1Password…).</li>
              <li>Add an account and paste the key below, or open the link on this phone.</li>
              <li>Enter the 6-digit code it shows.</li>
            </ol>

            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono break-all">
                {setup.secret}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(setup.secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                aria-label="Copy the setup key"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <a
              href={setup.otpauthUrl}
              className="inline-block text-sm text-sky-600 hover:text-sky-700 underline"
            >
              Open in your authenticator app
            </a>

            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                inputMode="numeric"
                placeholder="000000"
                className="flex-1 text-center tracking-[0.4em] font-mono px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                aria-label="Code from your authenticator app"
              />
              <button
                onClick={confirmEnable}
                disabled={busy || code.length !== 6}
                className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Turn on
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Nothing changes until that code is accepted — if the scan did not work, you are not locked out.
            </p>
          </div>
        )}

        {enabled === true && (
          <div className="mt-5 space-y-2">
            <p className="text-xs text-slate-500">
              To turn it off, enter a current code. Asking for one here too is deliberate: otherwise anyone
              at your unlocked screen could remove it.
            </p>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                inputMode="numeric"
                placeholder="000000"
                className="flex-1 text-center tracking-[0.4em] font-mono px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                aria-label="Code from your authenticator app"
              />
              <button
                onClick={turnOff}
                disabled={busy || code.length !== 6}
                className="px-4 py-2.5 border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 font-semibold rounded-xl text-sm cursor-pointer"
              >
                Turn off
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-4">
          Note: the MediScribe Android app cannot ask for a code yet. If you sign in there, leave this off
          until it can.
        </p>
      </section>

      {/* ── Sessions ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
            <LogOut className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900">Sign out everywhere</h3>
            <p className="text-sm text-slate-500 mt-1">
              Ends every signed-in session for {user?.email ?? 'this account'} — this browser, every other
              browser, and the phone apps. Use it if a device was lost or shared.
            </p>
          </div>
        </div>
        <button
          onClick={endAllSessions}
          disabled={busy}
          className="mt-4 px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 font-semibold rounded-xl text-sm cursor-pointer"
        >
          Sign out everywhere
        </button>
      </section>
    </div>
  );
}
