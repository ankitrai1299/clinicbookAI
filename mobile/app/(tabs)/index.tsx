import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Consultation } from '../../src/types';
import { useAppData } from '../../src/context/AppData';
import { useAuth } from '../../src/context/Auth';
import { loadSettings } from '../../src/services/storage';
import {
  Card,
  GradientCard,
  SearchBar,
  StatusBadge,
  Avatar,
  StatCard,
  Skeleton,
  SectionHeader,
} from '../../src/components/ui';
import MicOrb from '../../src/components/MicOrb';
import Waveform from '../../src/components/Waveform';
import NewConsultationModal from '../../src/components/NewConsultationModal';
import { colors, gradients } from '../../src/theme';

const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const sessionLabel = (c: Consultation): string =>
  c.report?.chiefComplaint?.find(Boolean) ||
  (c.transcript || []).map((l) => l.text).join(' ').trim() ||
  'New session';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '👋' };
  return { text: 'Good evening', emoji: '🌙' };
};

export default function Dashboard() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const { consultations, loading, reload } = useAppData();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [doctorName, setDoctorName] = useState('');

  useEffect(() => {
    loadSettings().then((s) => setDoctorName(s.doctorName || ''));
  }, []);

  const now = new Date();
  const g = greeting();

  // ── Stats ──────────────────────────────────────────────────
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
    return !Number.isNaN(d.getTime()) ? d.getTime() >= new Date().setHours(0, 0, 0, 0) : true;
  }).length;

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

  const stats = [
    { icon: 'today-outline' as const, bg: 'bg-brand-50', tint: colors.brand, value: todayCount, label: "Today's Consultations", delta: '12%', up: true },
    { icon: 'create-outline' as const, bg: 'bg-warning-50', tint: colors.warningDark, value: draftCount, label: 'Draft Reports', delta: '8%', up: true },
    { icon: 'checkmark-done-outline' as const, bg: 'bg-success-50', tint: colors.successDark, value: completedCount, label: 'Completed', delta: '15%', up: true },
    { icon: 'notifications-outline' as const, bg: 'bg-accent-50', tint: colors.accent, value: followUpCount, label: 'Pending Follow-ups', delta: '5%', up: true },
  ];

  const firstName = (doctorName || 'Doctor').replace(/^Dr\.?\s*/i, '').split(' ')[0] || 'Doctor';

  // Role-based landing: a role without Dashboard access (e.g. Staff) never sees this
  // screen — send them to their first available tab.
  if (user && !hasPermission('dashboard.view')) {
    const href = hasPermission('patients.view')
      ? '/(tabs)/patients'
      : hasPermission('consultations.view')
        ? '/(tabs)/sessions'
        : hasPermission('analytics.view')
          ? '/(tabs)/admin'
          : '/(tabs)/settings';
    return <Redirect href={href as never} />;
  }

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
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="sparkles" size={13} color={colors.brand} />
              <Text className="text-[13px] font-bold text-brand-500 tracking-tight">NovaScribe AI</Text>
            </View>
            <Text className="text-slate-500 mt-2 text-[15px]">
              {g.text}, {g.emoji}
            </Text>
            <Text className="text-[26px] font-bold text-slate-900 tracking-tight leading-8" numberOfLines={1}>
              Dr. {firstName}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.8}>
            <Avatar name={doctorName || 'Dr'} size={48} online />
          </TouchableOpacity>
        </View>

        {/* Hero — Start a new consultation */}
        <TouchableOpacity activeOpacity={0.92} onPress={() => setModalOpen(true)}>
          <GradientCard colors={gradients.brand as unknown as string[]} glow className="p-5">
            <View className="flex-row items-center">
              <View className="flex-1 pr-2">
                <Text className="text-white/80 text-[13px] font-medium">Start a New</Text>
                <Text className="text-white text-[24px] font-bold tracking-tight">Consultation</Text>
                <Text className="text-white/75 text-[13px] mt-1">AI Scribe is ready to listen</Text>
                <View className="flex-row items-center gap-1.5 mt-3 self-start bg-white/20 rounded-full px-3 py-1.5">
                  <Text className="text-white font-semibold text-[13px]">Tap to begin</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.white} />
                </View>
              </View>
              <MicOrb size={64} active onPress={() => setModalOpen(true)} ringColor="rgba(255,255,255,0.4)" coreColors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.12)']} glow={false} />
            </View>
            <View className="mt-3 opacity-90">
              <Waveform active paused={false} color="rgba(255,255,255,0.9)" idleColor="rgba(255,255,255,0.35)" height={26} />
            </View>
          </GradientCard>
        </TouchableOpacity>

        {/* Today at a glance */}
        <Text className="text-[13px] font-bold uppercase tracking-wider text-slate-400 mt-6 mb-3">Today at a glance</Text>
        <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
          {loading && consultations.length === 0
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" style={{ width: '47.5%' }} />)
            : stats.map((s) => (
                <StatCard
                  key={s.label}
                  icon={s.icon}
                  iconBg={s.bg}
                  iconColor={s.tint}
                  value={s.value}
                  label={s.label}
                  width="47.5%"
                  delta={s.delta}
                  deltaUp={s.up}
                />
              ))}
        </View>

        {/* Recent */}
        <View className="mt-7">
          <SectionHeader icon="time-outline" title="Recent Consultations" action="View all" onAction={() => router.push('/sessions')} />
          <View className="mb-3">
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search patients..." />
          </View>

          {loading && consultations.length === 0 ? (
            <View className="gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px]" />)}</View>
          ) : recent.length === 0 ? (
            <Card className="p-8 items-center" elevation="sm">
              <View className="w-14 h-14 rounded-full bg-brand-50 items-center justify-center mb-3">
                <Ionicons name="mic-outline" size={26} color={colors.brand} />
              </View>
              <Text className="font-bold text-slate-700">No consultations yet</Text>
              <Text className="text-sm text-slate-400 mt-1 text-center">Tap the hero card to record your first one.</Text>
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
                        {sessionLabel(con)}
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
