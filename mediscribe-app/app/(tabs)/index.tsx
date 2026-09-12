import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Consultation } from '../../src/types';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../../src/context/AppData';
import { useAuth } from '../../src/context/Auth';
import { loadSettings } from '../../src/services/storage';
import { useDateFilter } from '../../src/context/DateFilter';
import DateRangeBar from '../../src/components/DateRangeBar';
import { rangeQuery, previousRange } from '../../src/utils/dateRange';
import {
  fetchAnalytics,
  getUpcomingAppointments,
  getDoctorLinkStatus,
  type DoctorAnalytics,
  type UpcomingAppointment,
} from '../../src/services/api';
import {
  Card,
  SearchBar,
  StatusBadge,
  Avatar,
  StatCard,
  Skeleton,
  SectionHeader,
  ErrorBanner,
} from '../../src/components/ui';
import NewConsultationModal from '../../src/components/NewConsultationModal';
import { colors } from '../../src/theme';

const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sessionLabel = (c: Consultation, fallback: string): string =>
  c.report?.chiefComplaint?.find(Boolean) ||
  (c.transcript || []).map((l) => l.text).join(' ').trim() ||
  fallback;

const greetingKey = (): string => {
  const h = new Date().getHours();
  if (h < 12) return 'dashboard.greetingMorning';
  if (h < 17) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
};

