import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState } from '../../../src/components/ui';
import { AdminScreen } from '../../../src/components/admin/shared';
import { ReportView } from '../../../src/components/admin/ReportView';
import { useAuth } from '../../../src/context/Auth';
import { getAdminReports, getPatientHistory, ConsultationHistoryItem } from '../../../src/services/api';
import { ReportRecord } from '../../../src/types';
import { ReportMeta } from '../../../src/utils/report';
import { exportReportPdf, printReport, exportReportDocx } from '../../../src/utils/export';
import { colors, shadow } from '../../../src/theme';

export default function AdminReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();

  const [record, setRecord] = useState<ReportRecord | null>(null);
  const [prev, setPrev] = useState<ConsultationHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await getAdminReports('', token);
      const found = list.find((r) => r.id === id) || null;
      setRecord(found);
      // Find this patient's previous consultation (immediately older) for the
      // summary. History is a flat, newest-first array of consultation items.
      if (found) {
        const hist = (await getPatientHistory(found.patientId, token).catch(() => [])) || [];
        // A report's id equals its consultation id (backend convention), so
        // exclude the current consultation by that id.
        const others = hist
          .filter((h) => h.consultationId !== found.id)
          .sort((a, b) => Date.parse(b.visitDateTime || '') - Date.parse(a.visitDateTime || ''));
        const older = others.find((h) => Date.parse(h.visitDateTime || '') <= Date.parse(found.date || ''));
        setPrev(older || others[0] || null);
      }
    } catch {
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const meta: ReportMeta = record
    ? { patientName: record.patientName, date: record.date, consultationId: record.id }
    : {};

  const run = async (key: string, fn: () => Promise<void>) => {
    if (!record) return;
    setBusy(key);
    try {
      await fn();
    } catch {
      Alert.alert('Action failed', 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const prevSummary = prev
    ? {
        complaints: (prev.chiefComplaints || []).filter(Boolean),
        diagnosis: (prev.diagnosis || []).filter(Boolean),
        medicines: (prev.medicines || []).map((m) => m.medicine).filter(Boolean),
      }
    : null;

  return (
    <AdminScreen title="Report" subtitle={record ? `${record.patientName} · ${record.date}` : undefined} permission="reports.view">
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.brand} /></View>
      ) : !record ? (
        <EmptyState icon="document-outline" title="Report not found" />
      ) : (
        <>
          {/* Export action bar */}
          <View className="border-b border-slate-100 bg-white">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
              <ActionBtn icon="download-outline" label="PDF" tint={colors.error} busy={busy === 'pdf'} onPress={() => run('pdf', () => exportReportPdf(record.report, meta))} />
              <ActionBtn icon="print-outline" label="Print" busy={busy === 'print'} onPress={() => run('print', () => printReport(record.report, meta))} />
              <ActionBtn icon="share-social-outline" label="Share" tint={colors.accent} busy={busy === 'share'} onPress={() => run('share', () => exportReportPdf(record.report, meta))} />
              <ActionBtn icon="document-outline" label="DOCX" tint={colors.brand} busy={busy === 'docx'} onPress={() => run('docx', () => exportReportDocx(record.report, meta))} />
            </ScrollView>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }} showsVerticalScrollIndicator={false}>
            {/* Letterhead */}
            <Card className="p-4" elevation="sm">
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-2xl bg-brand-500 items-center justify-center">
                  <Ionicons name="pulse" size={22} color={colors.white} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-slate-900">{record.patientName}</Text>
                  <Text className="text-xs text-slate-400">Report · {record.date}</Text>
                </View>
              </View>
            </Card>

            {/* Previous consultation summary */}
            {prevSummary && (prevSummary.complaints.length || prevSummary.diagnosis.length || prevSummary.medicines.length) ? (
              <View className="rounded-3xl overflow-hidden border border-warning-100" style={shadow.sm}>
                <View className="bg-warning-50 px-4 py-3 flex-row items-center gap-2">
                  <Ionicons name="time-outline" size={16} color={colors.warningDark} />
                  <Text className="font-bold text-[14px] text-warning-700 flex-1">Previous Consultation Summary</Text>
                  {prev?.visitDateTime ? <Text className="text-[11px] font-semibold text-warning-700">{prev.visitDateTime}</Text> : null}
                </View>
                <View className="bg-white p-4 gap-2.5">
                  <PrevRow icon="pulse-outline" label="Complaints" items={prevSummary.complaints} />
                  <PrevRow icon="medical-outline" label="Diagnosis" items={prevSummary.diagnosis} />
                  <PrevRow icon="medkit-outline" label="Medicines" items={prevSummary.medicines} last />
                </View>
              </View>
            ) : null}

            {/* Full report */}
            <ReportView report={record.report} />
          </ScrollView>
        </>
      )}
    </AdminScreen>
  );
}

function ActionBtn({ icon, label, onPress, tint = colors.slate700, busy }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tint?: string; busy?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} activeOpacity={0.7} className="items-center gap-1 px-1" style={{ width: 76 }}>
      <View className="w-12 h-12 rounded-2xl bg-white border border-slate-200 items-center justify-center" style={shadow.sm}>
        {busy ? <ActivityIndicator size="small" color={tint} /> : <Ionicons name={icon} size={20} color={tint} />}
      </View>
      <Text className="text-[11px] font-semibold text-slate-600" numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function PrevRow({ icon, label, items, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; items: string[]; last?: boolean }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <View className={`flex-row gap-2 ${last ? '' : 'pb-2.5 border-b border-slate-50'}`}>
      <Ionicons name={icon} size={15} color={colors.warningDark} style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</Text>
        <Text className="text-[13px] text-slate-700 mt-0.5">{list.join('; ')}</Text>
      </View>
    </View>
  );
}
