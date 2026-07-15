import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ReportData, ReportVersion, ComplaintRow, AllergyRow, MedicationRow, SystemGroup, Vitals, FollowUp } from '../../src/types';
import { useAppData } from '../../src/context/AppData';
import { loadSettings, Settings } from '../../src/services/storage';
import { saveConsultation } from '../../src/services/api';
import { normalizeReport } from '../../src/utils/report';
import {
  REPORT_SECTIONS,
  ReportSectionDef,
  ReportMeta,
  sectionHasContent,
  VITALS_FIELDS,
  FOLLOWUP_FIELDS,
} from '../../src/utils/report';
import { deriveSOAP, summarizeConsultation } from '../../src/utils/reportInsights';
import { findPreviousVisit } from '../../src/utils/compareVisits';
import { appendReportVersion, versionTimeLabel } from '../../src/utils/reportVersions';
import { exportReportPdf, printReport, exportReportJson, copyReportToClipboard } from '../../src/utils/export';
import CompareVisit from '../../src/components/CompareVisit';
import { Card, IconButton } from '../../src/components/ui';
import { colors, gradients, gradientProps, shadow } from '../../src/theme';

const s = (v: any) => (typeof v === 'string' ? v : '');

// ── Read-only renderers for each report section kind ──────────
function SectionBody({ section, report }: { section: ReportSectionDef; report: ReportData }) {
  const v = report[section.key];
  switch (section.kind) {
    case 'overview':
      return <Text className="text-[13.5px] leading-6 text-slate-700">{s(v).trim()}</Text>;
    case 'bullets':
      return <Bullets items={v as string[]} />;
    case 'complaints':
      return (
        <View className="gap-1.5">
          {(v as ComplaintRow[]).map((c, i) => (
            <View key={i} className="flex-row">
              <Text className="text-brand-500 mr-2">•</Text>
              <Text className="flex-1 text-[13.5px] text-slate-700">
                <Text className="font-semibold text-slate-800">{c.complaint}</Text>
                {[c.duration, c.severity].filter(Boolean).length ? `  (${[c.duration, c.severity].filter(Boolean).join(', ')})` : ''}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'allergies':
      return (
        <View className="gap-1.5">
          {(v as AllergyRow[]).map((a, i) => (
            <View key={i} className="flex-row">
              <Text className="text-error-500 mr-2">•</Text>
              <Text className="flex-1 text-[13.5px] text-slate-700">
                <Text className="font-semibold text-slate-800">{a.allergy}</Text>
                {[a.reaction, a.severity].filter(Boolean).length ? ` — ${[a.reaction, a.severity].filter(Boolean).join(', ')}` : ''}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'medications':
      return (
        <View className="gap-2">
          {(v as MedicationRow[]).map((m, i) => {
            const sub = [m.dose || m.dosage, m.route, m.frequency, m.timing, m.duration].filter(Boolean).join(' · ');
            return (
              <View key={i} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                <Text className="text-[13.5px] font-bold text-slate-800">
                  {m.medicine}{m.strength ? ` ${m.strength}` : ''}
                </Text>
                {sub ? <Text className="text-xs text-slate-500 mt-0.5">{sub}</Text> : null}
                {m.instructions ? <Text className="text-xs text-slate-500 mt-0.5 italic">{m.instructions}</Text> : null}
                {m.purpose ? <Text className="text-xs text-brand-600 mt-0.5">Purpose: {m.purpose}</Text> : null}
              </View>
            );
          })}
        </View>
      );
    case 'vitals': {
      const vit = v as Vitals;
      const pairs = VITALS_FIELDS.filter((f) => s(vit[f.key]).trim());
      return (
        <View className="flex-row flex-wrap gap-2">
          {pairs.map((f) => (
            <View key={f.key} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
              <Text className="text-[10px] font-medium text-slate-400">{f.label}</Text>
              <Text className="text-[13px] font-bold text-slate-800">{vit[f.key]}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'groups':
      return (
        <View className="gap-2">
          {(v as SystemGroup[]).filter((g) => g.findings.length || g.name.trim()).map((g, i) => (
            <View key={i}>
              {g.name ? <Text className="text-[12px] font-bold text-slate-600 mb-0.5">{g.name}</Text> : null}
              <Bullets items={g.findings} />
            </View>
          ))}
        </View>
      );
    case 'followup': {
      const fu = v as FollowUp;
      const pairs = FOLLOWUP_FIELDS.filter((f) => s(fu[f.key]).trim());
      return (
        <View className="gap-1">
          {pairs.map((f) => (
            <View key={f.key} className="flex-row">
              <Text className="text-xs font-semibold text-slate-500 w-32">{f.label}</Text>
              <Text className="flex-1 text-[13px] text-slate-700">{fu[f.key]}</Text>
            </View>
          ))}
        </View>
      );
    }
    default:
      return null;
  }
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View className="gap-1">
      {(items || []).filter(Boolean).map((it, i) => (
        <View key={i} className="flex-row">
          <Text className="text-brand-500 mr-2">•</Text>
          <Text className="flex-1 text-[13.5px] leading-5 text-slate-700">{it}</Text>
        </View>
      ))}
    </View>
  );
}

// A small labeled action button used in the action bar.
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

export default function ReportViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { consultations, patients, updateSession } = useAppData();

  const consultation = consultations.find((c) => c.id === id);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  useEffect(() => { loadSettings().then(setSettings); }, []);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  if (!consultation) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center px-8" edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="document-outline" size={40} color={colors.slate300} />
        <Text className="text-slate-500 mt-3">Report not found.</Text>
      </SafeAreaView>
    );
  }

  const report = consultation.report;
  const patient = patients.find((p) => p.id === consultation.patientId);
  const patientMeta = patient ? [patient.age ? `${patient.age} yrs` : '', patient.gender].filter(Boolean).join(' • ') : '';

  const prevCon = findPreviousVisit(consultation, consultations);
  const prevSummary = prevCon ? summarizeConsultation(prevCon) : null;
  const prevReport = prevCon?.report ? normalizeReport(prevCon.report) : null;
  const soap = report ? deriveSOAP(report) : null;

  const buildMeta = (): ReportMeta => ({
    patientName: consultation.patientName,
    patientMeta,
    date: consultation.date,
    dateTime: consultation.date,
    doctorName: settings?.doctorName || undefined,
    doctorQualification: settings?.qualification || undefined,
    doctorRegNo: settings?.registrationNumber || undefined,
    clinicName: settings?.clinicName || undefined,
    consultationId: consultation.id,
    signatureUri: settings?.signatureUri || undefined,
    soap: soap || undefined,
    previousSummary: prevSummary
      ? {
          date: prevSummary.date,
          diagnosis: prevSummary.diagnosis,
          medicines: prevSummary.medicines,
          symptoms: prevSummary.symptoms,
          investigations: prevSummary.investigations,
          followUp: prevSummary.followUp,
        }
      : undefined,
  });

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    if (!report) return;
    setBusy(key);
    try { await fn(); if (done) flash(done); }
    catch { Alert.alert('Action failed', 'Something went wrong. Please try again.'); }
    finally { setBusy(null); }
  };

  const doEdit = () => router.push(`/consultation/${consultation.id}`);
  const doPdf = () => run('pdf', () => exportReportPdf(report!, buildMeta()));
  const doPrint = () => run('print', () => printReport(report!, buildMeta()));
  const doJson = () => run('json', () => exportReportJson(report!, buildMeta()));
  const doCopy = () => run('copy', () => copyReportToClipboard(report!, buildMeta()), 'Report copied');
  const doShare = () => run('share', () => exportReportPdf(report!, buildMeta()));

  // Versions (synthesize a single "current" entry for older reports).
  const versions: ReportVersion[] = consultation.reportVersions?.length
    ? consultation.reportVersions
    : report
      ? [{ version: 1, report, savedAt: consultation.updatedAt || consultation.createdAt || new Date().toISOString(), label: 'Current report' }]
      : [];

  const restore = (v: ReportVersion) => {
    const restored = normalizeReport(v.report);
    const next = appendReportVersion(consultation.reportVersions, restored, `Restored v${v.version}`);
    const now = new Date().toISOString();
    const doc = { ...consultation, report: restored, reportVersions: next, updatedAt: now };
    updateSession(doc as any);
    saveConsultation(doc as any).catch(() => {});
    setVersionsOpen(false);
    flash(`Restored version ${v.version}`);
  };

  const filledSections = report ? REPORT_SECTIONS.filter((sec) => sectionHasContent(report, sec)) : [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Gradient header */}
      <View className="overflow-hidden">
        <LinearGradient colors={gradients.brand as any} {...gradientProps.horizontal} className="absolute inset-0" />
        <View className="flex-row items-center gap-3 px-4 pt-3 pb-3">
          <IconButton icon="arrow-back" onPress={() => router.back()} bg="bg-white/20" color={colors.white} />
          <View className="flex-1">
            <Text className="text-base font-bold text-white" numberOfLines={1}>Report Viewer</Text>
            <Text className="text-xs text-white/70" numberOfLines={1}>{consultation.patientName} · {consultation.date}</Text>
          </View>
          <IconButton icon="git-branch-outline" onPress={() => setVersionsOpen(true)} bg="bg-white/20" color={colors.white} />
        </View>
      </View>

      {!report ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-brand-50 items-center justify-center mb-4">
            <Ionicons name="clipboard-outline" size={34} color={colors.brand} />
          </View>
          <Text className="text-base font-bold text-slate-800">No report yet</Text>
          <Text className="text-sm text-slate-400 mt-1.5 text-center">Generate the clinical report from the consultation first.</Text>
          <TouchableOpacity onPress={doEdit} className="mt-5"><Text className="text-brand-600 font-semibold">Go to consultation →</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Action bar */}
          <View className="border-b border-slate-100 bg-white">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
              <ActionBtn icon="create-outline" label="Edit" onPress={doEdit} tint={colors.brand} />
              <ActionBtn icon="download-outline" label="PDF" onPress={doPdf} busy={busy === 'pdf'} tint={colors.error} />
              <ActionBtn icon="print-outline" label="Print" onPress={doPrint} busy={busy === 'print'} />
              <ActionBtn icon="share-social-outline" label="Share" onPress={doShare} busy={busy === 'share'} tint={colors.accent} />
              <ActionBtn icon="copy-outline" label="Copy" onPress={doCopy} busy={busy === 'copy'} />
              <ActionBtn icon="code-slash-outline" label="JSON" onPress={doJson} busy={busy === 'json'} tint={colors.successDark} />
              <ActionBtn icon="git-branch-outline" label="Versions" onPress={() => setVersionsOpen(true)} />
            </ScrollView>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }} showsVerticalScrollIndicator={false}>
            {/* Letterhead */}
            <Card className="p-4" elevation="sm">
              <View className="flex-row items-center gap-3">
                <LinearGradient colors={gradients.brand as any} {...gradientProps.diagonal} className="w-11 h-11 rounded-2xl items-center justify-center">
                  <Ionicons name="pulse" size={22} color={colors.white} />
                </LinearGradient>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-slate-900">{settings?.clinicName?.trim() || 'NovaScribe AI Clinic'}</Text>
                  <Text className="text-xs text-brand-600 font-semibold">{settings?.doctorName?.trim() || 'Attending Physician'}</Text>
                  {settings?.qualification?.trim() ? <Text className="text-[11px] text-slate-400">{settings.qualification}{settings.registrationNumber ? ` · Reg. ${settings.registrationNumber}` : ''}</Text> : null}
                </View>
              </View>
              <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-100">
                <MetaItem label="Patient" value={`${consultation.patientName}${patientMeta ? `  (${patientMeta})` : ''}`} />
                <MetaItem label="Date" value={consultation.date} />
                <MetaItem label="Consultation ID" value={consultation.id} />
              </View>
            </Card>

            {/* Previous Consultation Summary */}
            {prevSummary ? (
              <View className="rounded-3xl overflow-hidden border border-warning-100" style={shadow.sm}>
                <View className="bg-warning-50 px-4 py-3 flex-row items-center gap-2">
                  <Ionicons name="time-outline" size={16} color={colors.warningDark} />
                  <Text className="font-bold text-[14px] text-warning-700 flex-1">Previous Consultation Summary</Text>
                  {prevSummary.date ? <Text className="text-[11px] font-semibold text-warning-700">{prevSummary.date}</Text> : null}
                </View>
                <View className="bg-white p-4 gap-2.5">
                  <PrevRow icon="pulse-outline" label="Symptoms" items={prevSummary.symptoms} />
                  <PrevRow icon="medical-outline" label="Diagnosis" items={prevSummary.diagnosis} />
                  <PrevRow icon="medkit-outline" label="Medicines" items={prevSummary.medicines} />
                  <PrevRow icon="flask-outline" label="Investigations" items={prevSummary.investigations} />
                  <PrevRow icon="calendar-outline" label="Follow-up" items={prevSummary.followUp} last />
                </View>
              </View>
            ) : null}

            {/* Compare Previous Visit (full diff — mirrors the web app) */}
            {prevReport ? <CompareVisit current={report} previous={prevReport} previousDate={prevCon?.date} /> : null}

            {/* SOAP */}
            {soap && (soap.subjective || soap.objective || soap.assessment || soap.plan) ? (
              <Card className="p-4" elevation="sm">
                <View className="flex-row items-center gap-2 mb-3">
                  <View className="w-7 h-7 rounded-lg bg-accent-50 items-center justify-center">
                    <Ionicons name="reader-outline" size={15} color={colors.accent} />
                  </View>
                  <Text className="font-bold text-[15px] text-slate-900">SOAP Summary</Text>
                </View>
                <View className="gap-3">
                  <SoapBlock letter="S" label="Subjective" text={soap.subjective} />
                  <SoapBlock letter="O" label="Objective" text={soap.objective} />
                  <SoapBlock letter="A" label="Assessment" text={soap.assessment} />
                  <SoapBlock letter="P" label="Plan" text={soap.plan} />
                </View>
              </Card>
            ) : null}

            {/* Full clinical report */}
            {filledSections.map((sec, i) => (
              <Card key={sec.key} className="p-4" elevation="sm">
                <View className="flex-row items-center gap-2 mb-2.5">
                  <View className="w-6 h-6 rounded-lg bg-brand-50 items-center justify-center">
                    <Text className="text-[11px] font-bold text-brand-600">{i + 1}</Text>
                  </View>
                  <Text className="font-bold text-[14px] text-slate-900 flex-1">{sec.title}</Text>
                </View>
                <SectionBody section={sec} report={report} />
              </Card>
            ))}

            {filledSections.length === 0 ? (
              <Card className="p-6 items-center" elevation="sm">
                <Text className="text-sm text-slate-400">This report has no content yet.</Text>
              </Card>
            ) : null}

            {/* Signature */}
            <Card className="p-4 items-end" elevation="sm">
              {settings?.signatureUri ? (
                <View className="items-center">
                  <Text className="text-[11px] text-slate-400 mb-1">Signature on file</Text>
                </View>
              ) : null}
              <View className="items-center mt-2">
                <View className="w-44 border-t border-slate-300 pt-1.5 items-center">
                  <Text className="font-bold text-slate-800 text-[13px]">{settings?.doctorName?.trim() || 'Attending Physician'}</Text>
                  <Text className="text-[11px] text-slate-400">Doctor's Signature</Text>
                </View>
              </View>
            </Card>
          </ScrollView>
        </>
      )}

      {/* Toast */}
      {toast ? (
        <View className="absolute left-0 right-0 items-center" style={{ bottom: insets.bottom + 24 }} pointerEvents="none">
          <View className="flex-row items-center gap-2 bg-slate-900 px-4 py-2.5 rounded-full">
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text className="text-white font-semibold text-[13px]">{toast}</Text>
          </View>
        </View>
      ) : null}

      {/* Versions modal */}
      <Modal visible={versionsOpen} transparent animationType="slide" onRequestClose={() => setVersionsOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={() => setVersionsOpen(false)}>
          <View className="bg-white rounded-t-3xl p-5" style={{ paddingBottom: insets.bottom + 16, maxHeight: '75%' }}>
            <View className="items-center pb-2"><View className="w-10 h-1.5 rounded-full bg-slate-200" /></View>
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons name="git-branch-outline" size={18} color={colors.brand} />
              <Text className="text-lg font-bold text-slate-900">Report Versions</Text>
            </View>
            <Text className="text-xs text-slate-400 mb-3">Every saved edit creates a version. Restore any earlier draft.</Text>
            <ScrollView>
              {versions.slice().reverse().map((v, idx) => {
                const isCurrent = idx === 0;
                return (
                  <View key={v.version} className="flex-row items-center gap-3 py-3 border-b border-slate-50">
                    <View className={`w-9 h-9 rounded-full items-center justify-center ${isCurrent ? 'bg-brand-500' : 'bg-slate-100'}`}>
                      <Text className={`text-xs font-bold ${isCurrent ? 'text-white' : 'text-slate-500'}`}>v{v.version}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[13.5px] font-semibold text-slate-800">{v.label || `Version ${v.version}`}</Text>
                      <Text className="text-[11px] text-slate-400">{versionTimeLabel(v.savedAt)}{isCurrent ? ' · Current' : ''}</Text>
                    </View>
                    {!isCurrent ? (
                      <TouchableOpacity onPress={() => restore(v)} className="bg-brand-50 px-3 py-1.5 rounded-lg">
                        <Text className="text-xs font-semibold text-brand-600">Restore</Text>
                      </TouchableOpacity>
                    ) : (
                      <View className="bg-success-50 px-3 py-1.5 rounded-lg"><Text className="text-xs font-semibold text-success-700">Active</Text></View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="text-[12.5px] font-semibold text-slate-800">{value}</Text>
    </View>
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

function SoapBlock({ letter, label, text }: { letter: string; label: string; text: string }) {
  if (!text?.trim()) return null;
  return (
    <View className="flex-row gap-2.5">
      <View className="w-7 h-7 rounded-lg bg-accent-500 items-center justify-center">
        <Text className="text-white font-bold text-[13px]">{letter}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{label}</Text>
        <Text className="text-[13px] leading-5 text-slate-700">{text}</Text>
      </View>
    </View>
  );
}
