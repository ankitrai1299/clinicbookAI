import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatCard, SectionLabel, ErrorBanner, Chip, Skeleton } from '../../src/components/ui';
import { LoginForm } from '../../src/components/admin/LoginForm';
import { QuickLink, formatBytes, formatMoney } from '../../src/components/admin/shared';
import { LineChart, BarChart, DonutChart, RankBars } from '../../src/components/admin/charts';
import { useAuth } from '../../src/context/Auth';
import { getOverview, getAnalytics, getNotifications } from '../../src/services/api';
import { AdminOverview, AdminAnalytics, ROLE_LABELS, Permission } from '../../src/contracts';
import { colors } from '../../src/theme';
import type { Href } from 'expo-router';

type Ion = keyof typeof Ionicons.glyphMap;

// Cumulative series for the patient-growth line (contract sends cumulative, but
// guard by making it monotonic just in case a raw series slips through).
const toCumulative = (pts: { label: string; value: number }[]) => {
  let run = 0;
  let alreadyCumulative = true;
  for (let i = 1; i < pts.length; i++) if (pts[i].value < pts[i - 1].value) alreadyCumulative = false;
  if (alreadyCumulative) return pts;
  return pts.map((p) => ({ label: p.label, value: (run += p.value) }));
};

export default function AdminHome() {
  const router = useRouter();
  const { user, token, loading, logout, hasPermission } = useAuth();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const [ov, an, notifs] = await Promise.all([
        getOverview(token),
        getAnalytics(token),
        getNotifications(token).catch(() => []),
      ]);
      setOverview(ov);
      setAnalytics(an);
      setUnread((notifs || []).filter((n) => !n.read).length);
    } catch (e: any) {
      setError(e?.message || 'Could not load the dashboard.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (user && token) load();
  }, [user, token, load]);

  // Refresh unread badge / stats when returning to the tab.
  useFocusEffect(
    useCallback(() => {
      if (user && token) load();
    }, [user, token, load]),
  );

  // ── Loading the persisted session ──
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center" edges={['top']}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  // ── Logged out → login ──
  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center gap-1.5 mb-4">
            <Ionicons name="sparkles" size={13} color={colors.brand} />
            <Text className="text-[13px] font-bold text-brand-500 tracking-tight">NovaScribe AI · Admin</Text>
          </View>
          <LoginForm />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── KPI tiles (all 13 overview metrics) ──
  const kpis: { icon: Ion; bg: string; tint: string; value: number | string; label: string }[] = overview
    ? [
        { icon: 'medkit-outline', bg: 'bg-brand-50', tint: colors.brand, value: overview.totalDoctors, label: 'Total Doctors' },
        { icon: 'pulse-outline', bg: 'bg-success-50', tint: colors.successDark, value: overview.activeDoctors, label: 'Active Doctors' },
        { icon: 'people-outline', bg: 'bg-accent-50', tint: colors.accent, value: overview.totalPatients, label: 'Total Patients' },
        { icon: 'documents-outline', bg: 'bg-brand-50', tint: colors.brand, value: overview.totalConsultations, label: 'Total Consultations' },
        { icon: 'today-outline', bg: 'bg-warning-50', tint: colors.warningDark, value: overview.todayConsultations, label: "Today's Consultations" },
        { icon: 'calendar-outline', bg: 'bg-accent-50', tint: colors.accent, value: overview.monthlyConsultations, label: 'Monthly Consultations' },
        { icon: 'document-text-outline', bg: 'bg-success-50', tint: colors.successDark, value: overview.reportsGenerated, label: 'Reports Generated' },
        { icon: 'create-outline', bg: 'bg-warning-50', tint: colors.warningDark, value: overview.draftReports, label: 'Draft Reports' },
        { icon: 'cash-outline', bg: 'bg-slate-100', tint: colors.slate500, value: formatMoney(overview.totalRevenue), label: 'Total Revenue · soon' },
        { icon: 'person-circle-outline', bg: 'bg-brand-50', tint: colors.brand, value: overview.activeUsers, label: 'Active Users' },
        { icon: 'mic-outline', bg: 'bg-accent-50', tint: colors.accent, value: overview.sttRequests, label: 'STT Requests' },
        { icon: 'sparkles-outline', bg: 'bg-success-50', tint: colors.successDark, value: overview.aiReportRequests, label: 'AI Report Requests' },
        { icon: 'server-outline', bg: 'bg-slate-100', tint: colors.slate600, value: formatBytes(overview.storageUsedBytes), label: 'Storage Used' },
      ]
    : [];

  // ── Quick links (permission-gated) ──
  const ALL_LINKS: { icon: Ion; label: string; desc: string; tint: string; bg: string; route: Href; perm: Permission }[] = [
    { icon: 'medkit-outline', label: 'Doctors', desc: 'Manage doctor accounts', tint: colors.brand, bg: 'bg-brand-50', route: '/admin/doctors', perm: 'doctors.view' },
    { icon: 'people-outline', label: 'Patients', desc: 'Records & history', tint: colors.accent, bg: 'bg-accent-50', route: '/admin/patients', perm: 'patients.view' },
    { icon: 'pulse-outline', label: 'Consultations', desc: 'Live / draft / failed', tint: colors.successDark, bg: 'bg-success-50', route: '/admin/consultations', perm: 'consultations.view' },
    { icon: 'document-text-outline', label: 'Reports', desc: 'Export & review', tint: colors.warningDark, bg: 'bg-warning-50', route: '/admin/reports', perm: 'reports.view' },
    { icon: 'bar-chart-outline', label: 'Analytics', desc: 'Trends & top codes', tint: colors.brand, bg: 'bg-brand-50', route: '/admin/analytics', perm: 'analytics.view' },
    { icon: 'language-outline', label: 'Languages', desc: '10-language usage', tint: colors.accent, bg: 'bg-accent-50', route: '/admin/languages', perm: 'analytics.view' },
    { icon: 'notifications-outline', label: 'Notifications', desc: 'Alerts & activity', tint: colors.warningDark, bg: 'bg-warning-50', route: '/admin/notifications', perm: 'notifications.view' },
    { icon: 'shield-checkmark-outline', label: 'Roles & Users', desc: 'Permissions matrix', tint: colors.successDark, bg: 'bg-success-50', route: '/admin/roles', perm: 'users.manage' },
    { icon: 'settings-outline', label: 'Settings', desc: 'Providers & backup', tint: colors.slate600, bg: 'bg-slate-100', route: '/admin/settings', perm: 'settings.view' },
    { icon: 'search-outline', label: 'Global Search', desc: 'Everything, everywhere', tint: colors.brand, bg: 'bg-brand-50', route: '/admin/search', perm: 'dashboard.view' },
  ];
  const links = ALL_LINKS.filter((l) => hasPermission(l.perm));

  const confirmLogout = () =>
    Alert.alert('Sign out', 'Sign out of the admin console?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);

  const showData = hasPermission('dashboard.view');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-1 pr-2">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="shield-checkmark" size={13} color={colors.brand} />
              <Text className="text-[13px] font-bold text-brand-500 tracking-tight">Admin Console</Text>
            </View>
            <Text className="text-[26px] font-bold text-slate-900 tracking-tight leading-8 mt-1" numberOfLines={1}>
              {user.name}
            </Text>
            <View className="flex-row items-center gap-2 mt-1.5">
              <Chip label={ROLE_LABELS[user.role]} tone="brand" icon="ribbon-outline" />
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity onPress={() => router.push('/admin/notifications')} activeOpacity={0.8} className="w-11 h-11 rounded-full bg-white border border-slate-100 items-center justify-center" style={{ elevation: 1 }}>
              <Ionicons name="notifications-outline" size={20} color={colors.slate700} />
              {unread > 0 ? (
                <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error-500 items-center justify-center">
                  <Text className="text-white text-[10px] font-bold">{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmLogout} activeOpacity={0.8} className="w-11 h-11 rounded-full bg-white border border-slate-100 items-center justify-center" style={{ elevation: 1 }}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        {error ? <View className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></View> : null}

        {showData ? (
          <>
            {/* KPI grid */}
            <SectionLabel className="mb-3">Overview</SectionLabel>
            <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
              {!overview
                ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" style={{ width: '47.5%' }} />)
                : kpis.map((k) => (
                    <StatCard key={k.label} icon={k.icon} iconBg={k.bg} iconColor={k.tint} value={k.value} label={k.label} width="47.5%" />
                  ))}
            </View>

            {/* Charts */}
            {analytics ? (
              <View className="mt-7 gap-4">
                <SectionLabel>Analytics</SectionLabel>
                <LineChart title="Daily Consultations" subtitle="Last 14 days" icon="pulse-outline" data={analytics.dailyConsultations} color={colors.brand} />
                <BarChart title="Weekly Usage" subtitle="Last 8 weeks" icon="calendar-outline" data={analytics.weeklyUsage} color={colors.accent} />
                <BarChart title="Monthly Analytics" subtitle="Last 6 months" icon="bar-chart-outline" data={analytics.monthlyAnalytics} color={colors.brand} />
                <DonutChart title="Language Usage" subtitle="Consultations by language" data={analytics.languageUsage} />
                <LineChart title="AI Report Usage" subtitle="Reports generated" icon="sparkles-outline" data={analytics.aiReportUsage} color={colors.success} />
                <LineChart title="STT Accuracy" subtitle="Avg confidence %" icon="mic-outline" data={analytics.sttAccuracy} color={colors.warning} suffix="%" />
                <RankBars title="Doctor Activity" subtitle="Consultations per doctor" icon="podium-outline" data={analytics.doctorActivity} color={colors.brand} />
                <LineChart title="Patient Growth" subtitle="Cumulative patients" icon="trending-up-outline" data={toCumulative(analytics.patientGrowth)} color={colors.accent} />
              </View>
            ) : busy ? (
              <View className="mt-7 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</View>
            ) : null}
          </>
        ) : null}

        {/* Quick links */}
        <View className="mt-7">
          <SectionLabel className="mb-3">Manage</SectionLabel>
          <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
            {links.map((l) => (
              <QuickLink key={l.label} icon={l.icon} label={l.label} desc={l.desc} tint={l.tint} bg={l.bg} onPress={() => router.push(l.route)} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
