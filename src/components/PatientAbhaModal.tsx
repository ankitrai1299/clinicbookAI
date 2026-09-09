// Recording a patient's ABHA — their national health identity.
//
// ── Why this screen has to explain itself ──────────────────────────────────
//
// A front desk has never heard of an ABHA address, and the two fields look
// interchangeable when they are not: the NUMBER is 14 digits on a card, the
// ADDRESS reads like an email. Typing one into the other's box is the obvious
// mistake, so each says plainly what it is and shows an example.
//
// Neither is required. Most patients will never have an ABHA, and the empty
// state says so — a blank field on a health record otherwise reads as work the
// desk has forgotten to do.
//
// ── Blank clears ───────────────────────────────────────────────────────────
//
// Same rule as the HFR and HPR ids. An ABHA has no format that catches "right
// format, wrong person", so a value typed onto the wrong patient can only be
// removed by hand — and if blank meant "leave alone", it never could be.

import { useState } from 'react';
import { X, ShieldCheck, Loader2, Share2, CheckCircle2, BadgeCheck } from 'lucide-react';

import {
  finishAbhaVerification,
  linkAbdmCareContexts,
  setPatientAbha,
  startAbhaVerification,
} from '../api/patients';
import AbhaEnrolment from './AbhaEnrolment';

interface PatientAbhaModalProps {
  patient: {
    id: string;
    name: string;
    phone?: string | null;
    abhaNumber?: string | null;
    abhaAddress?: string | null;
    /**
     * Sharing is offered only when this is true. An unverified ABHA is one the
     * patient typed at us, and pushing a clinic's records against it would
     * write THIS patient's visits into whoever the address really belongs to —
     * permanently, because a care context cannot be unlinked.
     */
    abhaVerified?: boolean | null;
  };
  onClose: () => void;
  onSaved: (identity: { abhaNumber: string | null; abhaAddress: string | null }) => void;
}

