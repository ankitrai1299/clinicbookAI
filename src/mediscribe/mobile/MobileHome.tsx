import React from 'react';
import { Consultation, Patient, UpcomingAppointment } from '../types';
import { Sparkles, Mic, Clock, ChevronRight, CalendarDays, FileEdit, CheckCircle2, BellRing, Zap } from 'lucide-react';
import {
  BRAND,
  Avatar,
  Card,
  StatCard,
  StatusBadge,
  SectionHeader,
  SearchBar,
  DateRangeSelect,
  EmptyState,
  WarningBanner,
  bareName,
  greetingKey,
  localDay,
  minutesOfDay,
  nowMinutes,
  relativeIn,
  recordTime,
  inRange,
  rangeStart,
  previousWindow,
  trendOf,
  type RangeKey
} from './ui';
import { usePrefs } from './prefs';
// `BRAND` here is the phone UI's accent colour (from ./ui). The brand NAMES
// come in under an alias so neither has to be renamed.
import { BRAND as ANVAYA } from '../../brand';

// Home screen of the phone app (WebView only), in the design language of the
// native MediScribe app: a calm white hero rather than a coloured slab, a
// Practice Overview whose period the doctor chooses, and four metrics that each
// open the list they count.
//
// Everything here is measured from consultations already loaded — including the
// trend chips, which compare against the equal-length window immediately before
// the selected period. No estimated figures: a chip appears only when there is a
// real baseline to compare against.

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
  /** Opens the list a metric counts, over the period the card is showing. */
  onViewList: (kind: 'today' | 'drafts' | 'completed' | 'follow-ups', range: RangeKey) => void;
  onOpenProfile: () => void;
  onQuickRx?: () => void;
}

/** The one-line "what was this visit about", straight from the AI note. */
const sessionLabel = (c: Consultation): string => {
  const cc = c.report?.chiefComplaint;
  if (Array.isArray(cc) && cc.length) return cc.filter(Boolean).join('; ');
  if (typeof cc === 'string' && cc) return cc;
  return (c.transcript || []).map((l) => l?.text).filter(Boolean).join(' ').trim();
};

