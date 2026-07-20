import React from 'react';
import { Consultation, UpcomingAppointment } from '../types';
import {
  Sparkles,
  Mic,
  CalendarDays,
  FileEdit,
  CheckCircle2,
  BellRing,
  Clock,
  ChevronRight,
  Search,
  CalendarClock,
  Stethoscope,
} from 'lucide-react';

// Native-style mobile dashboard — shown ONLY inside the phone app (WebView).
// It reuses the exact same data the web dashboard uses (consultations + counts);
// nothing here changes the web. Layout mirrors the approved mobile mockup:
// greeting → gradient "Start a New Consultation" hero → 2×2 "Today at a glance"
// → recent consultations (one row per patient).

interface MobileHomeProps {
  consultations: Consultation[];
  doctorName?: string;
  upcomingAppointments?: UpcomingAppointment[];
  onStartNew: () => void;
  onSelectConsultation: (con: Consultation) => void;
  onScribeAppointment?: (appt: UpcomingAppointment) => void;
  onViewAllSessions: () => void;
}

const greeting = (): string => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const initials = (name?: string): string =>
  (name || 'P')
    .replace(/^dr\.?\s*/i, '')
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function MobileHome({
  consultations,
  doctorName,
  upcomingAppointments = [],
  onStartNew,
  onSelectConsultation,
  onScribeAppointment,
  onViewAllSessions,
}: MobileHomeProps) {
  const [query, setQuery] = React.useState('');
  const now = new Date();

  // Today's queue — the doctor's actual starting point on a clinic day.
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const todaysQueue = upcomingAppointments.filter((a) => a.date === todayStr);

  const todayCount = consultations.filter((c) => {
    const raw = c.updatedAt || c.createdAt || c.date;
    const d = raw ? new Date(raw) : null;
    return d && !Number.isNaN(d.getTime()) && isSameDay(d, now);
  }).length;
  const draftCount = consultations.filter((c) => c.status !== 'Completed').length;
  const completedCount = consultations.filter((c) => c.status === 'Completed').length;
  const followUpCount = consultations.filter((c) => {
    const fu = c.report?.followUp?.date?.trim();
    if (!fu) return false;
    const d = new Date(fu);
    return Number.isNaN(d.getTime()) ? true : d.getTime() >= new Date().setHours(0, 0, 0, 0);
  }).length;

  // One row per patient, newest first.
  const latestByPatient = new Map<string, Consultation>();
  for (const c of consultations) {
    const key = c?.patientId || c?.patientName || c?.id;
    if (!key) continue;
    const cur = latestByPatient.get(key);
    if (!cur || sessionTime(c) >= sessionTime(cur)) latestByPatient.set(key, c);
  }
  const recent = Array.from(latestByPatient.values())
    .sort((a, b) => sessionTime(b) - sessionTime(a))
    .filter((c) => (c.patientName || '').toLowerCase().includes(query.toLowerCase()));

  const firstName = (doctorName || 'Doctor').replace(/^dr\.?\s*/i, '').split(' ')[0] || 'Doctor';

  const stats = [
    { icon: CalendarDays, value: todayCount, label: "Today's Consultations", tint: 'text-blue-600', bg: 'bg-blue-50' },
    { icon: FileEdit, value: draftCount, label: 'Draft Reports', tint: 'text-amber-600', bg: 'bg-amber-50' },
    { icon: CheckCircle2, value: completedCount, label: 'Completed', tint: 'text-emerald-600', bg: 'bg-emerald-50' },
    { icon: BellRing, value: followUpCount, label: 'Pending Follow-ups', tint: 'text-violet-600', bg: 'bg-violet-50' },
  ];

  return (
    <div className="px-5 pt-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-blue-600" />
            <span className="text-[13px] font-bold text-blue-600 tracking-tight">NovaScribe AI</span>
          </div>
          <p className="text-slate-500 mt-2 text-[15px]">{greeting()},</p>
          <h1 className="text-[26px] font-bold text-slate-900 tracking-tight leading-8 truncate">
            Dr. {firstName} <span className="align-middle">👋</span>
          </h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            You have {todayCount} consultation{todayCount === 1 ? '' : 's'} today
          </p>
        </div>
        <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold flex-shrink-0">
          {initials(doctorName)}
        </div>
      </div>

      {/* Hero — Start a New Consultation */}
      <button
        onClick={onStartNew}
        className="w-full text-left rounded-3xl p-5 mb-6 shadow-lg shadow-blue-600/20 bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-[13px] font-medium">Start a New</p>
            <p className="text-white text-[24px] font-bold tracking-tight leading-7">Consultation</p>
            <p className="text-white/75 text-[13px] mt-1">AI Scribe is ready to listen</p>
          </div>
          <div className="w-16 h-16 rounded-full bg-white/15 border border-white/25 flex items-center justify-center flex-shrink-0">
            <Mic size={26} className="text-white" />
          </div>
        </div>
        {/* Waveform strip */}
        <div className="mt-4 flex items-center gap-1 h-6 overflow-hidden">
          {Array.from({ length: 44 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 rounded-full bg-white/70"
              style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 80}%` }}
            />
          ))}
        </div>
      </button>

      {/* Today's queue — one tap starts the consultation for that patient */}
      {todaysQueue.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <CalendarClock size={17} className="text-blue-600" /> Today's Queue
            </h2>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
              {todaysQueue.length} waiting
            </span>
          </div>
          <div className="space-y-2.5">
            {todaysQueue.map((a) => (
              <button
                key={a.id}
                onClick={() => onScribeAppointment?.(a)}
                className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm active:bg-blue-50/60 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold flex-shrink-0">
                  {initials(a.patientName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-[15px] truncate">{a.patientName}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2.5">
                    <span className="flex items-center gap-1 font-semibold text-slate-600">
                      <Clock size={12} /> {a.time}
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <Stethoscope size={12} /> Dr. {a.doctorName.replace(/^dr\.?\s*/i, '')}
                    </span>
                  </div>
                </div>
                <span className="flex-shrink-0 flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-xl font-semibold text-[13px]">
                  <Mic size={14} /> Start
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Today at a glance */}
      <p className="text-[13px] font-bold uppercase tracking-wider text-slate-400 mb-3">Today at a glance</p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.bg} ${s.tint}`}>
                <Icon size={20} />
              </div>
              <div className="text-[26px] font-bold text-slate-900 leading-7">{s.value}</div>
              <div className="text-[13px] font-medium text-slate-500 mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Recent consultations */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <Clock size={17} className="text-blue-500" /> Recent Consultations
        </h2>
        <button onClick={onViewAllSessions} className="text-[13px] font-semibold text-blue-600">
          View all
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patients..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      {recent.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Mic size={24} />
          </div>
          <p className="font-bold text-slate-700">No consultations yet</p>
          <p className="text-sm text-slate-400 mt-1">Tap the card above to record your first one.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {recent.map((con) => (
            <button
              key={con.id}
              onClick={() => onSelectConsultation(con)}
              className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm active:bg-slate-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold flex-shrink-0">
                {initials(con.patientName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-[15px] truncate">
                  {con.patientName || 'Unknown Patient'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <Clock size={12} /> {con.date}
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                  con.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {con.status === 'Completed' ? 'Completed' : 'Draft'}
              </span>
              <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
