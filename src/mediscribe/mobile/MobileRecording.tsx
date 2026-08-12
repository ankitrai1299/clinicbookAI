import React from 'react';
import { ChevronDown, Mic, Pause, Play, Square, Bookmark, Check } from 'lucide-react';
import { usePrefs } from './prefs';

// The recording screen, phone only.
//
// While a consultation is being recorded the doctor is not reading a form — they
// are with a patient, glancing at the phone to confirm it is still listening. So
// this is a full-screen takeover on the native app's own night gradient, with
// three things large enough to read at arm's length: that it IS listening, how
// long for, and how to stop.
//
// It renders OVER the shared consultation workspace, which keeps owning the
// recording itself. Nothing about the audio, the transcript or the report
// changes here — this is the same session, shown the way the native app shows it.

interface MobileRecordingProps {
  patientName?: string;
  /** Seconds elapsed, owned by the workspace. */
  seconds: number;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const mmss = (total: number): string => {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** The pulsing orb: a gradient core with rings breathing out of it. */
const MicOrb = ({ active }: { active: boolean }) => (
  <div className="relative flex items-center justify-center" style={{ width: 218, height: 218 }}>
    {active &&
      [0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute rounded-full border border-[rgba(108,99,255,0.5)]"
          style={{
            width: 104,
            height: 104,
            animation: 'ms-orb-ring 1.8s ease-out infinite',
            animationDelay: `${i * 0.6}s`
          }}
        />
      ))}
    <span
      className="relative rounded-full flex items-center justify-center"
      style={{
        width: 104,
        height: 104,
        background: 'linear-gradient(135deg, #6E6FEE, #5B5CEB)',
        boxShadow: '0 5px 14px rgba(17,24,39,0.06)'
      }}
    >
      <Mic size={44} className="text-white" />
    </span>
  </div>
);

/** Level bars. Decorative on purpose — see the note in the component below. */
const Waveform = ({ active }: { active: boolean }) => (
  <div className="flex items-end justify-center gap-[3px] w-full" style={{ height: 34 }}>
    {Array.from({ length: 34 }).map((_, i) => (
      <span
        key={i}
        className="flex-1 rounded-full"
        style={{
          height: `${20 + Math.abs(Math.sin(i * 0.7)) * 80}%`,
          backgroundColor: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
          animation: active ? 'ms-wave 1.1s ease-in-out infinite' : undefined,
          animationDelay: `${(i % 8) * 0.09}s`
        }}
      />
    ))}
  </div>
);

const ControlButton = ({
  icon,
  label,
  onClick,
  highlight
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) => (
  <button onClick={onClick} className="flex flex-col items-center active:scale-95 transition-transform">
    <span
      className={`w-16 h-16 rounded-full flex items-center justify-center border ${
        highlight ? 'bg-[#22C55E]/25 border-[#22C55E]/40 text-[#22C55E]' : 'bg-white/10 border-white/15 text-white'
      }`}
    >
      {icon}
    </span>
    <span className="text-white/70 text-[12px] font-semibold mt-2">{label}</span>
  </button>
);

export default function MobileRecording({
  patientName,
  seconds,
  isPaused,
  onPause,
  onResume,
  onStop
}: MobileRecordingProps) {
  const { t } = usePrefs();
  const [marked, setMarked] = React.useState(false);

  // Marking is FEEDBACK ONLY, exactly as in the native app: it flashes to
  // acknowledge the tap and nothing reads it afterwards. Keeping a count would
  // be write-only state, and a doctor seeing a number rise would fairly assume
  // the marks land somewhere in the note.
  const mark = () => {
    setMarked(true);
    setTimeout(() => setMarked(false), 1200);
  };

  return (
    <div
      className="ms-phone fixed inset-0 z-[60] flex flex-col"
      style={{ background: 'linear-gradient(180deg, #0F1730 0%, #171F3D 55%, #1E2547 100%)' }}
    >
      <style>{`
        @keyframes ms-orb-ring {
          0% { transform: scale(1); opacity: 0.55; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        @keyframes ms-wave {
          0%, 100% { transform: scaleY(0.55); }
          50% { transform: scaleY(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ms-phone [style*="ms-orb-ring"], .ms-phone [style*="ms-wave"] { animation: none !important; }
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pb-1"
        style={{ paddingTop: 'calc(8px + min(env(safe-area-inset-top), 24px))' }}
      >
        <button
          onClick={onStop}
          aria-label={t('recording.stop')}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          <ChevronDown size={22} />
        </button>
        <div className="text-center min-w-0 px-2">
          <div className="text-white font-bold text-[15px] truncate">{t('recording.title')}</div>
          {patientName && <div className="text-white/50 text-[12px] mt-0.5 truncate">{patientName}</div>}
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
            isPaused ? 'bg-[#F59E0B]/20' : 'bg-[#EF4444]/20'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'}`} />
          <span
            className={`text-[11px] font-bold uppercase tracking-wide ${
              isPaused ? 'text-[#F59E0B]' : 'text-[#EF4444]'
            }`}
          >
            {isPaused ? t('recording.paused') : t('recording.live')}
          </span>
        </div>
      </div>

      {/* Orb, timer, waveform, controls — one centred group, so the buttons rise
          to meet the waveform instead of leaving a dead band beneath it. */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="flex flex-col items-center">
          <MicOrb active={!isPaused} />
          <p className="text-white/60 text-[13px] font-medium mt-3">
            {isPaused ? t('recording.paused') : t('recording.listening')}
          </p>
          <p className="text-white text-[44px] font-bold tracking-tight tabular-nums mt-1">{mmss(seconds)}</p>
          <div className="w-full px-10 mt-2">
            <Waveform active={!isPaused} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-10 mt-12">
          <ControlButton
            icon={isPaused ? <Play size={26} /> : <Pause size={26} />}
            label={isPaused ? t('recording.resume') : t('recording.pause')}
            onClick={isPaused ? onResume : onPause}
          />

          <button onClick={onStop} className="flex flex-col items-center active:scale-95 transition-transform">
            <span
              className="w-[76px] h-[76px] rounded-full flex items-center justify-center text-white"
              style={{
                background: 'linear-gradient(135deg, #FB7185, #EF4444)',
                boxShadow: '0 8px 20px rgba(239,68,68,0.6)'
              }}
            >
              <Square size={30} fill="currentColor" />
            </span>
            <span className="text-white/70 text-[12px] font-semibold mt-2">{t('recording.stop')}</span>
          </button>

          <ControlButton
            icon={marked ? <Check size={26} /> : <Bookmark size={26} />}
            label={t('recording.mark')}
            onClick={mark}
            highlight={marked}
          />
        </div>
      </div>

      <p
        className="text-center text-white/35 text-[12px] px-8"
        style={{ paddingBottom: 'calc(16px + min(env(safe-area-inset-bottom), 12px))' }}
      >
        {t('recording.hint')}
      </p>
    </div>
  );
}
