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
import { X, ShieldCheck, Loader2 } from 'lucide-react';

import { setPatientAbha } from '../api/patients';
import AbhaEnrolment from './AbhaEnrolment';

interface PatientAbhaModalProps {
  patient: {
    id: string;
    name: string;
    phone?: string | null;
    abhaNumber?: string | null;
    abhaAddress?: string | null;
  };
  onClose: () => void;
  onSaved: (identity: { abhaNumber: string | null; abhaAddress: string | null }) => void;
}

export default function PatientAbhaModal({ patient, onClose, onSaved }: PatientAbhaModalProps) {
  const [number, setNumber] = useState(patient.abhaNumber ?? '');
  const [address, setAddress] = useState(patient.abhaAddress ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Creating an ABHA is a different job from typing one in, so it replaces the
  // form rather than sitting beneath it — two sets of boxes for one outcome is
  // how a desk ends up filling in the wrong one.
  const [creating, setCreating] = useState(false);

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
              onCancel={() => setCreating(false)}
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

          {/* The whole point of the ask: a patient with no ABHA can get one
              here, rather than being turned away to a government portal. */}
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2">
              {patient.name} doesn&rsquo;t have an ABHA yet?
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-sm font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
            >
              Create one now &rarr;
            </button>
          </div>
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
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-bold rounded-xl cursor-pointer flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
