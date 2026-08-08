import React from 'react';
import { CalendarDays, Mic, ChevronRight } from 'lucide-react';
import { Consultation, UpcomingAppointment } from '../types';
import { initials, localDay, minutesOfDay, nowMinutes, relativeIn, ScreenHeader, EmptyState } from './ui';

// The doctor's roster for a chosen day — the same ClinicBook appointments the
// home card counts, laid out in clock order with the time down the left.
//
// Every badge is derived from data we actually hold:
//   "Now" / "in 20 min"  ← the slot time against the clock
//   "Done"               ← the slot has passed
//   "New patient"        ← this patient has no earlier consultation on record
// The design this follows also showed "Checked In", which nothing in the system
// records; inventing it would put a false clinical fact on the screen.

interface MobileAppointmentsProps {
  appointments: UpcomingAppointment[];
  consultations: Consultation[];
  onBack: () => void;
  onScribeAppointment?: (appt: UpcomingAppointment) => void;
}

const DAYS = 7;

const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' });

export default function MobileAppointments({
  appointments,
  consultations,
  onBack,
  onScribeAppointment,
}: MobileAppointmentsProps) {
  const now = new Date();
  const [selected, setSelected] = React.useState<string>(localDay(now));

  // Today plus the next six days — the window a doctor plans within.
  const days = React.useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        return d;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Patients with any prior consultation — anyone else is new to this doctor.
  const seenPatients = React.useMemo(
    () => new Set(consultations.map((c) => c.patientId).filter(Boolean) as string[]),
    [consultations]
  );

  const onDay = React.useMemo(
    () =>
      appointments
        .filter((a) => a.date === selected)
        .slice()
        .sort((a, b) => (minutesOfDay(a.time) ?? 1e9) - (minutesOfDay(b.time) ?? 1e9)),
    [appointments, selected]
  );

  const isToday = selected === localDay(now);
  const mins = nowMinutes(now);

  const badgeFor = (a: UpcomingAppointment) => {
    const m = minutesOfDay(a.time);
    if (isToday && m !== null) {
      const delta = m - mins;
      if (delta < -15) return { text: 'Done', cls: 'bg-slate-100 text-slate-500' };
      if (delta <= 0) return { text: 'Now', cls: 'bg-emerald-50 text-emerald-700' };
      if (delta <= 60) return { text: relativeIn(delta), cls: 'bg-violet-50 text-violet-700' };
    }
    if (a.patientId && !seenPatients.has(a.patientId)) {
      return { text: 'New patient', cls: 'bg-sky-50 text-sky-700' };
    }
    return null;
  };

  return (
    <div>
      <ScreenHeader
        title="Appointments"
        onBack={onBack}
        right={
          <span className="text-slate-400">
            <CalendarDays size={20} />
          </span>
        }
      />

      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pb-4">
        {days.map((d) => {
          const key = localDay(d);
          const active = key === selected;
          const count = appointments.filter((a) => a.date === key).length;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`flex-shrink-0 w-[52px] py-2.5 rounded-2xl flex flex-col items-center gap-0.5 transition-colors ${
                active ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/30' : 'bg-white border border-slate-200 text-slate-500'
              }`}
            >
              <span className={`text-[11px] font-semibold ${active ? 'text-white/80' : 'text-slate-400'}`}>
                {dayLabel(d)}
              </span>
              <span className="text-[17px] font-bold leading-5">{d.getDate()}</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  count ? (active ? 'bg-white' : 'bg-violet-400') : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="px-5">
        <p className="text-[12.5px] font-semibold text-slate-400 mb-3">
          {isToday ? 'Today' : new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}
          {' · '}
          {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>

        {onDay.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={24} />}
            title="Nothing booked"
            hint={isToday ? 'Your day is clear.' : 'No appointments on this day.'}
          />
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {onDay.map((a, i) => {
              const badge = badgeFor(a);
              return (
                <button
                  key={a.id}
                  onClick={() => onScribeAppointment?.(a)}
                  className={`w-full flex items-center gap-3 p-4 text-left active:bg-violet-50/60 transition-colors ${
                    i ? 'border-t border-slate-100' : ''
                  }`}
                >
                  {/* Time rail */}
                  <div className="w-[52px] flex-shrink-0">
                    <div className="text-[13px] font-bold text-slate-900 leading-4">
                      {(a.time || '').replace(/\s*(AM|PM)$/i, '')}
                    </div>
                    <div className="text-[10.5px] font-semibold text-slate-400 uppercase">
                      {(a.time || '').match(/(AM|PM)$/i)?.[0] ?? ''}
                    </div>
                  </div>

                  <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-[12px] flex-shrink-0">
                    {initials(a.patientName)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-[14.5px] truncate">{a.patientName}</div>
                    <div className="text-[12px] text-slate-400 truncate">
                      Dr. {a.doctorName.replace(/^dr\.?\s*/i, '')}
                      {a.speciality ? ` · ${a.speciality}` : ''}
                    </div>
                  </div>

                  {badge ? (
                    <span className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${badge.cls}`}>
                      {badge.text}
                    </span>
                  ) : (
                    <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Starting a session is the point of this screen — say so. */}
        {onDay.length > 0 && (
          <p className="text-[12px] text-slate-400 text-center mt-4 flex items-center justify-center gap-1.5">
            <Mic size={13} /> Tap a patient to start their consultation
          </p>
        )}
      </div>
    </div>
  );
}
