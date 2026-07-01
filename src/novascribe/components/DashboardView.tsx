import React from 'react';
import { motion } from 'motion/react';
import { Consultation, UpcomingAppointment } from '../types';
import { Mic, Search, Clock, CheckCircle, ChevronRight, Activity, ClipboardList, Users, Pill, CalendarClock } from 'lucide-react';

interface DashboardViewProps {
  consultations: Consultation[];
  patientsCount?: number;
  reportsCount?: number;
  prescriptionsCount?: number;
  upcomingAppointments?: UpcomingAppointment[];
  onStartNew: () => void;
  onSelectConsultation: (con: Consultation) => void;
  onScribeAppointment?: (appt: UpcomingAppointment) => void;
}

export default function DashboardView({
  consultations,
  patientsCount,
  reportsCount,
  prescriptionsCount,
  upcomingAppointments = [],
  onStartNew,
  onSelectConsultation,
  onScribeAppointment,
}: DashboardViewProps) {
  // Today's date (YYYY-MM-DD) in the clinic timezone, to badge today's visits.
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const prettyDate = (d: string) =>
    d === todayStr
      ? 'Today'
      : new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const [searchQuery, setSearchQuery] = React.useState('');

  // Sortable timestamp for a session: prefer updatedAt, then createdAt, then the
  // display date. Missing/unparseable values sort to the bottom.
  const sessionTime = (c: Consultation): number => {
    const raw = c?.updatedAt || c?.createdAt || c?.date;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  // A session is Completed only when it was saved with that status (i.e. the
  // user clicked Save). Report/transcript presence alone does NOT mean Completed.
  const isCompleted = (c: Consultation): boolean => c?.status === 'Completed';

  // Collapse multiple sessions per patient into a single row, keeping only the
  // most-recently-updated session. Keyed by patientId (falling back to name/id).
  const latestByPatient = new Map<string, Consultation>();
  for (const c of consultations) {
    const key = c?.patientId || c?.patientName || c?.id;
    if (!key) continue;
    const existing = latestByPatient.get(key);
    if (!existing || sessionTime(c) >= sessionTime(existing)) {
      latestByPatient.set(key, c);
    }
  }

  // One entry per patient, newest updated first.
  const uniquePatients = Array.from(latestByPatient.values())
    .sort((a, b) => sessionTime(b) - sessionTime(a));

  const filtered = uniquePatients.filter((c: Consultation) =>
    (c?.patientName || "").toLowerCase().includes((searchQuery || "").toLowerCase()) ||
    (c?.date || "").includes(searchQuery)
  );

  // All counts come from MongoDB-backed collections; fall back to local data.
  const totalPatients = patientsCount ?? 0;
  const reportsGenerated = typeof reportsCount === 'number'
    ? reportsCount
    : consultations.filter(c => c?.report).length;
  const prescriptionsGenerated = prescriptionsCount ?? 0;

  const metrics = [
    { label: 'Total Patients', value: totalPatients, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Total Consultations', value: consultations.length, icon: Activity, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Reports Generated', value: reportsGenerated, icon: ClipboardList, color: 'bg-purple-50 text-purple-600' },
    { label: 'Prescriptions Generated', value: prescriptionsGenerated, icon: Pill, color: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col p-8">
      {/* Top Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-slate-900">Dashboard</h1>
          <p className="text-slate-500 font-medium">Ready for your next patient?</p>
        </div>
        <button 
          onClick={onStartNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all flex items-center gap-2"
        >
          <Mic size={18} />
          <span>New Consultation</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metrics.map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${m.color}`}>
                <Icon size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{m.value}</div>
                <div className="text-sm font-medium text-slate-500">{m.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming Appointments — shared from ClinicBook; scribe a visit in one tap */}
      {upcomingAppointments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
            <CalendarClock size={18} className="text-blue-500" />
            <h2 className="font-semibold text-lg text-slate-800">Upcoming Appointments</h2>
            <span className="ml-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {upcomingAppointments.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto custom-scrollbar">
            {upcomingAppointments.map((a) => (
              <div key={a.appointmentId} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{a.patientName}</div>
                  <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                      a.date === todayStr ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Clock size={12} /> {prettyDate(a.date)} · {a.time}
                    </span>
                    {a.doctorName && <span className="truncate">Dr. {a.doctorName.replace(/^dr\.?\s*/i, '')}</span>}
                  </div>
                </div>
                <button
                  onClick={() => onScribeAppointment?.(a)}
                  className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                  title={`Start scribe for ${a.patientName}`}
                >
                  <Mic size={16} />
                  <span>Scribe</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consultations List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
          <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <Clock size={18} className="text-blue-500" />
            Recent Consultations
          </h2>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search patients..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-72 transition-all"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100 flex-1 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No consultations found.</div>
          ) : (
            filtered.map((con: Consultation) => (
              <div
                key={con?.id}
                onClick={() => onSelectConsultation(con)}
                className="p-5 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors text-lg">{con?.patientName || "Unknown Patient"}</h3>
                  <div className="text-sm text-slate-500 mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Clock size={14} /> {con?.date}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium ${
                      isCompleted(con) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      {isCompleted(con) && <CheckCircle size={12} />}
                      {isCompleted(con) ? 'Completed' : 'Draft'}
                    </span>
                  </div>
                </div>
                <div className="text-slate-300 group-hover:text-blue-600 transition-colors bg-white border border-slate-100 group-hover:border-blue-100 p-2 rounded-lg shadow-sm">
                  <ChevronRight size={20} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
