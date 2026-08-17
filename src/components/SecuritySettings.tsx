import React, { useEffect, useState } from 'react';
import { Shield, ShieldCheck, LogOut, AlertCircle, Copy, Check, Smartphone } from 'lucide-react';

import {
  createAppPassword,
  disableMfa,
  enableMfa,
  getMfaStatus,
  listAppPasswords,
  revokeAppPassword,
  setupMfa,
  signOutEverywhere,
  type AppPasswordRow,
} from '../api/auth';
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

  // Device passwords, for the app that cannot ask for a code.
  const [devices, setDevices] = useState<AppPasswordRow[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [issued, setIssued] = useState<{ plaintext: string } | null>(null);

  useEffect(() => {
    getMfaStatus()
      .then((s) => setEnabled(s.mfaEnabled))
      .catch(() => setEnabled(false));
    listAppPasswords()
      .then(setDevices)
      .catch(() => setDevices([]));
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

  const createDevice = () =>
    run(async () => {
      const created = await createAppPassword(deviceName);
      // Held in state ONLY so it can be copied — it is never fetched again.
      setIssued({ plaintext: created.plaintext });
      setDeviceName('');
      setDevices(await listAppPasswords());
    });

  const revokeDevice = (id: string) =>
    run(async () => {
      await revokeAppPassword(id);
      // The server ends every session on revoke, so this one is already dead —
      // clearing locally means the login screen instead of a wall of 401s.
      logout();
      onSignedOut?.();
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
          The MediScribe Android app cannot ask for a code. To keep using it with two-factor on, create a
          device password below and sign in there with that.
        </p>
      </section>

      {/* ── App passwords ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900">Device passwords</h3>
            <p className="text-sm text-slate-500 mt-1">
              For the MediScribe Android app, which cannot ask for a 6-digit code. Sign in there with your
              email and the device password instead of your real one.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              A device password skips the second factor, so treat it like a key to that one phone: give
              each device its own, and revoke it the moment the device is lost.
            </p>
          </div>
        </div>

        {/* The plaintext exists only in the response that created it. */}
        {issued && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm font-semibold text-amber-900">Copy this now — it is not shown again.</p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 px-3 py-2.5 bg-white border border-amber-200 rounded-lg text-sm font-mono break-all">
                {issued.plaintext}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.plaintext);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="px-3 py-2.5 border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-100 cursor-pointer"
                aria-label="Copy the device password"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={() => setIssued(null)}
              className="mt-3 text-xs font-semibold text-amber-800 hover:text-amber-900 cursor-pointer"
            >
              I have copied it
            </button>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Which device? e.g. Dr Rao's phone"
            maxLength={60}
            className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-sky-500"
            aria-label="Device name"
          />
          <button
            onClick={createDevice}
            disabled={busy || !deviceName.trim()}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold rounded-xl text-sm cursor-pointer whitespace-nowrap"
          >
            Create
          </button>
        </div>

        {devices.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{d.name}</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {d.prefix}…{' '}
                    <span className="font-sans">
                      {d.lastUsedAt ? `last used ${new Date(d.lastUsedAt).toLocaleDateString()}` : 'never used'}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => revokeDevice(d.id)}
                  disabled={busy}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-slate-400 mt-3">
          Revoking a device also signs this account out everywhere — someone revoking a device is usually
          doing it because it was lost, and leaving its existing session alive would defeat the point.
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
