import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { MessageCircle, Copy, Check, QrCode } from 'lucide-react';

import { getWhatsAppLink, type WhatsAppLink } from '../api/whatsappLink';

// "Share your WhatsApp link" — the zero-Meta-setup onboarding. Each clinic shows
// its own join code + QR + link; patients scan/open it and every message routes
// to THIS clinic (see the shared-number binding on the backend).
export default function WhatsAppShareCard() {
  const [data, setData] = useState<WhatsAppLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWhatsAppLink()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e?.message || 'Failed to load your WhatsApp link'));
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = (value: string, which: 'code' | 'link') => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="mt-6 border border-emerald-100 bg-emerald-50/40 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle size={18} className="text-emerald-600" />
        <h3 className="font-display font-black text-sm text-slate-950">Share your WhatsApp link — no Meta setup</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Patients scan this QR (or open the link) and message you on our shared WhatsApp number — every message reaches
        <span className="font-semibold"> only your clinic</span>. Nothing to set up on Facebook/Meta.
      </p>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      {!error && !data && <div className="text-sm text-slate-400">Loading your link…</div>}

      {data && (
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          {/* QR */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex-shrink-0">
            {data.link ? (
              <QRCode value={data.link} size={140} />
            ) : (
              <div className="w-[140px] h-[140px] flex items-center justify-center text-center text-[10px] text-slate-400 px-2">
                <span><QrCode size={20} className="mx-auto mb-1" />QR available once the shared number is configured</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Your clinic code</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono font-extrabold text-2xl text-emerald-700 tracking-widest">{data.joinCode}</span>
                <button
                  onClick={() => copy(data.joinCode, 'code')}
                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-lg"
                  title="Copy code"
                >
                  {copied === 'code' ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Patients send "<span className="font-mono">{data.prefillText}</span>" to start.</div>
            </div>

            {data.link && (
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Shareable link</div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    readOnly
                    value={data.link}
                    className="flex-1 min-w-0 text-xs font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={() => copy(data.link!, 'link')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                  >
                    {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
                    {copied === 'link' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {!data.sharedNumber && (
              <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                Shared WhatsApp number isn't configured yet — the code works, the QR/link will appear once it's set.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