export default function PatientAbhaModal({ patient, onClose, onSaved }: PatientAbhaModalProps) {
  const hasAbhaOnOpen = Boolean(patient.abhaNumber || patient.abhaAddress);

  const [number, setNumber] = useState(patient.abhaNumber ?? '');
  const [address, setAddress] = useState(patient.abhaAddress ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Creating an ABHA is a different job from typing one in, so it replaces the
  // form rather than sitting beneath it — two sets of boxes for one outcome is
  // how a desk ends up filling in the wrong one.
  //
  // Open on it when there is no ABHA yet, because that is then the ONLY thing
  // this screen can usefully do. An identity is not something a desk keys in
  // from memory; it is created with the patient's own Aadhaar, and they are
  // standing there to read out the OTP.
  const [creating, setCreating] = useState(!hasAbhaOnOpen);

  // Sharing is a separate action with a separate outcome, so it keeps its own
  // busy flag and its own message. Folding it into `saving` would grey out the
  // Save button for something Save did not do.
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const hasAbha = Boolean(patient.abhaNumber || patient.abhaAddress);

  // ── Proving the ABHA ─────────────────────────────────────────────────────
  //
  // Its own state, and its own two steps, because the patient reads an OTP off
  // their own phone in between. Verified locally as well as on the server so
  // the panel can turn into the sharing panel without a reload.
  const [verified, setVerified] = useState(Boolean(patient.abhaVerified));
  const [verifyTxn, setVerifyTxn] = useState<string | null>(null);
  const [verifyOtp, setVerifyOtp] = useState('');
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const sendVerifyOtp = async () => {
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      const started = await startAbhaVerification(patient.id);
      setVerifyTxn(started.txnId);
      setVerifyNote(started.message ?? null);
    } catch (e) {
      // The server's wording matters here: "ABDM has no record of that ABHA
      // number" is something the desk can fix by reading the card again.
      setVerifyError(e instanceof Error ? e.message : 'Could not start verification.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const confirmVerifyOtp = async () => {
    if (!verifyTxn) return;
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      const saved = await finishAbhaVerification(patient.id, { txnId: verifyTxn, otp: verifyOtp.trim() });
      onSaved({ abhaNumber: saved.abhaNumber, abhaAddress: saved.abhaAddress });
      setVerified(true);
      setVerifyTxn(null);
      setVerifyOtp('');
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'Could not verify the ABHA.');
    } finally {
      setVerifyBusy(false);
    }
  };
  // An ABHA that came back from ABDM against the patient's own Aadhaar OTP.
  // Nothing on this screen can improve on it, and a box around it invites an
  // edit that could only make it wrong — so it is shown, not offered.
  // Reads the live flag, not the one the modal opened with, so the boxes lock
  // the moment verification succeeds rather than on the next reload.
  const locked = hasAbha && verified;

  const share = async () => {
    setSharing(true);
    setShareError(null);
    setShared(null);
    try {
      const result = await linkAbdmCareContexts(patient.id);
      setShared(result.message);
    } catch (e) {
      // The server's wording is the useful one: it distinguishes "no completed
      // visits" from "not verified" from ABDM refusing the patient outright.
      setShareError(e instanceof Error ? e.message : 'Could not share the visits.');
    } finally {
      setSharing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Both always sent, so clearing one works. Omitting an empty field would
      // mean "unchanged", and the desk could never take a wrong value out.
      const saved = await setPatientAbha(patient.id, {
        abhaNumber: number.trim(),
        abhaAddress: address.trim(),
      });
      onSaved({ abhaNumber: saved.abhaNumber, abhaAddress: saved.abhaAddress });
      onClose();
    } catch (e) {
      // The server's message is the useful one here — it names the other
      // patient when an ABHA is already on someone else's record.
      setError(e instanceof Error ? e.message : 'Could not save the ABHA.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-extrabold text-slate-950">ABHA identity</h2>
              <p className="text-xs text-slate-500 mt-0.5">{patient.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {creating ? (
          <div className="px-6 py-5">
            <AbhaEnrolment
              patient={patient}
              onCreated={(identity) => {
                onSaved(identity);
                onClose();
              }}
              onCancel={() => (hasAbhaOnOpen ? setCreating(false) : onClose())}
            />
          </div>
        ) : (
        <div className="px-6 py-5 space-y-5">
          {/* Said first, because a blank field on a health record otherwise
              reads as something the desk failed to fill in. */}
          <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            Optional. Most patients do not have an ABHA, and the clinic works
            exactly the same without one. It is only needed to share this
            patient&rsquo;s records with the government health network.
          </p>

          {locked ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
              <Fact label="ABHA number" value={patient.abhaNumber} />
              <Fact label="ABHA address" value={patient.abhaAddress} />
              <p className="text-[11px] text-emerald-700 font-semibold pt-1">
                Verified with Aadhaar by the patient.
              </p>
            </div>
          ) : (
          <>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">ABHA number</label>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="12-3456-7890-1234"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-sky-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">14 digits, printed on the patient&rsquo;s ABHA card.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">ABHA address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="asha@abdm"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-sky-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Reads like an email address. Different from the number above &mdash; a patient may have either or both.
            </p>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 leading-relaxed">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400">
            Clearing a box and saving removes that value.
          </p>
          </>
          )}

          {/* The whole point of the ask: a patient with no ABHA can get one
              here, rather than being turned away to a government portal.

              The question used to be asked flatly, and read as nonsense above a
              filled-in ABHA. It still has a use once one exists — running
              enrolment again on an ABHA ABDM already has returns that person's
              official name and year of birth, which is what linking is checked
              against — so the wording changes rather than the button vanishing. */}
          {!locked && (
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2">
              {hasAbha
                ? 'Details out of date? Running this again refreshes them from ABDM.'
                : `${patient.name} doesn’t have an ABHA yet?`}
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-sm font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
            >
              {hasAbha ? 'Confirm with Aadhaar' : 'Create one now'} &rarr;
            </button>
          </div>
          )}

          {/* ── Proving it is theirs ────────────────────────────────────────
              Only while it is unproven, and above sharing because it is the
              gate sharing waits on. An unverified ABHA is not a smaller
              version of a verified one — it does nothing at all. */}
          {hasAbha && !verified && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-700 mb-1">Confirm this ABHA is theirs</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Until it is confirmed, this ABHA does nothing &mdash; visits cannot be shared
                against it. ABDM sends a code to the mobile on the patient&rsquo;s Aadhaar, so they
                need to be here to read it out.
              </p>

              {verifyTxn ? (
                <div className="space-y-2">
                  <input
                    value={verifyOtp}
                    onChange={(e) => setVerifyOtp(e.target.value)}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    autoFocus
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-sky-500"
                  />
                  {verifyNote && <p className="text-[11px] text-slate-400">{verifyNote}</p>}
                  <button
                    type="button"
                    onClick={confirmVerifyOtp}
                    disabled={verifyBusy || verifyOtp.trim().length < 4}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
                  >
                    {verifyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                    Confirm
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={sendVerifyOtp}
                  disabled={verifyBusy || !patient.abhaNumber}
                  className="px-4 py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
                  title={patient.abhaNumber ? undefined : 'Needs the 14-digit ABHA number from the card'}
                >
                  {verifyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                  {verifyBusy ? 'Sending…' : 'Send code to the patient'}
                </button>
              )}

              {verifyError && (
                <p className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 leading-relaxed">
                  {verifyError}
                </p>
              )}
            </div>
          )}

          {/* ── Sharing the visits ──────────────────────────────────────────
              Below the identity, and only once there IS one, because it is the
              thing the identity is FOR. Absent entirely for an unverified ABHA:
              a disabled button invites the desk to look for the way to enable
              it, and the way is to check the card, not to click harder. */}
          {hasAbha && verified && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-700 mb-1">
                Share visits with the national health record
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Completed visits at this clinic become visible to {patient.name} in
                their ABHA app, and to any doctor they choose to show them to.
                This cannot be undone &mdash; a shared visit stays in their record.
              </p>

              {shared ? (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
                  {shared}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={share}
                  disabled={sharing}
                  className="px-4 py-2 border border-sky-200 text-sky-700 hover:bg-sky-50 disabled:opacity-50 text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
                >
                  {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  {sharing ? 'Sharing…' : 'Share visits'}
                </button>
              )}

              {shareError && (
                <p className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 leading-relaxed">
                  {shareError}
                </p>
              )}
            </div>
          )}
        </div>
        )}

        {!creating && (
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          {!locked && (
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/** One read-only value, for an ABHA nobody here should be editing. */
const Fact = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-sm font-mono text-slate-800">{value || '—'}</p>
  </div>
);
