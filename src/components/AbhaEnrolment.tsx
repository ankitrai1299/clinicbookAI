// Creating an ABHA at the front desk, for a patient who does not have one.
//
// ── The patient must be standing there ─────────────────────────────────────
//
// The OTP goes to the mobile registered against their Aadhaar and nobody else
// can read it. This is not a form the desk can fill in later from a photocopy,
// and the screen says so before the Aadhaar box rather than after — a desk that
// types in a number and only then discovers the patient has gone home has been
// let down by the interface.
//
// ── What it says about Aadhaar ─────────────────────────────────────────────
//
// It states plainly that the number is not kept. Two reasons: it is true and
// worth committing to, and a person being asked for their Aadhaar at a counter
// deserves to be told what happens to it. The desk reads this line out more
// often than they will read anything else here.
//
// ── Consent is shown, not assumed ──────────────────────────────────────────
//
// The API call carries a consent flag. Sending that without the patient having
// been told what they are agreeing to would be a lie told to a government
// system, so the words appear on screen and the desk must tick them.

import { useState } from 'react';
import { Loader2, ShieldCheck, ArrowLeft, Smartphone, CheckCircle2, IdCard } from 'lucide-react';

import {
  startAbhaEnrolment,
  finishAbhaEnrolment,
  claimAbhaAddress,
  fetchAbhaCard,
} from '../api/patients';

interface AbhaEnrolmentProps {
  patient: { id: string; name: string; phone?: string | null };
  onCreated: (identity: { abhaNumber: string | null; abhaAddress: string | null }) => void;
  onCancel: () => void;
}

// The ABHA exists after 'otp'. 'address' is a THIRD step because ABDM's own
// enrolment hands back an address that is the ABHA number with the dashes
// removed — unusable over a phone. Choosing a readable one is a separate
// mandatory item in ABDM's M1 list, and this is where it happens.
type Step = 'aadhaar' | 'otp' | 'address';

