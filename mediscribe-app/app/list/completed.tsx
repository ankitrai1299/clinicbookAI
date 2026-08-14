// Completed Consultations — view, export or share a finished report.
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppData } from '../../src/context/AppData';
import { useTranslation } from 'react-i18next';
import { useDateFilter } from '../../src/context/DateFilter';
import { useRangedConsultations } from '../../src/hooks/useRangedConsultations';
import { Avatar } from '../../src/components/ui';
import { ListScreen, ListRow, RowAction } from '../../src/components/ListScreen';
import { loadSettings, Settings } from '../../src/services/storage';
import { exportReportPdf, reportToPlainText } from '../../src/utils/export';
import { trackEvent } from '../../src/services/api';
import {
  normalizeReport,
  formatConsultDate,
  formatConsultTime,
  type ReportMeta,
} from '../../src/utils/report';
import { buildComparisonMeta } from '../../src/utils/compareVisits';
import { languageLabel } from '../../src/constants';
import { Consultation } from '../../src/types';
import {
  completedConsultations,
  patientOf,
  formatDate,
  hasReport,
} from '../../src/utils/dashboard';
import { colors } from '../../src/theme';

export default function CompletedScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  // `patients` for the letterhead; the unfiltered consultation list so the
  // previous-visit comparison can reach outside the selected date range.
  const { patients, consultations: allConsultations } = useAppData();
  const { range } = useDateFilter();
  const { consultations, loading, error, reload } = useRangedConsultations(range);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The letterhead (doctor name, qualification, registration, clinic, signature)
  // comes from settings, exactly as the report screen builds it — so a PDF
  // exported from here is byte-for-byte the one exported from the report.
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const rows = completedConsultations(consultations);

  const buildMeta = (c: Consultation): ReportMeta => {
    const patient = patientOf(patients, c);
    return {
      patientName: c.patientName,
      date: c.date,
      dateTime: c.date,
      patientAge: patient?.age || undefined,
      patientGender: patient?.gender || undefined,
      patientPhone: patient?.phone || undefined,
      patientId: c.patientId || undefined,
      consultationDate: formatConsultDate(c),
      consultationTime: formatConsultTime(c),
      transcriptionLanguage:
        c.language && c.language !== 'auto' ? languageLabel(c.language) : undefined,
      doctorName: settings?.doctorName || undefined,
      doctorQualification: settings?.qualification || undefined,
      doctorRegNo: settings?.registrationNumber || undefined,
      clinicName: settings?.clinicName || undefined,
      consultationId: c.id,
      signatureUri: settings?.signatureUri || undefined,
      // "Since Last Visit" panel. Compared against `allConsultations`, not the
      // date-filtered rows on screen: the previous visit is usually outside the
      // selected range, and a filter over the list must not change the document.
      comparison: c.report
        ? buildComparisonMeta(c, allConsultations, normalizeReport(c.report))
        : undefined,
    };
  };

  const withBusy = async (id: string, run: () => Promise<void>, failure: string) => {
    setBusyId(id);
    try {
      await run();
    } catch (err) {
      Alert.alert(failure, err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = (c: Consultation) =>
    withBusy(
      c.id,
      async () => {
        await exportReportPdf(normalizeReport(c.report!), buildMeta(c));
        // Recorded only on success, so "how many reports did I download"
        // counts documents actually produced, not attempts.
        trackEvent('report_downloaded', { consultationId: c.id });
      },
      t('lists.completed.pdfFailed'),
    );

  // Shares the report as text rather than a file — the quickest way to send a
  // summary to a patient or colleague over a messaging app. The PDF action
  // above is the one to use for a document.
  const shareReport = (c: Consultation) =>
    withBusy(
      c.id,
      async () => {
        const text = reportToPlainText(normalizeReport(c.report!), {
          patientName: c.patientName,
          date: c.date,
          doctorName: settings?.doctorName || undefined,
        });
        const result = await Share.share({ message: text, title: `Report - ${c.patientName}` });
        // iOS reports dismissal; only a completed share is counted.
        if (result.action !== Share.dismissedAction) {
          trackEvent('report_shared', { consultationId: c.id });
        }
      },
      t('lists.completed.shareFailed'),
    );

  return (
    <ListScreen
      title={t('lists.completed.title')}
      subtitle={t('lists.completed.subtitle')}
      count={rows.length}
      loading={loading}
      error={error}
      onRefresh={reload}
      isEmpty={rows.length === 0}
      emptyIcon="checkmark-done-outline"
      emptyTitle={t('lists.completed.emptyTitle')}
      emptySubtitle="Try a wider date range."
    >
      {rows.map((c) => {
        const ready = hasReport(c);
        return (
          <ListRow
            key={c.id}
            onPress={() => router.push(`/report/${c.id}`)}
            actions={
              <>
                <RowAction
                  icon="document-text-outline"
                  label={t('common.view')}
                  onPress={() => router.push(`/report/${c.id}`)}
                />
                {/* Export and share need report content to work on. A session
                    marked Completed without one still opens, so the doctor can
                    see why, but exporting a blank document is never useful. */}
                <RowAction
                  icon="download-outline"
                  label={t('report.exportPdf')}
                  tone="success"
                  busy={busyId === c.id}
                  onPress={() =>
                    ready
                      ? downloadPdf(c)
                      : Alert.alert(t('lists.completed.noReportYetTitle'), t('lists.completed.noReportExport'))
                  }
                />
                <RowAction
                  icon="share-outline"
                  label={t('common.share')}
                  tone="slate"
                  busy={busyId === c.id}
                  onPress={() =>
                    ready
                      ? shareReport(c)
                      : Alert.alert(t('lists.completed.noReportYetTitle'), t('lists.completed.noReportShare'))
                  }
                />
              </>
            }
          >
            <Avatar name={c.patientName} />
            <View className="flex-1 ml-3">
              <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                {c.patientName || t('common.unknownPatient')}
              </Text>
              <View className="flex-row items-center gap-1.5 mt-1">
                <Ionicons name="checkmark-circle-outline" size={12} color={colors.slate400} />
                <Text className="text-xs text-slate-400">
                  {t('lists.completed.completedOn', { date: formatDate(c.updatedAt || c.date) })}
                </Text>
              </View>
            </View>
            <View
              className={`px-2.5 py-1 rounded-full ${ready ? 'bg-success-50' : 'bg-slate-100'}`}
            >
              <Text
                className="text-[11px] font-bold"
                style={{ color: ready ? colors.successDark : colors.slate400 }}
              >
                {ready ? t('lists.completed.reportReady') : t('lists.completed.noReport')}
              </Text>
            </View>
          </ListRow>
        );
      })}
    </ListScreen>
  );
}
