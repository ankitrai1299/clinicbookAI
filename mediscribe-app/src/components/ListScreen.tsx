// Shared chrome for the four dashboard drill-down screens.
//
// They differ only in what they list and which actions each row offers, so the
// header, safe areas, pull-to-refresh, loading skeletons and empty state live
// here once. Matches the existing screens: same canvas, same 20pt gutters, same
// back affordance as the consultation and report screens.
import React, { ReactNode } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState, Skeleton, ErrorBanner } from './ui';
import DateRangeBar from './DateRangeBar';
import { useDateFilter } from '../context/DateFilter';
import { rangeLabel } from '../utils/dateRange';
import { colors } from '../theme';

export function ListScreen({
  title,
  subtitle,
  count,
  loading,
  onRefresh,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  isEmpty: boolean;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptySubtitle?: string;
  /** Surfaced above the list; the range bar stays usable so it can be retried. */
  error?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const { range, setRange } = useDateFilter();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-5 pt-2 pb-3 flex-row items-center gap-3">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="w-9 h-9 rounded-full bg-white items-center justify-center"
          style={{ elevation: 1 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.slate700} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-[22px] font-bold text-slate-900 tracking-tight" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-xs text-slate-400 mt-0.5" numberOfLines={1}>
            {rangeLabel(range)}
            {subtitle ? ` · ${subtitle}` : ''}
          </Text>
        </View>
        {!loading && !isEmpty ? (
          <View className="bg-brand-50 rounded-full px-3 py-1">
            <Text className="text-[13px] font-bold text-brand-600">{count}</Text>
          </View>
        ) : null}
      </View>

      <View className="px-5">
        <DateRangeBar range={range} onChange={setRange} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.brand} />
        }
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorBanner message={error} /> : null}
        {loading && isEmpty ? (
          <View className="gap-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[92px]" />
            ))}
          </View>
        ) : isEmpty ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} />
        ) : (
          children
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One tappable row. `actions` renders the action strip beneath the summary. */
export function ListRow({
  onPress,
  children,
  actions,
}: {
  onPress?: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const body = (
    <Card className="p-3.5" elevation="sm">
      <View className="flex-row items-center">{children}</View>
      {actions ? (
        <View className="flex-row gap-2 mt-3 pt-3 border-t border-slate-100">{actions}</View>
      ) : null}
    </Card>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {body}
    </TouchableOpacity>
  );
}

/**
 * A compact action button used inside a row.
 *
 * `busy` disables it and swaps the label, because export and delete both take
 * long enough that a doctor would otherwise tap twice.
 */
export function RowAction({
  icon,
  label,
  tone = 'brand',
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: 'brand' | 'success' | 'danger' | 'slate';
  onPress: () => void;
  busy?: boolean;
}) {
  const tint =
    tone === 'success'
      ? colors.successDark
      : tone === 'danger'
        ? colors.errorDark
        : tone === 'slate'
          ? colors.slate500
          : colors.brand;
  const bg =
    tone === 'success'
      ? 'bg-success-50'
      : tone === 'danger'
        ? 'bg-error-50'
        : tone === 'slate'
          ? 'bg-slate-50'
          : 'bg-brand-50';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl ${bg}`}
      style={busy ? { opacity: 0.5 } : undefined}
    >
      <Ionicons name={busy ? 'hourglass-outline' : icon} size={15} color={tint} />
      <Text className="text-[12.5px] font-semibold" style={{ color: tint }} numberOfLines={1}>
        {busy ? 'Working…' : label}
      </Text>
    </TouchableOpacity>
  );
}
