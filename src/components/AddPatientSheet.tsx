import { useState } from 'react';
import { X, Loader2, UserPlus, AlertTriangle, MessageCircle } from 'lucide-react';
import { createPatient, type ApiPatient } from '../api/patients';

// Add a walk-in patient from the phone, without opening the full dashboard.
//
// The QR next to it covers patients who register themselves; this covers the
// ones standing at the desk who won't. Same endpoint the web uses, so a patient
// added here is identical to one added there.

interface Props {
  /** Already-loaded patients — used to warn about a number that is already on file. */
  existing: ApiPatient[];
  onClose: () => void;
  onAdded: (patient: ApiPatient) => void;
}

// What the clinic's WhatsApp messages will be written in. The backend stores it
// per patient and every reminder follows it.
const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Bengali', 'Tamil', 'Telugu', 'Kannada'];

const digitsOf = (s: string) => (s || '').replace(/\D/g, '');

export default function AddPatientSheet({ existing, onClose, onAdded }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState('English');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = digitsOf(phone);
  // The backend does NOT reject a repeated number, so without this the desk can
  // quietly create a second record for a patient who is already on file — and
  // their history then splits across two rows.
  const duplicate =
    digits.length >= 10
      ? existing.find((p) => digitsOf(p.phone).endsWith(digits.slice(-10)))
      : undefined;

  const valid = name.trim().length >= 2 && digits.length >= 10;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createPatient({ name: name.trim(), phone: phone.trim(), language });
      onAdded(created);
      onClose();
    } catch (err) {
      // Show the server's own reason — "failed to add" tells the desk nothing
      // they can act on.
      setError(err instanceof Error ? err.message : 'Could not add the patient. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />

      <div className="relative bg-white rounded-t-3xl w-full max-h-[90vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="sticky top-0 bg-white px-5 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-slate-900">Add patient</h2>
            <p className="text-[12px] text-slate-400">Walk-in registration</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 space-y-4">
          <label className="block">
            <span className="block text-[12.5px] font-medium text-slate-500 mb-1.5">Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Patient's name"
              autoFocus
              className="w-full px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-medium text-slate-500 mb-1.5">Mobile number</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              inputMode="tel"
              className="w-full px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </label>

          {duplicate && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[12.5px] text-amber-900 leading-snug">
                <span className="font-bold">{duplicate.name}</span> is already registered with this number.
                Adding again creates a second record and splits their history.
              </p>
            </div>
          )}

          <div>
            <span className="block text-[12.5px] font-medium text-slate-500 mb-2">WhatsApp language</span>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                    language === l ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Adding a patient TEXTS them. The desk should know that before they
              tap save, not discover it from the patient. */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50">
            <MessageCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-slate-500 leading-snug">
              A WhatsApp confirmation with their patient code is sent to this number on save.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-700">{error}</div>
          )}

          <button
            onClick={save}
            disabled={!valid || saving}
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-[15px] disabled:opacity-50 active:bg-emerald-700 transition-colors"
          >
            {saving ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <UserPlus className="w-4.5 h-4.5" />}
            {saving ? 'Adding…' : 'Add patient'}
          </button>
        </div>
      </div>
    </div>
  );
}
