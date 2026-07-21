import { useEffect, useState } from 'react';
import NovaPhoneDemo from '../novascribe/v2/NovaPhoneDemo';

// Recording frame for the NovaScribe phone demo. It renders the SAME component
// the landing page uses, so the footage in a reel is literally the product shown
// on the site — nothing to keep in sync.
//
//   /demo/novascribe               16:9  — website, YouTube, decks
//   /demo/novascribe?format=9x16   9:16  — Reels / Status / Shorts
//   /demo/novascribe?format=1x1    1:1   — feed post
//   /demo/novascribe?speed=1.4     faster or slower
//
// Press H to hide the surrounding chrome before recording.

const FORMATS: Record<string, { w: number; h: number; label: string }> = {
  '16x9': { w: 1280, h: 720, label: '16:9 — website / YouTube' },
  '9x16': { w: 405, h: 720, label: '9:16 — Reels / Status' },
  '1x1': { w: 720, h: 720, label: '1:1 — feed post' },
};

export default function NovaScribeDemo() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const format = FORMATS[params.get('format') ?? '9x16'] ?? FORMATS['9x16'];
  const speed = Math.max(0.4, Math.min(3, Number(params.get('speed')) || 1));
  const [chrome, setChrome] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'h') setChrome((c) => !c); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isTall = format.h > format.w;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50 flex flex-col items-center justify-center p-6">
      {chrome && (
        <div className="text-center mb-5">
          <p className="text-sm font-bold text-slate-700">Screen-record this area →  {format.label}</p>
          <p className="text-xs text-slate-400 mt-1">
            Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">H</kbd> to hide this text ·
            <code className="text-[10px] ml-1">?speed=1.4</code> to speed up
          </p>
        </div>
      )}

      <div
        style={{ width: format.w, height: format.h }}
        className="relative max-w-full rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-emerald-50 via-white to-violet-100 flex items-center justify-center px-6"
      >
        <div className="absolute -top-20 -left-16 w-80 h-80 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute -bottom-20 -right-16 w-80 h-80 rounded-full bg-violet-200/40 blur-3xl" />

        <div className={`relative flex items-center gap-10 ${isTall ? 'flex-col gap-6' : ''}`}>
          {/* Caption — above the phone on vertical, beside it on wide */}
          <div className={isTall ? 'text-center max-w-[330px]' : 'w-[300px]'}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 mb-2">
              NovaScribe
            </div>
            <h2 className={`font-display font-extrabold text-slate-900 leading-tight ${isTall ? 'text-2xl' : 'text-3xl'}`}>
              Just talk. The note writes itself.
            </h2>
            {!isTall && (
              <p className="text-slate-600 mt-3 leading-relaxed">
                Record the consultation in any of 10 languages — each transcribed in its own script. The
                clinical note and prescription are ready before the patient stands up.
              </p>
            )}
          </div>

          <div className={isTall ? 'scale-[0.82] origin-top' : ''}>
            <NovaPhoneDemo speed={speed} showToasts={!isTall} autoPlayInView={false} />
          </div>
        </div>
      </div>

      {chrome && (
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {Object.entries(FORMATS).map(([k, f]) => (
            <a
              key={k}
              href={`?format=${k}`}
              className={`text-xs font-bold rounded-full px-4 py-2 border transition-colors ${
                f === format
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {f.label}
            </a>
          ))}
          <a
            href="/demo"
            className="text-xs font-bold rounded-full px-4 py-2 border bg-white text-emerald-700 border-emerald-200 hover:border-emerald-300"
          >
            ← ClinicBook demo
          </a>
        </div>
      )}
    </div>
  );
}
