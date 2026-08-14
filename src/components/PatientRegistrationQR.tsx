import { useState } from 'react';
import QRCode from 'react-qr-code';
import { QrCode, Copy, Check, Share2 } from 'lucide-react';

// Patient self-registration, on the clinic's phone.
//
// The web dashboard has had this on the Patients tab for a while: a link and a
// QR that a patient scans to register themselves. On a phone it is arguably more
// useful than on a desktop — the receptionist can simply hold the screen up at
// the counter, and the patient scans it with their own camera.
//
// The QR is rendered LOCALLY (react-qr-code) rather than fetched from an image
// service the way the web panel does. The clinic's registration URL is its own
// identifier; there is no reason to hand it to a third party to draw squares,
// and it keeps working with no signal at the counter.

interface Props {
  clinicId: string;
}

export default function PatientRegistrationQR({ clinicId }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  // Same URL the web dashboard shares, built the same way.
  const url =
    clinicId && typeof window !== 'undefined'
      ? `${window.location.origin}/register?clinic=${clinicId}`
      : '';

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (older WebView / no permission): the field below is
      // selectable, so the link is still obtainable by hand.
    }
  };

  const share = async () => {
    if (!url) return;
    // The native share sheet is the fastest route to WhatsApp, which is how a
    // clinic actually sends this to a patient who is not standing at the desk.
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'Register as a patient', url });
        return;
      } catch {
        // Dismissed, or sharing unavailable — fall back to copying.
      }
    }
    void copy();
  };

  if (!url) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-slate-50 transition-colors"
      >
        <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <QrCode className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-slate-900 text-[14.5px]">Patient self-registration</span>
          <span className="block text-[12px] text-slate-400">
            {open ? 'Hold the screen up — the patient scans it' : 'Show a QR the patient can scan'}
          </span>
        </span>
        <span className="text-[13px] font-semibold text-emerald-600 shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* White quiet zone around the code — a QR on a tinted background is
              measurably harder for a phone camera to lock onto. */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex justify-center mb-3">
            <QRCode value={url} size={196} />
          </div>

          <p className="text-[12.5px] text-slate-500 leading-snug mb-3">
            The patient fills in their own details and appears in this list straight away, with a WhatsApp
            confirmation sent on submit.
          </p>

          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full text-[12px] px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-600 mb-2 focus:outline-none focus:border-emerald-500"
          />

          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-bold active:bg-slate-200 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={share}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold active:bg-emerald-700 transition-colors"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