export default function Dashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { consultations, loading, reload, startSessionForPatient } = useAppData();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    loadSettings().then((s) => setProfileName(s.doctorName || ''));
  }, []);

  // The signed-in account wins over the locally-saved profile name. That local
  // value is per-device, not per-account: on a shared phone it would otherwise
  // greet the second doctor by the first doctor's name. The saved profile is
  // still used as a fallback (and remains what letterheads/exports print).
  const doctorName = user?.name?.trim() || profileName;

  const g = greetingKey();

  // ── Stats ──────────────────────────────────────────────────
  // Counted in the database for the selected range, by the same filters the
  // drill-down screens list with — so a card can never show a number that
  // disagrees with the screen it opens, and the dashboard doesn't need every
  // consultation in memory to produce six figures.
  const { range, setRange } = useDateFilter();
  const [analytics, setAnalytics] = useState<DoctorAnalytics | null>(null);
  // The equal-length period before `range`, for the cards' trend chips. Kept
  // separate and best-effort: the tiles render immediately from `analytics`; the
  // trend simply appears once this resolves, and its absence never blocks them.
  const [prevAnalytics, setPrevAnalytics] = useState<DoctorAnalytics | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // ── The booked day ─────────────────────────────────────────
  // Loaded beside the analytics and refreshed by the same pull-to-refresh. It is
  // the doctor's actual starting point — one tap opens a session already
  // attached to the right patient, instead of finding them in a list.
  const [upcoming, setUpcoming] = useState<UpcomingAppointment[]>([]);
  const [linked, setLinked] = useState(true);
  useEffect(() => {
    let active = true;
    getUpcomingAppointments().then((a) => { if (active) setUpcoming(a); });
    getDoctorLinkStatus().then((s) => { if (active) setLinked(s.linked !== false); });
    return () => { active = false; };
  }, [loading, consultations.length]);
  const analyticsQuery = rangeQuery(range);
  const prevQuery = rangeQuery(previousRange(range));

  useEffect(() => {
    let active = true;
    setStatsError(null);
    fetchAnalytics(analyticsQuery)
      .then((a) => { if (active) setAnalytics(a); })
      .catch((err) => {
        if (active) setStatsError(err instanceof Error ? err.message : 'Could not load analytics.');
      });
    return () => { active = false; };
  }, [analyticsQuery, consultations.length]);

  // Previous period — a real period-over-period baseline, never a fabricated
  // trend. Failure is silent: no baseline just means no trend chip.
  useEffect(() => {
    let active = true;
    setPrevAnalytics(null);
    fetchAnalytics(prevQuery)
      .then((a) => { if (active) setPrevAnalytics(a); })
      .catch(() => { if (active) setPrevAnalytics(null); });
    return () => { active = false; };
  }, [prevQuery, consultations.length]);

  const todayCount = analytics?.totalConsultations ?? 0;
  const draftCount = analytics?.draftReports ?? 0;
  const completedCount = analytics?.completedReports ?? 0;
  const followUpCount = analytics?.pendingFollowUps ?? 0;

  // Direction and magnitude of the change from the previous equal-length period.
  // 'new' when there was nothing before to compare against; null when unchanged
  // or unknown, so the chip is shown only when it means something.
  const trendOf = (cur: number, prev: number | undefined): { pct: number; up: boolean } | 'new' | null => {
    if (prev === undefined) return null;
    if (prev === 0) return cur > 0 ? 'new' : null;
    if (cur === prev) return null;
    return { pct: Math.round(((cur - prev) / prev) * 100), up: cur > prev };
  };

  // ── Recent (one row per patient, newest first) ──────────────
  const latestByPatient = new Map<string, Consultation>();
  for (const c of consultations) {
    const key = c?.patientId || c?.patientName || c?.id;
    if (!key) continue;
    const existing = latestByPatient.get(key);
    if (!existing || sessionTime(c) >= sessionTime(existing)) latestByPatient.set(key, c);
  }
  const recent = Array.from(latestByPatient.values())
    .sort((a, b) => sessionTime(b) - sessionTime(a))
    .filter(
      (c) =>
        (c?.patientName || '').toLowerCase().includes(query.toLowerCase()) ||
        (c?.date || '').includes(query),
    );

  // The percentage deltas that used to sit on these cards were hardcoded ("12%",
  // "8%", …) — the same four numbers for every doctor on every day, with no
  // period-over-period figure behind them. They are gone rather than faked; the
  // cards now carry an affordance that is true, which is that they open.
  const stats = [
    { id: 'today', icon: 'today-outline' as const, bg: 'bg-brand-50', tint: colors.brand, value: todayCount, label: t('dashboard.stat.consultations'), href: '/list/today', trend: trendOf(todayCount, prevAnalytics?.totalConsultations) },
    { id: 'drafts', icon: 'create-outline' as const, bg: 'bg-warning-50', tint: colors.warningDark, value: draftCount, label: t('dashboard.stat.draftReports'), href: '/list/drafts', trend: trendOf(draftCount, prevAnalytics?.draftReports) },
    { id: 'completed', icon: 'checkmark-done-outline' as const, bg: 'bg-success-50', tint: colors.successDark, value: completedCount, label: t('dashboard.stat.completed'), href: '/list/completed', trend: trendOf(completedCount, prevAnalytics?.completedReports) },
    { id: 'followups', icon: 'notifications-outline' as const, bg: 'bg-accent-50', tint: colors.accent, value: followUpCount, label: t('dashboard.stat.pendingFollowups'), href: '/list/follow-ups', trend: trendOf(followUpCount, prevAnalytics?.pendingFollowUps) },
  ];

  const firstName = (doctorName || 'Doctor').replace(/^Dr\.?\s*/i, '').split(' ')[0] || 'Doctor';

  // 'en-CA' is the shortest honest way to get a local YYYY-MM-DD; toISOString()
  // would answer in UTC, which after 05:30 IST is a different day.
  const todayStr = new Date().toLocaleDateString('en-CA');
  const todaysQueue = upcoming.filter((a) => a.date === todayStr);
  const laterAppointments = upcoming.filter((a) => a.date !== todayStr).slice(0, 5);

  // "2026-09-12" -> "12 Sep". Rendered in UTC so the day cannot slip backwards.
  const prettyDate = (ymd: string): string => {
    const d = new Date(`${ymd}T00:00:00Z`);
    return Number.isNaN(d.getTime())
      ? ymd
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  // What became of this visit, in one word, or nothing when it is simply waiting.
  //
  // "Missed" is the sweep's opinion, not a fact: it marks a visit no-show an hour
  // after the slot, which in a running OPD means the doctor is late rather than
  // the patient absent. So it is shown as a label and the visit stays openable —
  // writing the note is what corrects the record.
  const badgeFor = (a: UpcomingAppointment): { text: string; cls: string } | null => {
    if (a.status === 'COMPLETED') return { text: t('dashboard.done', 'Done'), cls: 'bg-success-50' };
    if (a.status === 'NO_SHOW') return { text: t('dashboard.missed', 'Missed'), cls: 'bg-warning-50' };
    return null;
  };

  // The whole point of showing the appointment: the session opens already
  // attached to that patient, so nobody re-types a name that is already known.
  const scribeAppointment = (a: UpcomingAppointment) => {
    const con = startSessionForPatient(a.patientId, a.patientName);
    router.push(`/consultation/${con.id}?mode=record`);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-1 pr-3">
            {/* The wordmark itself, not the name set as text: अन्वय is drawn
                lettering in a display face this app does not ship, and setting
                it in the system font gives a different shape wearing the same
                letters. The artwork is the one the website uses. */}
            <Image
              source={require('../../assets/brand/anvaya-scribe.png')}
              style={{ width: 132, height: 42 }}
              resizeMode="contain"
              accessibilityLabel="Anvaya Scribe"
            />
            <Text className="text-slate-500 mt-3 text-[14px] font-medium">{t(g)}</Text>
            <Text
              className="text-[27px] font-extrabold text-slate-900 leading-8 mt-0.5"
              style={{ letterSpacing: -0.6 }}
              numberOfLines={1}
            >
              Dr. {firstName}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.8}>
            <Avatar name={doctorName || 'Dr'} size={46} />
          </TouchableOpacity>
        </View>

        {/* Hero — start a new consultation. A calm white card: colour appears
            only on the primary action and the soft mic disc, not the whole
            surface. */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => setModalOpen(true)}>
          <Card className="p-5 flex-row items-center" elevation="sm">
            <View className="flex-1 pr-3">
              <Text className="text-[12px] font-semibold text-brand-500 tracking-wide uppercase">
                {t('dashboard.startNew')}
              </Text>
              <Text className="text-[22px] font-bold text-slate-900 tracking-tight mt-1">
                {t('dashboard.consultation')}
              </Text>
              <Text className="text-[13px] text-slate-500 mt-1 leading-5">{t('dashboard.aiReady')}</Text>
              <View className="flex-row items-center gap-1.5 mt-4 self-start bg-brand-500 rounded-xl px-3.5 py-2">
                <Ionicons name="mic" size={14} color={colors.white} />
                <Text className="text-white font-semibold text-[13px]">{t('dashboard.tapToBegin')}</Text>
              </View>
            </View>
            <View className="w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center">
              <Ionicons name="mic-outline" size={28} color={colors.brand} />
            </View>
          </Card>
        </TouchableOpacity>

        {/* This login matches no doctor record. Without saying so, the queue
            below is simply empty — which reads as "nobody booked today" and is
            the one failure the doctor can neither see nor fix. */}
        {!linked && (
          <Card className="p-4 mt-4 flex-row items-start" elevation="sm">
            <Ionicons name="warning-outline" size={18} color={colors.warningDark} />
            <View className="flex-1 ml-2.5">
              <Text className="font-bold text-slate-900 text-[14px]">
                {t('dashboard.notLinkedTitle', 'Your appointments aren’t linked yet')}
              </Text>
              <Text className="text-[12.5px] text-slate-500 mt-1 leading-5">
                {t(
                  'dashboard.notLinkedBody',
                  'This login isn’t matched to a doctor record, so your booked patients can’t be shown. Ask your clinic admin to link it.',
                )}
              </Text>
            </View>
          </Card>
        )}

        {/* Today's queue — the booked patients, soonest first. One tap starts
            that patient's consultation. */}
        {todaysQueue.length > 0 && (
          <View className="mt-6">
            <SectionHeader
              icon="calendar-outline"
              title={t('dashboard.todaysQueue', "Today's Queue")}
            />
            <View className="gap-2.5">
              {todaysQueue.map((a) => (
                <TouchableOpacity key={a.id} onPress={() => scribeAppointment(a)} activeOpacity={0.7}>
                  <Card className="flex-row items-center p-3.5" elevation="sm">
                    <Avatar name={a.patientName} />
                    <View className="flex-1 ml-3">
                      <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                        {a.patientName}
                      </Text>
                      <View className="flex-row items-center mt-0.5">
                        <Ionicons name="time-outline" size={12} color={colors.slate400} />
                        <Text className="text-xs text-slate-500 ml-1">{a.time}</Text>
                        {badgeFor(a) && (
                          <View className={`ml-2 px-2 py-0.5 rounded-lg ${badgeFor(a)!.cls}`}>
                            <Text className="text-[10.5px] font-semibold text-slate-600">
                              {badgeFor(a)!.text}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1.5 bg-brand-500 rounded-xl px-3.5 py-2">
                      <Ionicons name="mic" size={14} color={colors.white} />
                      <Text className="text-white font-semibold text-[13px]">
                        {a.status === 'COMPLETED'
                          ? t('dashboard.addendum', 'Open')
                          : t('dashboard.start', 'Start')}
                      </Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Later days — visible but quiet: knowing tomorrow is full is useful,
            starting tomorrow's consultation today is not. */}
        {laterAppointments.length > 0 && (
          <View className="mt-6">
            <SectionHeader
              icon="calendar-outline"
              title={t('dashboard.upcomingAppointments', 'Upcoming Appointments')}
            />
            <View className="gap-2.5">
              {laterAppointments.map((a) => (
                <Card key={a.id} className="flex-row items-center p-3.5" elevation="sm">
                  <Avatar name={a.patientName} />
                  <View className="flex-1 ml-3">
                    <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                      {a.patientName}
                    </Text>
                    <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
                      {prettyDate(a.date)}, {a.time}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        )}

        {/* Practice Overview — section heading, then the compact period filter. */}
        <Text className="text-[17px] font-bold text-slate-900 tracking-tight mt-7 mb-3">
          {t('dashboard.practiceOverview')}
        </Text>
        <DateRangeBar range={range} onChange={setRange} />
        {statsError ? (
          <View className="mb-3">
            <ErrorBanner message={statsError} />
          </View>
        ) : null}
        <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
          {loading && consultations.length === 0
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" style={{ width: '47.5%' }} />)
            : stats.map((s) => (
                <StatCard
                  key={s.id}
                  icon={s.icon}
                  iconBg={s.bg}
                  iconColor={s.tint}
                  value={s.value}
                  label={s.label}
                  width="47.5%"
                  trend={s.trend}
                  onPress={() => router.push(s.href as never)}
                />
              ))}
        </View>

        {/* Recent — sits directly below the metric cards now that the duplicate
            summary widgets are gone. */}
        <View className="mt-6">
          <SectionHeader icon="time-outline" title={t('dashboard.recentConsultations')} action={t('dashboard.viewAll')} onAction={() => router.push('/sessions')} />
          <View className="mb-3">
            <SearchBar value={query} onChangeText={setQuery} placeholder={t('dashboard.searchPatients')} />
          </View>

          {loading && consultations.length === 0 ? (
            <View className="gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px]" />)}</View>
          ) : recent.length === 0 ? (
            <Card className="p-8 items-center" elevation="sm">
              <View className="w-14 h-14 rounded-full bg-brand-50 items-center justify-center mb-3">
                <Ionicons name="mic-outline" size={26} color={colors.brand} />
              </View>
              <Text className="font-bold text-slate-700">{t('dashboard.noConsultationsTitle')}</Text>
              <Text className="text-sm text-slate-400 mt-1 text-center">{t('dashboard.noConsultationsBody')}</Text>
            </Card>
          ) : (
            <View className="gap-2.5">
              {recent.map((con) => (
                <TouchableOpacity key={con.id} onPress={() => router.push(`/consultation/${con.id}`)} activeOpacity={0.7}>
                  <Card className="flex-row items-center p-3.5" elevation="sm">
                    <Avatar name={con.patientName} />
                    <View className="flex-1 ml-3">
                      <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                        {con.patientName || 'Unknown Patient'}
                      </Text>
                      <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
                        {sessionLabel(con, t('dashboard.newSession'))}
                      </Text>
                      <View className="flex-row items-center gap-1.5 mt-1.5">
                        <Ionicons name="time-outline" size={12} color={colors.slate400} />
                        <Text className="text-xs text-slate-400">{con.date}</Text>
                      </View>
                    </View>
                    <View className="items-end gap-2">
                      <StatusBadge status={con.status} small />
                      <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <NewConsultationModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </SafeAreaView>
  );
}
