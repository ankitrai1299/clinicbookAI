import React from 'react';
import { Consultation, Patient, UpcomingAppointment } from '../types';
import { Bell, Mic, FileText, Pill, ChevronRight, AlertTriangle, Zap } from 'lucide-react';
import { initials, bareName, greeting, localDay, minutesOfDay, nowMinutes, relativeIn, recordTime } from './ui';

// Home screen of the phone app (WebView only). Same data the web dashboard uses
// — consultations, today's appointments, patient counts — arranged the way a
// doctor actually opens the app: what's next, then the three things they do.
//
// Every number here is measured, not estimated. The design this follows showed a
// "6h 24m time saved" figure; there is nothing in the data that knows how long a
// note would have taken by hand, so that tile counts notes for the week instead.
// An invented statistic in a medical app is worse than a plain one.

interface MobileHomeProps {
  consultations: Consultation[];
  patients?: Patient[];
  doctorName?: string;
  upcomingAppointments?: UpcomingAppointment[];
  /** False when this login has no matching ClinicBook Doctor — the queue is then
   *  empty for a reason the doctor cannot see or fix themselves. */
  doctorLinked?: boolean;
  loginEmail?: string;
  onStartNew: () => void;
  onSelectConsultation: (con: Consultation) => void;
  onScribeAppointment?: (appt: UpcomingAppointment) => void;
  onViewAppointments: () => void;
  onViewNotes: () => void;
  onViewPrescriptions: () => void;
  onQuickRx?: () => void;
}

