import React, { ReactNode } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { IconButton, EmptyState, Button } from '../ui';
import { colors, gradients, gradientProps } from '../../theme';
import { useAuth } from '../../context/Auth';
import { Permission, NotificationType, SearchEntity } from '../../contracts';

type Ion = keyof typeof Ionicons.glyphMap;

// ── Formatters ───────────────────────────────────────────────

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** ₹ money formatter (Indian grouping). */
export function formatMoney(n: number): string {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

// ── Notification presentation ────────────────────────────────
export const NOTIFICATION_META: Record<NotificationType, { icon: Ion; tint: string; bg: string }> = {
  failed_stt: { icon: 'mic-off-outline', tint: colors.errorDark, bg: 'bg-error-50' },
  failed_report: { icon: 'document-lock-outline', tint: colors.errorDark, bg: 'bg-error-50' },
  doctor_login: { icon: 'log-in-outline', tint: colors.brand, bg: 'bg-brand-50' },
  new_consultation: { icon: 'pulse-outline', tint: colors.accent, bg: 'bg-accent-50' },
  new_patient: { icon: 'person-add-outline', tint: colors.successDark, bg: 'bg-success-50' },
};

// ── Global-search entity presentation ────────────────────────
export const SEARCH_ENTITY_META: Record<SearchEntity, { icon: Ion; label: string; tint: string; bg: string }> = {
  patient: { icon: 'people-outline', label: 'Patients', tint: colors.brand, bg: 'bg-brand-50' },
  doctor: { icon: 'medkit-outline', label: 'Doctors', tint: colors.accent, bg: 'bg-accent-50' },
  report: { icon: 'document-text-outline', label: 'Reports', tint: colors.successDark, bg: 'bg-success-50' },
  medicine: { icon: 'medical-outline', label: 'Medicines', tint: colors.warningDark, bg: 'bg-warning-50' },
  icd: { icon: 'pricetag-outline', label: 'ICD Codes', tint: '#0EA5E9', bg: 'bg-brand-50' },
  loinc: { icon: 'flask-outline', label: 'LOINC Tests', tint: '#EC4899', bg: 'bg-accent-50' },
  rxnorm: { icon: 'bandage-outline', label: 'RxNorm', tint: '#14B8A6', bg: 'bg-success-50' },
};

// ── Gradient stack header (matches patient/report detail screens) ──
export function AdminHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <View className="overflow-hidden">
      <LinearGradient colors={gradients.brand as any} {...gradientProps.horizontal} className="absolute inset-0" />
      <View className="flex-row items-center gap-3 px-4 pt-3 pb-3">
        <IconButton icon="arrow-back" onPress={() => router.back()} bg="bg-white/20" color={colors.white} />
        <View className="flex-1">
          <Text className="text-base font-bold text-white" numberOfLines={1}>{title}</Text>
          {subtitle ? <Text className="text-xs text-white/70" numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

/**
 * Wraps an admin sub-section. Renders the gradient header, hides the native
 * Stack header, and gates the body: shows a spinner while the session hydrates,
 * a "sign in" prompt when logged out, and an "access denied" state when the
 * signed-in role lacks `permission`. The permission check mirrors the server.
 */
export function AdminScreen({
  title,
  subtitle,
  permission,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  permission: Permission;
  right?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AdminHeader title={title} subtitle={subtitle} right={right} />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !user ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Sign in required"
          subtitle="Open the Admin tab to sign in to the console."
          action={<Button label="Go to Admin" icon="shield-outline" onPress={() => router.replace('/admin')} />}
        />
      ) : !hasPermission(permission) ? (
        <EmptyState
          icon="shield-outline"
          title="Access denied"
          subtitle="Your role doesn't have permission to view this section."
        />
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

// A small labeled tappable row used across admin lists.
export function InfoRow({
  icon,
  label,
  value,
  tint = colors.slate500,
}: {
  icon: Ion;
  label: string;
  value?: string;
  tint?: string;
}) {
  return (
    <View className="flex-row items-center gap-2 py-1.5">
      <Ionicons name={icon} size={14} color={tint} />
      <Text className="text-xs text-slate-500">{label}</Text>
      {value ? <Text className="text-xs font-semibold text-slate-700 ml-auto">{value}</Text> : null}
    </View>
  );
}

// Quick-link card used on the dashboard to reach a sub-section.
export function QuickLink({
  icon,
  label,
  desc,
  tint,
  bg,
  onPress,
}: {
  icon: Ion;
  label: string;
  desc: string;
  tint: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ width: '47.5%' }}>
      <View className="bg-white border border-slate-100 rounded-3xl p-4" style={{ shadowColor: '#1E293B', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
        <View className={`w-10 h-10 rounded-2xl items-center justify-center ${bg}`}>
          <Ionicons name={icon} size={19} color={tint} />
        </View>
        <Text className="font-bold text-slate-900 text-[14px] mt-3">{label}</Text>
        <Text className="text-[11px] text-slate-400 mt-0.5" numberOfLines={2}>{desc}</Text>
      </View>
    </TouchableOpacity>
  );
}