/** A follow-up that is still ahead (or undated but present). */
const hasOpenFollowUp = (c: Consultation, todayStart: number): boolean => {
  const fu = c.report?.followUp?.date?.trim();
  if (!fu) return false;
  const d = new Date(fu);
  return Number.isNaN(d.getTime()) ? true : d.getTime() >= todayStart;
};

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
  onViewList,
  onOpenProfile,
  onQuickRx
}: MobileHomeProps) {
  const { t } = usePrefs();
  const [query, setQuery] = React.useState('');
  const [range, setRange] = React.useState<RangeKey>('week');

  const now = new Date();
  const today = localDay(now);
  const mins = nowMinutes(now);
  const todayStart = new Date(now).setHours(0, 0, 0, 0);

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

  const next = todaysQueue.find((a) => {
    const m = minutesOfDay(a.time);
    return m !== null && m >= mins;
  });

  // ── Practice overview ────────────────────────────────────────────────────
  // Counted over the SELECTED period, and again over the equal-length window
  // before it, so each card's trend is a real period-over-period comparison
  // rather than a decorative arrow.
  const stats = React.useMemo(() => {
    const prev = previousWindow(range, now);
    const inPrev = (ts: number) => (prev ? ts >= prev.from && ts < prev.to : false);

    const count = (pick: (c: Consultation) => boolean, within: (ts: number) => boolean) =>
      consultations.filter((c) => within(recordTime(c)) && pick(c)).length;

    const all = () => true;
    const draft = (c: Consultation) => c.status !== 'Completed';
    const done = (c: Consultation) => c.status === 'Completed';
    const followUp = (c: Consultation) => hasOpenFollowUp(c, todayStart);

    const cur = (pick: (c: Consultation) => boolean) => count(pick, (ts) => inRange(ts, range, now));
    const before = (pick: (c: Consultation) => boolean) => (prev ? count(pick, inPrev) : null);

    return [
      { id: 'today' as const, icon: <CalendarDays size={18} />, bg: 'bg-[#EEEFFE]', tint: 'text-[#5B5CEB]', label: t('stats.consultations'), value: cur(all), trend: trendOf(cur(all), before(all)) },
      { id: 'drafts' as const, icon: <FileEdit size={18} />, bg: 'bg-[#FEF8EB]', tint: 'text-[#D97706]', label: t('stats.drafts'), value: cur(draft), trend: trendOf(cur(draft), before(draft)) },
      { id: 'completed' as const, icon: <CheckCircle2 size={18} />, bg: 'bg-[#ECFAF1]', tint: 'text-[#16A34A]', label: t('stats.completed'), value: cur(done), trend: trendOf(cur(done), before(done)) },
      { id: 'follow-ups' as const, icon: <BellRing size={18} />, bg: 'bg-[#EEEFFE]', tint: 'text-[#7C3AED]', label: t('stats.followUps'), value: cur(followUp), trend: trendOf(cur(followUp), before(followUp)) }
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultations, range]);

  // ── Recent: one row per patient, newest first ────────────────────────────
  const recent = React.useMemo(() => {
    const latest = new Map<string, Consultation>();
    for (const c of consultations) {
      const key = c?.patientId || c?.patientName || c?.id;
      if (!key) continue;
      const cur = latest.get(key);
      if (!cur || recordTime(c) >= recordTime(cur)) latest.set(key, c);
    }
    const q = query.trim().toLowerCase();
    return Array.from(latest.values())
      .sort((a, b) => recordTime(b) - recordTime(a))
      .filter((c) => !q || (c.patientName || '').toLowerCase().includes(q) || sessionLabel(c).toLowerCase().includes(q))
      .slice(0, 6);
  }, [consultations, query]);

  const displayName = bareName(doctorName) || 'Doctor';

  return (
    <div className="p-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 pr-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} color={BRAND} />
            <span className="text-[11px] font-bold text-[#5B5CEB] uppercase tracking-[0.06em]">{ANVAYA.scribe.latin}</span>
          </div>
          <p className="text-slate-500 mt-3 text-[14px] font-medium">{t(greetingKey(now))}</p>
          {/* Wraps rather than truncates: Indian names are routinely long enough
              that clipping drops the surname, the part anyone is called by. */}
          <h1 className="text-[27px] font-extrabold text-slate-900 leading-8 mt-0.5 tracking-[-0.02em] break-words">
            Dr. {displayName}
          </h1>
        </div>
        <button onClick={onOpenProfile} aria-label="Profile">
          <Avatar name={doctorName} size={46} />
        </button>
      </div>

      {/* Account not linked to a doctor record — without this the queue simply
          looks empty, which reads as "nobody booked today". */}
      {!doctorLinked && (
        <WarningBanner
          title="Appointments aren’t linked yet"
          message={`This login${loginEmail ? ` (${loginEmail})` : ''} isn’t matched to a doctor record. Ask your clinic admin to set the same email on your doctor profile.`}
        />
      )}

      {/* Hero — a calm white card. Colour appears only on the action and the mic
          disc, never as a full coloured slab. */}
      <Card className="p-5 flex items-center" onClick={onStartNew}>
        <div className="flex-1 pr-3 min-w-0">
          <div className="text-[12px] font-semibold text-[#5B5CEB] uppercase tracking-wide">{t('dashboard.startNew')}</div>
          <div className="text-[22px] font-bold text-slate-900 tracking-tight mt-1">{t('dashboard.consultation')}</div>
          <div className="text-[13px] text-slate-500 mt-1 leading-5">{t('dashboard.ready')}</div>
          <span className="inline-flex items-center gap-1.5 mt-4 bg-[#5B5CEB] rounded-xl px-3.5 py-2">
            <Mic size={14} className="text-white" />
            <span className="text-white font-semibold text-[13px]">{t('dashboard.tapToBegin')}</span>
          </span>
        </div>
        <span className="w-16 h-16 rounded-2xl bg-[#EEEFFE] flex items-center justify-center flex-shrink-0">
          <Mic size={28} color={BRAND} />
        </span>
      </Card>

      {/* Quick Rx — prescribe without recording (refills, two-minute visits) */}
      {onQuickRx && (
        <button
          onClick={onQuickRx}
          className="w-full flex items-center justify-center gap-2 mt-3 py-3 rounded-2xl bg-white border border-[#E8ECF2] text-slate-700 font-semibold text-[14px] active:bg-slate-50 transition-colors"
        >
          <Zap size={16} className="text-amber-500" /> {t('dashboard.quickRx')}
        </button>
      )}

      {/* Practice overview */}
      <h2 className="text-[19px] font-bold text-slate-900 tracking-tight mt-7 mb-3">{t('dashboard.practiceOverview')}</h2>
      <div className="flex items-center justify-between mb-3">
        <DateRangeSelect value={range} onChange={setRange} />
        <span className="text-[12.5px] text-slate-400">
          {now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <StatCard
            key={s.id}
            icon={s.icon}
            bg={s.bg}
            tint={s.tint}
            value={s.value}
            label={s.label}
            trend={s.trend}
            onClick={() => onViewList(s.id, range)}
          />
        ))}
      </div>

      {/* Today's queue — one tap starts that patient's consultation */}
      {todaysQueue.length > 0 && (
        <div className="mt-7">
          <SectionHeader title={t('dashboard.todaysQueue')} icon={<Clock size={15} />} action={t('dashboard.viewAll')} onAction={onViewAppointments} />
          {next && (
            <p className="text-[12.5px] text-slate-500 -mt-1 mb-3">
              Next: <span className="font-semibold text-slate-700">{next.patientName}</span> {relativeIn((minutesOfDay(next.time) ?? 0) - mins)}
            </p>
          )}
          <div className="space-y-2.5">
            {todaysQueue.slice(0, 4).map((a) => (
              <Card key={a.id} className="flex items-center p-3.5" onClick={() => onScribeAppointment?.(a)}>
                <Avatar name={a.patientName} size={40} />
                <div className="flex-1 min-w-0 ml-3">
                  <div className="font-bold text-slate-900 text-[15px] truncate">{a.patientName}</div>
                  <div className="text-[12px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <Clock size={12} /> {a.time}
                  </div>
                </div>
                <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#5B5CEB] text-white px-3.5 py-2 rounded-xl font-semibold text-[13px]">
                  <Mic size={14} /> {t('dashboard.start')}
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent consultations */}
      <div className="mt-7">
        <SectionHeader title={t('dashboard.recent')} icon={<Clock size={15} />} action={t('dashboard.viewAll')} onAction={onViewNotes} />
        <div className="mb-3">
          <SearchBar value={query} onChange={setQuery} placeholder={t('dashboard.searchPatients')} />
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={<Mic size={26} />}
            title={consultations.length ? t('empty.nothingMatches') : t('dashboard.noneTitle')}
            hint={consultations.length ? undefined : t('dashboard.noneBody')}
          />
        ) : (
          <div className="space-y-2.5">
            {recent.map((con) => {
              const label = sessionLabel(con);
              return (
                <Card key={con.id} className="flex items-center p-3.5" onClick={() => onSelectConsultation(con)}>
                  <Avatar name={con.patientName} size={40} />
                  <div className="flex-1 min-w-0 ml-3">
                    <div className="font-bold text-slate-900 text-[15px] truncate">
                      {con.patientName || 'Unknown Patient'}
                    </div>
                    {label && <div className="text-[12px] text-slate-500 mt-0.5 truncate">{label}</div>}
                    <div className="text-[12px] text-slate-400 mt-1 flex items-center gap-1.5">
                      <Clock size={12} /> {con.date}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-2">
                    <StatusBadge status={con.status} />
                    <ChevronRight size={18} className="text-slate-300" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
