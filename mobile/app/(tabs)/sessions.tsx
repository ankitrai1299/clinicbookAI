import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Consultation } from '../../src/types';
import { useAppData } from '../../src/context/AppData';
import { Card, SearchBar, StatusBadge, Avatar, Skeleton, EmptyState, TimelineItem } from '../../src/components/ui';
import Waveform from '../../src/components/Waveform';
import { colors } from '../../src/theme';

const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};
const sessionYMD = (c: Consultation) => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() } : null;
};
const parseDateQuery = (q: string) => {
  const parts = q.split(/[/\-.]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return [];
  const [a, b, c] = parts.map(Number);
  if ([a, b, c].some((n) => Number.isNaN(n))) return [];
  const out: { y: number; m: number; d: number }[] = [];
  if (a >= 1 && a <= 12 && b >= 1 && b <= 31) out.push({ m: a, d: b, y: c });
  if (b >= 1 && b <= 12 && a >= 1 && a <= 31) out.push({ m: b, d: a, y: c });
  return out;
};
const matchesDate = (c: Consultation, q: string) => {
  const cands = parseDateQuery(q);
  if (cands.length) {
    const t = sessionYMD(c);
    return !!t && cands.some((cd) => cd.y === t.y && cd.m === t.m && cd.d === t.d);
  }
  return [c.patientName, c.date].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase());
};
const order = (items: Consultation[], q: string) => {
  const sorted = [...items].sort((a, b) => sessionTime(b) - sessionTime(a));
  if (!q.trim()) return sorted;
  const m: Consultation[] = [], r: Consultation[] = [];
  for (const s of sorted) (matchesDate(s, q.trim()) ? m : r).push(s);
  return [...m, ...r];
};

const fmtDuration = (sec?: number) => {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const timeLabel = (c: Consultation) => {
  const raw = c?.updatedAt || c?.createdAt;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
};

export default function Sessions() {
  const router = useRouter();
  const { consultations, loading, reload } = useAppData();
  const [query, setQuery] = useState('');

  const ordered = order(consultations, query);

  const ActionPill = ({ icon, label, tone, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; tone: 'success' | 'brand'; onPress: () => void }) => {
    const c = tone === 'success' ? colors.successDark : colors.brand;
    const bg = tone === 'success' ? 'bg-success-50' : 'bg-brand-50';
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl ${bg}`}>
        <Ionicons name={icon} size={15} color={c} />
        <Text className="text-[13px] font-semibold" style={{ color: c }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <Text className="text-[26px] font-bold text-slate-900 tracking-tight">Sessions</Text>
        <Text className="text-slate-500 mt-0.5 text-[13px]">
          {consultations.length} recorded consultation{consultations.length === 1 ? '' : 's'}
        </Text>
      </View>
      <View className="px-5 pb-3">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by patient or date (MM/DD/YYYY)" />
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && consultations.length === 0 ? (
          <View className="gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[200px]" />)}</View>
        ) : ordered.length === 0 ? (
          <EmptyState icon="pulse-outline" title="No sessions found" subtitle="Recorded consultations will appear here." />
        ) : (
          <View className="gap-3">
            {ordered.map((c) => {
              const dur = fmtDuration(c.durationSec);
              const t = timeLabel(c);
              const hasTranscript = (c.transcript?.length || 0) > 0 || !!c.transcriptText;
              const hasReport = !!c.report && (!!c.report.clinicalOverview || (c.report.chiefComplaint?.length || 0) > 0);
              const isRecording = c.status === 'Recording';
              return (
                <TouchableOpacity key={c.id} onPress={() => router.push(`/consultation/${c.id}`)} activeOpacity={0.75}>
                  <Card className="p-4" elevation="sm">
                    {/* Header */}
                    <View className="flex-row items-center">
                      <Avatar name={c.patientName} size={42} />
                      <View className="flex-1 ml-3">
                        <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                          {c.patientName || 'Unknown Patient'}
                        </Text>
                        <Text className="text-xs text-slate-500 mt-0.5">
                          {c.date}
                          {t ? ` · ${t}` : ''}
                        </Text>
                      </View>
                      <StatusBadge status={c.status} small />
                    </View>

                    {/* Pipeline timeline */}
                    <View className="mt-4 pl-1">
                      <TimelineItem
                        title="Recording"
                        active={isRecording}
                        done={!isRecording}
                        time={dur || undefined}
                        meta={
                          <View className="opacity-90">
                            <Waveform active={isRecording} paused={!isRecording} height={14} color={colors.brand} idleColor={colors.slate200} />
                          </View>
                        }
                      />
                      <TimelineItem title="Transcript Ready" done={hasTranscript} active={!hasTranscript && !isRecording} />
                      <TimelineItem title="AI Report Ready" done={hasReport} active={hasTranscript && !hasReport} last />
                    </View>

                    {/* Actions */}
                    <View className="flex-row gap-2.5 mt-1">
                      <ActionPill icon="document-text-outline" label="Transcript" tone="success" onPress={() => router.push(`/consultation/${c.id}`)} />
                      <ActionPill
                        icon="sparkles-outline"
                        label="Report"
                        tone="brand"
                        onPress={() => router.push(hasReport ? (`/report/${c.id}` as any) : (`/consultation/${c.id}` as any))}
                      />
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