export default function AbhaEnrolment({ patient, onCreated, onCancel }: AbhaEnrolmentProps) {
  const [step, setStep] = useState<Step>('aadhaar');
  const [aadhaar, setAadhaar] = useState('');
  const [consented, setConsented] = useState(false);
  const [txnId, setTxnId] = useState('');
  const [otp, setOtp] = useState('');
  const [mobile, setMobile] = useState(patient.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Held ONLY for the length of this flow. Nothing stores them — the ABHA token
  // is a credential to the patient's own national health account and expires in
  // about half an hour.
  const [created, setCreated] = useState<{
    abhaNumber: string | null;
    abhaAddress: string | null;
    txnId: string | null;
    abhaToken: string | null;
    suggestions: string[];
    alreadyExisted: boolean;
  } | null>(null);
  const [chosen, setChosen] = useState('');
  const [cardBusy, setCardBusy] = useState(false);

  const digits = aadhaar.replace(/\D/g, '');

  const sendOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await startAbhaEnrolment(patient.id, digits);
      setTxnId(started.txnId);
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the OTP.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await finishAbhaEnrolment(patient.id, { txnId, otp: otp.trim(), mobile });
      // Tell the parent straight away — the ABHA exists now, whatever happens
      // next. If the desk closes the dialog before choosing an address, the
      // number is already on the record.
      onCreated({ abhaNumber: done.abhaNumber, abhaAddress: done.abhaAddress });
      setCreated({
        abhaNumber: done.abhaNumber,
        abhaAddress: done.abhaAddress,
        txnId: done.txnId,
        abhaToken: done.abhaToken,
        suggestions: done.suggestions ?? [],
        alreadyExisted: done.alreadyExisted,
      });
      setChosen(done.suggestions?.[0] ?? '');
      setStep('address');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the enrolment.');
    } finally {
      setBusy(false);
    }
  };

  const claimAddress = async () => {
    if (!created?.txnId || !chosen.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await claimAbhaAddress(patient.id, {
        txnId: created.txnId,
        abhaAddress: chosen.trim(),
      });
      onCreated({ abhaNumber: saved.abhaNumber, abhaAddress: saved.abhaAddress });
      setCreated((c) => (c ? { ...c, abhaAddress: saved.abhaAddress } : c));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set that address.');
    } finally {
      setBusy(false);
    }
  };

  const getCard = async () => {
    if (!created?.abhaToken) return;
    setCardBusy(true);
    setError(null);
    try {
      const blob = await fetchAbhaCard(patient.id, created.abhaToken);
      // Opened in a tab rather than auto-downloaded: the desk usually wants to
      // show it to the patient or print it, not collect a file.
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download the card.');
    } finally {
      setCardBusy(false);
    }
  };

  if (step === 'address' && created) {
    return (
      <div className="space-y-5">
        {/* The ABHA already exists. Everything on this screen is optional, and
            the heading says so — otherwise the desk reads a form and assumes
            the job is unfinished. */}
        <div className="flex gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-emerald-900 leading-relaxed font-semibold">
              {created.alreadyExisted
                ? `${patient.name} already had an ABHA — it is now on their record.`
                : `ABHA created for ${patient.name}.`}
            </p>
            {created.abhaNumber && (
              <p className="text-sm font-mono text-emerald-800 mt-1.5">{created.abhaNumber}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Choose an ABHA address <span className="font-normal text-slate-400">&mdash; optional</span>
          </label>
          {/* Said plainly, because the address they already have looks like a
              mistake and a desk will otherwise think something went wrong. */}
          <p className="text-[11px] text-slate-500 mb-2.5">
            ABDM has given them <span className="font-mono">{created.abhaAddress || '—'}</span>,
            which is their number with the dashes removed. A readable one is easier
            to say and to remember.
          </p>

          {created.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {created.suggestions.slice(0, 6).map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setChosen(sug)}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border cursor-pointer ${
                    chosen === sug
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-sky-400'
                  }`}
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          <input
            value={chosen}
            onChange={(e) => setChosen(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase())}
            placeholder="asha.verma"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-sky-500"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            ABDM adds the rest itself &mdash; type only the name, not the @ part.
          </p>
        </div>

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 leading-relaxed">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <button
            onClick={getCard}
            disabled={cardBusy || !created.abhaToken}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
          >
            {cardBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <IdCard className="w-4 h-4" />}
            ABHA card
          </button>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer"
            >
              Done
            </button>
            <button
              onClick={claimAddress}
              disabled={busy || !chosen.trim()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Set address
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setStep('aadhaar')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div className="flex gap-3 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
          <Smartphone className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <p className="text-xs text-sky-900 leading-relaxed">
            An OTP has gone to the mobile registered with {patient.name}&rsquo;s Aadhaar.
            Ask them to read it out &mdash; it does not come to the clinic.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">OTP</label>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 digits"
            inputMode="numeric"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono tracking-[0.3em] focus:outline-none focus:border-sky-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">Mobile for the ABHA</label>
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10 digits"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-sky-500"
          />
          {/* Worth saying, because a desk will otherwise assume the OTP number
              is the answer and never ask. */}
          <p className="mt-1 text-[11px] text-slate-400">
            The number ABDM will contact them on. Often the same as the Aadhaar one, but it need not be.
          </p>
        </div>

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 leading-relaxed">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={verify}
            disabled={busy || otp.length < 4}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Create ABHA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Before the Aadhaar box, not after it. */}
      <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
        <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 leading-relaxed">
          The patient needs to be here. An OTP goes to the mobile registered
          against their Aadhaar, and only they can read it.
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">Aadhaar number</label>
        <input
          value={aadhaar}
          onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
          placeholder="12 digits"
          inputMode="numeric"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:border-sky-500"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          <span className="font-semibold">Not saved anywhere.</span> It is sent to ABDM
          encrypted and discarded &mdash; the clinic never keeps a copy.
        </p>
      </div>

      <label className="flex gap-2.5 items-start cursor-pointer">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 cursor-pointer"
        />
        <span className="text-[11px] text-slate-600 leading-relaxed">
          {patient.name} agrees to create an ABHA using their Aadhaar, and to ABDM
          verifying their identity with UIDAI for this purpose.
        </span>
      </label>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 leading-relaxed">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={sendOtp}
          disabled={busy || digits.length !== 12 || !consented}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Send OTP
        </button>
      </div>
    </div>
  );
}
