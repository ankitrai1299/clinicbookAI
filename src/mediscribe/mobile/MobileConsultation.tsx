import React from 'react';
import { ArrowLeft, Mic, MoreVertical, UploadCloud, FileText, Share2 } from 'lucide-react';
import { usePrefs } from './prefs';

// The consultation screen BEFORE anything has been recorded, phone only.
//
// The web workspace puts a language dropdown, an empty transcript pane and an
// upload control on screen at once. On a phone, at the start of a visit, there
// is exactly one thing to do: press the mic. So that is what this screen is —
// one large target, with everything else moved into the ⋮ menu.
//
// Shown only while there is no transcript and nothing is recording. The moment
// either changes, the shared workspace (or the recording takeover) takes over,
// so nothing about how a consultation is captured or written changes here.

interface MobileConsultationProps {
  patientName?: string;
  /** The session's own date, as the workspace already formats it. */
  date?: string;
  status?: string;
  onBack: () => void;
  onStart: () => void;
  onUpload: () => void;
  /** Absent when there is nothing to share yet. */
  onShare?: () => void;
}

export default function MobileConsultation({
  patientName,
  date,
  status,
  onBack,
  onStart,
  onUpload,
  onShare
}: MobileConsultationProps) {
  const { t } = usePrefs();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const completed = (status || '').toLowerCase() === 'completed';

  return (
    <div className="ms-phone fixed inset-0 z-[55] bg-[#FAFBFC] flex flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 pb-3 bg-[#FAFBFC]"
        style={{ paddingTop: 'calc(10px + min(env(safe-area-inset-top), 24px))' }}
      >
        <button
          onClick={onBack}
          aria-label={t('consult.back')}
          className="w-9 h-9 shrink-0 rounded-full bg-white border border-[#E8ECF2] flex items-center justify-center text-slate-700 shadow-[0_1px_6px_rgba(17,24,39,0.04)]"
        >
          <ArrowLeft size={19} />
        </button>

        <div className="flex-1 min-w-0 mr-0.5">
          <div className="text-[19px] font-bold text-slate-900 tracking-tight truncate">
            {patientName || t('consult.newConsultation')}
          </div>
          {date && <div className="text-[12.5px] text-slate-400 truncate">{date}</div>}
        </div>

        {/* One shrink-0 group, so the NAME is what yields when space runs out —
            otherwise the controls get pushed off the right edge and the ⋮ menu
            becomes unreachable. */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
              completed ? 'bg-[#ECFAF1] text-[#16A34A]' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {completed ? t('status.Completed') : t('status.Draft')}
          </span>

          {onShare && (
            <button
              onClick={onShare}
              aria-label={t('consult.share')}
              className="w-9 h-9 rounded-full bg-white border border-[#E8ECF2] flex items-center justify-center text-slate-600 shadow-[0_1px_6px_rgba(17,24,39,0.04)]"
            >
              <Share2 size={17} />
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t('consult.more')}
              aria-expanded={menuOpen}
              className="w-9 h-9 rounded-full bg-white border border-[#E8ECF2] flex items-center justify-center text-slate-600 shadow-[0_1px_6px_rgba(17,24,39,0.04)]"
            >
              <MoreVertical size={18} />
            </button>

            {menuOpen && (
              <>
                {/* Tap-away layer, so the menu closes the way a native one does. */}
                <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-20 w-[288px] bg-white rounded-2xl border border-[#E8ECF2] shadow-[0_10px_30px_rgba(17,24,39,0.12)] overflow-hidden">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onUpload();
                    }}
                    className="w-full flex items-start gap-3 p-4 text-left active:bg-slate-50 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-xl bg-[#EEEFFE] text-[#5B5CEB] flex items-center justify-center flex-shrink-0">
                      <UploadCloud size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-900 text-[15px]">{t('consult.uploadTitle')}</span>
                      <span className="block text-[12.5px] text-slate-400 leading-snug mt-0.5">
                        {t('consult.uploadBody')}
                      </span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-5">
        <div className="flex items-center gap-2 text-slate-900">
          <FileText size={17} className="text-[#5B5CEB]" />
          <span className="text-[16px] font-bold tracking-tight">{t('consult.transcript')}</span>
        </div>
      </div>

      {/* One thing to do. */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-10">
        <button
          onClick={onStart}
          aria-label={t('consult.startTitle')}
          className="w-[120px] h-[120px] rounded-full bg-[#EF4444] text-white flex items-center justify-center shadow-[0_10px_28px_rgba(239,68,68,0.35)] active:scale-95 transition-transform"
        >
          <Mic size={46} />
        </button>
        <p className="text-[22px] font-bold text-slate-900 tracking-tight mt-7 text-center">
          {t('consult.startTitle')}
        </p>
        <p className="text-[14.5px] text-slate-400 mt-1.5 text-center leading-snug">{t('consult.startBody')}</p>
      </div>
    </div>
  );
}
