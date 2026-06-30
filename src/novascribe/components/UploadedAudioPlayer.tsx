import React, { useRef, useState, useEffect } from 'react';
import { FileText, Play, Pause, MoreVertical, Download, Gauge, Trash2, Check, Volume2, VolumeX } from 'lucide-react';

// Custom player for the uploaded session audio. Uses a hidden native <audio>
// element for actual playback, but renders our own transport + a single
// three-dot (⋮) dropdown so Download / Playback speed / Remove audio all live
// in ONE menu (the browser's native controls menu can't be extended).
interface Props {
  // Resolved, browser-loadable URL for playback + download.
  src: string;
  // Already includes its own confirmation dialog.
  onRemove: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const formatTime = (s: number): string => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

export default function UploadedAudioPlayer({ src, onRemove }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSpeedOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setSpeedOpen(false); }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  const toggleMute = () => {
    const el = audioRef.current;
    const next = !muted;
    if (el) el.muted = next;
    setMuted(next);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const t = Number(e.target.value);
    el.currentTime = t;
    setCurrent(t);
  };

  const applyRate = (r: number) => {
    const el = audioRef.current;
    if (el) el.playbackRate = r;
    setRate(r);
    setSpeedOpen(false);
    setMenuOpen(false);
  };

  // Download the audio. Fetch as a blob so it downloads even when the file is
  // served from a different origin (prod backend); falls back to opening it.
  const handleDownload = async () => {
    setMenuOpen(false);
    const fileName = (src.split('/').pop() || 'audio').split('?')[0] || 'audio';
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, '_blank');
    }
  };

  const handleRemove = () => {
    setMenuOpen(false);
    onRemove();
  };

  // Playback position as a percentage, used to fill the custom seek bar.
  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="mb-4 flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
      {/* Left: blue icon + label */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <FileText size={16} className="text-blue-600" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:inline">Uploaded audio</span>
      </div>

      {/* Hidden native element drives playback; we render custom controls. */}
      <audio
        ref={audioRef}
        src={src}
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Center: grey rounded control pill */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5 bg-slate-100 rounded-full px-3 py-1.5">
        <button
          onClick={togglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="flex-shrink-0 w-7 h-7 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>

        <span className="text-xs font-mono tabular-nums text-slate-700 flex-shrink-0">
          {formatTime(current)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={handleSeek}
          className="audio-seek flex-1 min-w-0"
          style={{
            background: `linear-gradient(to right, #94a3b8 ${pct}%, #cbd5e1 ${pct}%)`,
          }}
          aria-label="Seek"
        />

        <button
          onClick={toggleMute}
          title={muted ? 'Unmute' : 'Mute'}
          className="flex-shrink-0 w-7 h-7 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Three-dot dropdown: Download · Playback speed · Remove audio */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => { setMenuOpen(o => !o); setSpeedOpen(false); }}
            title="More options"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            className="w-8 h-8 rounded-full text-slate-800 hover:text-black hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
            <button
              onClick={handleDownload}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download size={16} className="text-slate-500" />
              Download
            </button>

            <button
              onClick={() => setSpeedOpen(o => !o)}
              aria-expanded={speedOpen}
              className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Gauge size={16} className="text-slate-500" />
                Playback speed
              </span>
              <span className="text-xs text-slate-400">{rate}x</span>
            </button>

            {speedOpen && (
              <div className="bg-slate-50 border-y border-slate-100">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => applyRate(s)}
                    className="w-full flex items-center justify-between px-3 py-1.5 pl-10 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {s === 1 ? 'Normal' : `${s}x`}
                    {rate === s && <Check size={14} className="text-blue-600" />}
                  </button>
                ))}
              </div>
            )}

            <div className="my-1 border-t border-slate-100" />

              <button
                onClick={handleRemove}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={16} />
                Remove audio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
