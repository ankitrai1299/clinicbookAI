// The ABHA part of registering yourself — the patient's own hands, no desk.
//
// ── Reached only by choosing it ────────────────────────────────────────────
//
// This is one of two ways to register, picked on the screen before. That is why
// there is no "optional" label here and no collapsed state: someone arriving at
// this panel has already said they want it, and hedging at them now would only
// read as doubt.
//
// The choice HAS to come before the Aadhaar, and that is not a layout
// preference. ABDM gives us no way to check an Aadhaar without also creating or
// finding an ABHA — one call does both — so by the time anyone could be asked
// "and do you want the ABHA?", they would already have one, and it cannot be
// undone. The question therefore belongs on the previous screen.
//
// Every state still keeps a way back to the ordinary form. ABHA is voluntary
// under NHA's own rules, and a patient whose OTP never arrives must still be
// able to register and be seen.
//
// ── What leaves this component ─────────────────────────────────────────────
//
// A txnId. Not the ABHA, not the Aadhaar, not the name — the form posts the id
// and the server reads back what the OTP actually proved. Handing the browser
// an ABHA to send at registration would be handing anyone the ability to claim
// one.

import { useState, type ReactNode } from 'react';
import { ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';

import { ApiError } from '../api/client';
import { startPublicAbhaOtp, verifyPublicAbhaOtp } from '../api/publicRegistration';

type Stage = 'aadhaar' | 'otp' | 'done';

interface PublicAbhaStepProps {
  clinicId: string;
  /**
   * Called once the OTP has been accepted. The txnId is what registration
   * quotes; the name is ABDM's, shown so the patient can confirm it is theirs.
   */
  onVerified: (result: {
    txnId: string;
    name?: string;
    gender?: string;
    yearOfBirth?: string;
    /** Passed back so the registration form does not ask for it twice. */
    mobile: string;
  }) => void;
  /** Back to the ordinary form — from any state, including mid-OTP. */
  onCancel: () => void;
}

const boxClass =
  'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono tracking-wide focus:outline-none focus:border-sky-500';

export default function PublicAbhaStep({ clinicId, onVerified, onCancel }: PublicAbhaStepProps) {
  const [stage, setStage] = useState<Stage>('aadhaar');
  const [aadhaar, setAadhaar] = useState('');
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState('');
  /**
   * ABDM wants the mobile alongside the Aadhaar, and refuses an empty one with
   * "Invalid Mobile Number" — a message that makes no sense on a form which has
   * not asked for a phone yet.
   *
   * Asked here rather than left to the form below, because registration needs a
   * phone anyway: taking it now means it is asked once instead of twice, and
   * the box that caused the error is the box the error is about.
   */
  const [mobile, setMobile] = useState('');
  const [txnId, setTxnId] = useState('');
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [result, setResult] = useState<{ abhaNumber: string | null; name?: string; existed: boolean } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = aadhaar.replace(/\D/g, '');
  const mobileDigits = mobile.replace(/\D/g, '').slice(-10);

  const fail = (e: unknown, fallback: string) =>
    setError(e instanceof ApiError ? e.message : fallback);

  const sendOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await startPublicAbhaOtp(clinicId, digits);
      setTxnId(started.txnId);
      setSentTo(started.message);
      setStage('otp');
    } catch (e) {
      fail(e, 'Could not send the OTP. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const verified = await verifyPublicAbhaOtp(clinicId, { txnId, otp: otp.trim(), mobile: mobileDigits });
      setResult({
        abhaNumber: verified.abhaNumber,
        name: verified.name,
        existed: verified.alreadyExisted
      });
      setStage('done');
      onVerified({
        txnId: verified.txnId,
        name: verified.name,
        gender: verified.gender,
        yearOfBirth: verified.yearOfBirth,
        mobile: mobileDigits
      });
    } catch (e) {
      fail(e, 'That OTP was not accepted. Please check and try again.');
    } finally {
      setBusy(false);
    }
  };

  // ── Verified ─────────────────────────────────────────────────────────────
  if (stage === 'done' && result) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {/* "Found" and "created" are different events for the patient, and
              saying "created" about an ABHA they have had for years is the kind
              of small wrongness that costs trust in everything else on screen. */}
          {result.existed ? 'ABHA found' : 'ABHA created'}
        </p>
        {result.name && (
          <p className="text-xs text-emerald-700 mt-1">
            {result.name}
            {result.abhaNumber ? ` · ${result.abhaNumber}` : ''}
          </p>
        )}
        <p className="text-[11px] text-emerald-600 mt-2 leading-relaxed">
          Your name and age will be taken from your Aadhaar record. Finish the form below to
          complete your registration.
        </p>
      </div>
    );
  }

  // ── Aadhaar, then OTP ────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-slate-800">Your ABHA health ID</p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            Already have an ABHA? Enter your Aadhaar and we will find it. If you don&rsquo;t have
            one, this creates it.
          </p>
        </div>
      </div>

      {stage === 'aadhaar' && (
        <>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="abha-mobile">
              Mobile number
            </label>
            <input
              id="abha-mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="10 digits"
              className={boxClass}
            />
            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              Use the number registered on your Aadhaar — the OTP goes there. This is also where
              the clinic will message you.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="abha-aadhaar">
              Aadhaar number
            </label>
            <input
              id="abha-aadhaar"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="12 digits"
              className={boxClass}
            />
            {/* Said where the number is typed, not in a policy page nobody
                opens. It is also simply true — it is encrypted for ABDM and
                never written down. */}
            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              Not saved anywhere. It is sent to ABDM encrypted and discarded — the clinic never
              keeps a copy. An OTP goes to the mobile registered on your Aadhaar.
            </p>
          </div>

          <label className="flex gap-2 items-start text-[11px] text-slate-600 leading-relaxed cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 cursor-pointer"
            />
            <span>
              I agree to create or find my ABHA using my Aadhaar, and to ABDM verifying my identity
              with UIDAI for this purpose.
            </span>
          </label>

          {error && <Problem>{error}</Problem>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={sendOtp}
              disabled={busy || digits.length !== 12 || mobileDigits.length !== 10 || !consent}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Send OTP
            </button>
            <SkipButton onClick={onCancel} />
          </div>
        </>
      )}

      {stage === 'otp' && (
        <>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="abha-otp">
              OTP
            </label>
            <input
              id="abha-otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digits"
              className={boxClass}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {sentTo ?? 'Sent to the mobile registered on your Aadhaar.'}
            </p>
          </div>

          {error && <Problem>{error}</Problem>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={verify}
              disabled={busy || otp.trim().length < 4}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify
            </button>
            <SkipButton onClick={onCancel} />
          </div>
        </>
      )}
    </div>
  );
}

const Problem = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 leading-relaxed">
    {children}
  </p>
);

/**
 * A way out of every state.
 *
 * Present even mid-OTP, because the commonest reason to be stuck here is a
 * message that never arrives — and someone standing in a waiting room with a
 * phone that will not receive an OTP still needs to be registered and seen.
 */
const SkipButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
  >
    Fill the form instead
  </button>
);
