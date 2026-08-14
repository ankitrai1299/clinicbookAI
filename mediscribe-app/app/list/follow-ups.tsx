// Pending Follow-ups — who is due back, and the actions to move each one on.
import React, { useState } from 'react';
import { View, Text, Alert, Modal, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../../src/context/AppData';
import { useDateFilter } from '../../src/context/DateFilter';
import { useRangedConsultations } from '../../src/hooks/useRangedConsultations';
import { Avatar, Card } from '../../src/components/ui';
import { ListScreen, ListRow, RowAction } from '../../src/components/ListScreen';
import { saveConsultation } from '../../src/services/api';
import { normalizeReport } from '../../src/utils/report';
import { Consultation } from '../../src/types';
import {
  pendingFollowUps,
  followUpReason,
  isOverdue,
  formatDate,
  relativeDay,
  followUpDueLabel,
} from '../../src/utils/dashboard';
import { colors } from '../../src/theme';

// Scheduling offers intervals rather than a calendar. A follow-up is dictated as
// "come back in two weeks", not as a date, and this avoids pulling in a native
// date-picker dependency for what is almost always one of these.
const INTERVALS: { labelKey: string; days: number }[] = [
  { labelKey: 'lists.followups.interval.in3days', days: 3 },
  { labelKey: 'lists.followups.interval.in1week', days: 7 },
  { labelKey: 'lists.followups.interval.in2weeks', days: 14 },
  { labelKey: 'lists.followups.interval.in1month', days: 30 },
  { labelKey: 'lists.followups.interval.in3months', days: 90 },
  { labelKey: 'lists.followups.interval.in6months', days: 180 },
];

const addDays = (days: number): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export default function FollowUpsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { updateSession } = useAppData();
  const { range } = useDateFilter();
  // `pendingFollowUps: true` asks for consultations in the range that requested
  // a follow-up and have not had it closed off — the same filter the dashboard
  // card counts with, so the number and these rows always agree.
  const { consultations, loading, error, reload } = useRangedConsultations(range, {
    pendingFollowUps: true,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Consultation | null>(null);

  const rows = pendingFollowUps(consultations);

  /**
   * Persist a change to a consultation.
   *
   * Uses the existing save endpoint — a follow-up is part of the consultation's
   * report, not a separate record, so there is no second copy of this data to
   * drift out of sync. Local state updates first so the row reacts instantly,
   * then the write goes out; a failure reloads to undo the optimistic change.
   */
  const persist = async (updated: Consultation, failure: string) => {
    setBusyId(updated.id);
    updateSession(updated);
    try {
      await saveConsultation(updated);
    } catch (err) {
      Alert.alert(failure, err instanceof Error ? err.message : 'Please try again.');
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const markCompleted = (c: Consultation) =>
    Alert.alert(t('lists.followups.markCompletedTitle'), t('lists.followups.markCompletedBody', { name: c.patientName || t('common.unknownPatient') }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('lists.followups.markCompleted'),
        onPress: () =>
          void persist(
            { ...c, followUpCompletedAt: new Date().toISOString() },
            t('lists.followups.updateFailed'),
          ),
      },
    ]);

  const schedule = (c: Consultation, days: number) => {
    setScheduling(null);
    // normalizeReport fills in every section, so a consultation whose report
    // predates the follow-up fields still gets a well-formed object rather than
    // an undefined write.
    const report = normalizeReport(c.report);
    void persist(
      {
        ...c,
        report: { ...report, followUp: { ...report.followUp, date: addDays(days) } },
        // Rescheduling reopens a follow-up that had been closed.
        followUpCompletedAt: undefined,
      },
      t('lists.followups.scheduleFailed'),
    );
  };

  return (
    <>
      <ListScreen
        title={t('lists.followups.title')}
        subtitle={t('lists.followups.subtitle')}
        count={rows.length}
        loading={loading}
        error={error}
        onRefresh={reload}
        isEmpty={rows.length === 0}
        emptyIcon="notifications-outline"
        emptyTitle={t('lists.followups.emptyTitle')}
        emptySubtitle="Try a wider date range."
      >
        {rows.map((c) => {
          const overdue = isOverdue(c);
          return (
            <ListRow
              key={c.id}
              onPress={() => router.push(`/consultation/${c.id}`)}
              actions={
                <>
                  <RowAction
                    icon="person-outline"
                    label={t('lists.followups.patient')}
                    onPress={() =>
                      c.patientId
                        ? router.push(`/patient/${c.patientId}`)
                        : Alert.alert(
                            t('lists.followups.noPatientTitle'),
                            t('lists.followups.noPatientBody'),
                          )
                    }
                  />
                  <RowAction
                    icon="calendar-outline"
                    label={t('lists.followups.schedule')}
                    tone="slate"
                    busy={busyId === c.id}
                    onPress={() => setScheduling(c)}
                  />
                  <RowAction
                    icon="checkmark-done-outline"
                    label={t('lists.followups.markDone')}
                    tone="success"
                    busy={busyId === c.id}
                    onPress={() => markCompleted(c)}
                  />
                </>
              }
            >
              <Avatar name={c.patientName} />
              <View className="flex-1 ml-3">
                <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                  {c.patientName || t('common.unknownPatient')}
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={2}>
                  {followUpReason(c)}
                </Text>
                <View className="flex-row items-center gap-1.5 mt-1.5">
                  <Ionicons name="time-outline" size={12} color={colors.slate400} />
                  <Text className="text-xs text-slate-400">
                    {t('lists.followups.lastVisit', { date: formatDate(c.date || c.createdAt) })}
                  </Text>
                </View>
              </View>
              <View className="items-end gap-1.5">
                <View className={`px-2.5 py-1 rounded-full ${overdue ? 'bg-error-50' : 'bg-accent-50'}`}>
                  <Text
                    className="text-[11px] font-bold"
                    style={{ color: overdue ? colors.errorDark : colors.accent }}
                  >
                    {overdue ? t('lists.followups.overdue') : t('lists.followups.pending')}
                  </Text>
                </View>
                <Text className="text-[11px] text-slate-400 text-right" numberOfLines={2}>
                  {followUpDueLabel(c)}
                </Text>
              </View>
            </ListRow>
          );
        })}
      </ListScreen>

      <Modal
        visible={!!scheduling}
        transparent
        animationType="fade"
        onRequestClose={() => setScheduling(null)}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <Card className="p-5 rounded-b-none" elevation="lg">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[17px] font-bold text-slate-900">{t('lists.followups.scheduleTitle')}</Text>
              <TouchableOpacity onPress={() => setScheduling(null)} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.slate400} />
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-slate-400 mb-4">
              {t('lists.followups.scheduleCurrent', { name: scheduling?.patientName || t('lists.followups.patient'), when: relativeDay(scheduling?.report?.followUp?.date) })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {INTERVALS.map((i) => (
                <TouchableOpacity
                  key={i.labelKey}
                  onPress={() => scheduling && schedule(scheduling, i.days)}
                  activeOpacity={0.8}
                  className="bg-brand-50 rounded-xl px-4 py-3"
                >
                  <Text className="text-[13px] font-semibold text-brand-600">{t(i.labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}