export default function MobileHome({
  consultations,
  doctorName,
  upcomingAppointments = [],
  doctorLinked = true,
  loginEmail,
  onStartNew,
  onSelectConsultation,
  onScribeAppointment,
  onViewAppointments,
  onViewNotes,
  onViewPrescriptions,
  onQuickRx,
}: MobileHomeProps) {
  const now = new Date();
  const today = localDay(now);
  const mins = nowMinutes(now);

  // Today's roster, in clock order. Slots we can't parse sort last rather than
  // to the top of the day.
  const todaysQueue = React.useMemo(
    () =>
      upcomingAppointments
        .filter((a) => a.date === today)
        .slice()
        .sort((a, b) => (minutesOfDay(a.time) ?? 1e9) - (minutesOfDay(b.time) ?? 1e9)),
    [upcomingAppointments, today]
  );

  // The next one still ahead — what the doctor is actually waiting for.
  const next = todaysQueue.find((a) => {
    const m = minutesOfDay(a.time);
    return m !== null && m >= mins;
  });
  const nextIn = next ? (minutesOfDay(next.time) ?? 0) - mins : null;

  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const notesToday = consultations.filter((c) => recordTime(c) >= startOfToday).length;
  const notesWeek = consultations.filter((c) => recordTime(c) >= startOfToday - 6 * 86_400_000).length;

  const displayName = bareName(doctorName) || 'Doctor';

  const actions = [
    { key: 'rec', label: 'New\nConsultation', icon: Mic, tint: 'text-violet-600', bg: 'bg-violet-50', onClick: onStartNew },
    { key: 'notes', label: 'My Notes', icon: FileText, tint: 'text-sky-600', bg: 'bg-sky-50', onClick: onViewNotes },
    { key: 'rx', label: 'Prescriptions', icon: Pill, tint: 'text-rose-500', bg: 'bg-rose-50', onClick: onViewPrescriptions },
  ];

  return (
    <div className="px-5 pt-4">
      {/* Brand + greeting */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Mic size={15} className="text-white" strokeWidth={2.6} />
          </span>
          <span className="text-[16px] font-bold tracking-tight text-slate-900">MediScribe</span>
        </div>
        <button aria-label="Notifications" className="relative text-slate-400 p-1">
          <Bell size={21} />
          {todaysQueue.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-violet-500 ring-2 ring-slate-50" />
          )}
        </button>
      </div>

      {/* Wraps rather than truncates. Indian names are routinely long enough that
          "Good afternoon, Dr. Ankit Verma" clipped to "…Dr. Ankit Ve…" — cutting
          off the surname, the part anyone is actually called by. */}
      <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-8 break-words">
        {greeting(now)}, Dr. {displayName} <span className="align-middle">👋</span>
      </h1>
      <p className="text-slate-500 text-[14px] mt-1 mb-5">Here's your day at a glance</p>

      {/* Account not linked to a doctor record — without this the queue simply
          looks empty, which reads as "nobody booked today". */}
      {!doctorLinked && (
        <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-2xl border border-amber-200 bg-amber-50">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[13px]">
            <div className="font-bold text-amber-900">Appointments aren’t linked yet</div>
            <p className="text-amber-800 mt-0.5 leading-snug">
              This login{loginEmail ? ` (${loginEmail})` : ''} isn’t matched to a doctor record. Ask your clinic
              admin to set the same email on your doctor profile.
            </p>
          </div>
        </div>
      )}

      {/* Today's appointments */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-4">
        <button onClick={onViewAppointments} className="w-full flex items-center justify-between mb-4">
          <span className="font-bold text-slate-900 text-[15px]">Today's Appointments</span>
          <ChevronRight size={18} className="text-slate-300" />
        </button>

        <div className="flex items-stretch gap-5">
          <div className="text-center flex-shrink-0">
            <div className="text-[32px] font-bold text-violet-600 leading-9">{todaysQueue.length}</div>
            <div className="text-[12px] font-medium text-slate-400">Total</div>
          </div>

          <div className="w-px bg-slate-100 flex-shrink-0" />

          {next ? (
            <button
              onClick={() => onScribeAppointment?.(next)}
              className="flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
            >
              <div className="text-[12px] font-semibold text-violet-600">
                {nextIn !== null && nextIn <= 0 ? 'Now' : `Next ${relativeIn(nextIn ?? 0)}`}
              </div>
              <div className="font-bold text-slate-900 text-[16px] truncate mt-0.5">{next.patientName}</div>
              <div className="text-[12.5px] text-slate-400 mt-0.5 truncate">
                {next.time}
                {next.speciality ? ` · ${next.speciality}` : ''}
              </div>
            </button>
          ) : (
            <div className="flex-1 min-w-0 flex items-center">
              <p className="text-[13px] text-slate-400 leading-snug">
                {todaysQueue.length ? 'All of today’s appointments are done.' : 'Nothing booked for today.'}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onViewAppointments}
          className="w-full mt-4 py-3 rounded-2xl border border-slate-200 text-[14px] font-semibold text-slate-700 active:bg-slate-50 transition-colors"
        >
          View all
        </button>
      </section>

      {/* The three things a doctor does */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={a.onClick}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex flex-col items-center gap-2.5 active:scale-[0.98] transition-transform"
            >
              <span className={`w-11 h-11 rounded-full flex items-center justify-center ${a.bg} ${a.tint}`}>
                <Icon size={20} />
              </span>
              <span className="text-[12px] font-semibold text-slate-700 text-center leading-tight whitespace-pre-line">
                {a.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Quick Rx — prescribe without recording (refills, two-minute visits) */}
      {onQuickRx && (
        <button
          onClick={onQuickRx}
          className="w-full flex items-center justify-center gap-2 mb-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold shadow-sm active:bg-slate-50 transition-colors"
        >
          <Zap size={17} className="text-amber-500" /> Quick Prescription
        </button>
      )}

      {/* Scribe activity — counted, never estimated. */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-5">
        <p className="font-bold text-slate-900 text-[15px] mb-4">AI Scribe Activity</p>
        <div className="flex">
          <div className="flex-1">
            <div className="text-[28px] font-bold text-violet-600 leading-8">{notesToday}</div>
            <div className="text-[12.5px] font-medium text-slate-500 mt-0.5">Notes generated</div>
            <div className="text-[11.5px] text-slate-400">Today</div>
          </div>
          <div className="w-px bg-slate-100" />
          <div className="flex-1 pl-5">
            <div className="text-[28px] font-bold text-indigo-500 leading-8">{notesWeek}</div>
            <div className="text-[12.5px] font-medium text-slate-500 mt-0.5">Notes generated</div>
            <div className="text-[11.5px] text-slate-400">This week</div>
          </div>
        </div>
      </section>

      {/* The rest of today, one tap to start */}
      {todaysQueue.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800 text-[15px]">Today's Queue</h2>
            <button onClick={onViewAppointments} className="text-[13px] font-semibold text-violet-600">
              View all
            </button>
          </div>
          <div className="space-y-2.5">
            {todaysQueue.slice(0, 4).map((a) => {
              const m = minutesOfDay(a.time);
              const past = m !== null && m < mins;
              return (
                <button
                  key={a.id}
                  onClick={() => onScribeAppointment?.(a)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm active:bg-violet-50/60 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                    {initials(a.patientName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-[15px] truncate">{a.patientName}</div>
                    <div className="text-[12.5px] text-slate-400 mt-0.5">{a.time}</div>
                  </div>
                  <span
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-[13px] ${
                      past ? 'bg-slate-100 text-slate-500' : 'bg-violet-600 text-white'
                    }`}
                  >
                    <Mic size={14} /> Start
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Latest notes, so the last session is always one tap away */}
      {consultations.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800 text-[15px]">Recent Notes</h2>
            <button onClick={onViewNotes} className="text-[13px] font-semibold text-violet-600">
              View all
            </button>
          </div>
          <div className="space-y-2.5">
            {consultations
              .slice()
              .sort((a, b) => recordTime(b) - recordTime(a))
              .slice(0, 3)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectConsultation(c)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm active:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                    {initials(c.patientName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-[15px] truncate">
                      {c.patientName || 'Unknown Patient'}
                    </div>
                    <div className="text-[12.5px] text-slate-400 mt-0.5 truncate">{c.date}</div>
                  </div>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
                      c.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {c.status === 'Completed' ? 'Completed' : 'Draft'}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
