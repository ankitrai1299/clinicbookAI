import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReportData } from '../types';
import { buildVisitComparison, reportHasClinicalContent } from '../utils/compareVisits';
import { Card, Chip } from './ui';
import { colors } from '../theme';

type Tone = 'good' | 'warn' | 'info' | 'neutral';
const CHIP_TONE: Record<Tone, 'success' | 'warning' | 'brand' | 'neutral'> = {
  good: 'success',
  warn: 'warning',
  info: 'brand',
  neutral: 'neutral',
};

// One labelled group of chips (e.g. "New", "Resolved") — hidden when empty.
function ChangeGroup({ label, items, tone }: { label: string; items: string[]; tone: Tone }) {
  if (!items.length) return null;
  return (
    <View className="gap-1.5">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {items.map((it, i) => (
          <Chip key={i} label={it} tone={CHIP_TONE[tone]} />
        ))}
      </View>
    </View>
  );
}

// A titled sub-section inside the compare card — omitted entirely when empty.
function CompareSection({ title, children, show }: { title: string; children: React.ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <View className="gap-2">
      <Text className="text-[13px] font-bold text-slate-700">{title}</Text>
      {children}
    </View>
  );
}

const progressTone = (label: string): 'success' | 'warning' | 'brand' | 'neutral' =>
  label === 'Improving' ? 'success' : label === 'Needs attention' ? 'warning' : label === 'Mixed' ? 'brand' : 'neutral';

/**
 * "Compare Previous Visit" panel — mirrors the NovaScribe web app: symptom
 * changes, vital changes (prev → current), medicine changes, test changes and an
 * overall-progress badge. Read-only.
 */
export default function CompareVisit({
  current,
  previous,
  previousDate,
}: {
  current: ReportData;
  previous: ReportData | null;
  previousDate?: string;
}) {
  const currentHasReport = reportHasClinicalContent(current);
  const cmp = previous && currentHasReport ? buildVisitComparison(previous, current) : null;

  return (
    <Card className="overflow-hidden p-0" elevation="sm">
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
        <Ionicons name="pulse" size={16} color={colors.brand} />
        <Text className="text-[14px] font-bold text-slate-900">Compare Previous Visit</Text>
        {previous && previousDate ? <Text className="text-xs text-slate-400">· vs {previousDate}</Text> : null}
      </View>

      <View className="p-4">
        {!previous ? (
          <Text className="text-sm text-slate-500">No previous visit available for comparison.</Text>
        ) : !currentHasReport ? (
          <Text className="text-sm text-slate-500">Generate the current report to compare it with the previous visit.</Text>
        ) : !cmp?.hasAny ? (
          <Text className="text-sm text-slate-500">No comparable changes between these two visits.</Text>
        ) : (
          <View className="gap-4">
            {/* Symptom changes */}
            <CompareSection
              title="Symptom Changes"
              show={!!(cmp.symptoms.added.length || cmp.symptoms.resolved.length || cmp.symptoms.continuing.length)}
            >
              <View className="gap-2">
                <ChangeGroup label="New" items={cmp.symptoms.added} tone="warn" />
                <ChangeGroup label="Resolved" items={cmp.symptoms.resolved} tone="good" />
                <ChangeGroup label="Continuing" items={cmp.symptoms.continuing} tone="neutral" />
              </View>
            </CompareSection>

            {/* Vital changes */}
            <CompareSection title="Vital Changes" show={cmp.vitals.length > 0}>
              <View className="gap-1.5">
                {cmp.vitals.map((v, i) => (
                  <View key={i} className="flex-row items-center justify-between gap-2">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex-1" numberOfLines={2}>
                      {v.label}
                    </Text>
                    <View className="flex-row items-center gap-1.5 flex-[2] justify-end flex-wrap">
                      <Text className="text-[13px] text-slate-500 text-right">{v.previous}</Text>
                      <Ionicons
                        name={v.direction === 'up' ? 'arrow-up' : v.direction === 'down' ? 'arrow-down' : 'arrow-forward'}
                        size={13}
                        color={colors.slate400}
                      />
                      <Text className="text-[13px] font-bold text-slate-800 text-right">{v.current}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </CompareSection>

            {/* Medicine changes */}
            <CompareSection
              title="Medicine Changes"
              show={!!(cmp.medicines.started.length || cmp.medicines.stopped.length || cmp.medicines.continued.length)}
            >
              <View className="gap-2">
                <ChangeGroup label="Started" items={cmp.medicines.started} tone="info" />
                <ChangeGroup label="Stopped" items={cmp.medicines.stopped} tone="warn" />
                <ChangeGroup label="Continued" items={cmp.medicines.continued} tone="neutral" />
              </View>
            </CompareSection>

            {/* Test result changes */}
            <CompareSection
              title="Test Result Changes"
              show={!!(cmp.tests.added.length || cmp.tests.removed.length || cmp.tests.continuing.length)}
            >
              <View className="gap-2">
                <ChangeGroup label="New" items={cmp.tests.added} tone="info" />
                <ChangeGroup label="No longer noted" items={cmp.tests.removed} tone="neutral" />
                <ChangeGroup label="Continuing" items={cmp.tests.continuing} tone="neutral" />
              </View>
            </CompareSection>

            {/* Overall health progress */}
            {cmp.progress ? (
              <CompareSection title="Overall Health Progress" show>
                <View className="flex-row items-start gap-2">
                  <Chip label={cmp.progress.label} tone={progressTone(cmp.progress.label)} />
                  <Text className="text-[13px] text-slate-600 flex-1">{cmp.progress.summary}</Text>
                </View>
              </CompareSection>
            ) : null}
          </View>
        )}
      </View>
    </Card>
  );
}
