import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ReportData, ReportVersion, ComplaintRow, AllergyRow, MedicationRow, SystemGroup, Vitals, FollowUp } from '../../src/types';
import { useAppData } from '../../src/context/AppData';
import { loadSettings, Settings } from '../../src/services/storage';
import { saveConsultation } from '../../src/services/api';
import {
  normalizeReport,
  REPORT_SECTIONS,
  ReportSectionDef,
  ReportMeta,
  sectionHasContent,
  sectionHeading,
  vitalHeading,
  condenseReport,
  hasValue,
  nonEmptyRows,
  nonEmptyItems,
  formatConsultDate,
  formatConsultTime,
  VITALS_FIELDS,
  FOLLOWUP_FIELDS,
  L,
} from '../../src/utils/report';
import { languageLabel } from '../../src/constants';
import { deriveSOAP } from '../../src/utils/reportInsights';
import { buildComparisonMeta, findPreviousVisit } from '../../src/utils/compareVisits';
import { appendReportVersion, versionTimeLabel } from '../../src/utils/reportVersions';
import { exportReportPdf, printReport, exportReportJson, copyReportToClipboard } from '../../src/utils/export';
import CompareVisit from '../../src/components/CompareVisit';
import { Card, IconButton } from '../../src/components/ui';
import { colors, shadow } from '../../src/theme';

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
          {nonEmptyRows(v as ComplaintRow[]).map((c, i) => (
            <View key={i} className="flex-row">
              <Text className="text-brand-500 mr-2">•</Text>
              <Text className="flex-1 text-[13.5px] text-slate-700">
                <Text className="font-semibold text-slate-800">{c.complaint}</Text>
                {[c.duration, c.severity].filter(hasValue).length ? `  (${[c.duration, c.severity].filter(Boolean).join(', ')})` : ''}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'allergies':
      return (
        <View className="gap-1.5">
          {nonEmptyRows(v as AllergyRow[]).map((a, i) => (
            <View key={i} className="flex-row">
              <Text className="text-error-500 mr-2">•</Text>
              <Text className="flex-1 text-[13.5px] text-slate-700">
                <Text className="font-semibold text-slate-800">{a.allergy}</Text>
                {[a.reaction, a.severity].filter(hasValue).length ? ` - ${[a.reaction, a.severity].filter(Boolean).join(', ')}` : ''}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'medications':
      // One hairline-separated row per drug, mirroring the printed prescription
      // table (a real 4-column table does not fit a phone width).
      return (
        <View>
          {nonEmptyRows(v as MedicationRow[]).map((m, i) => {
            const sub = [m.dose || m.dosage, m.route, m.frequency, m.timing, m.duration].filter(hasValue).join(' · ');
            return (
              <View key={i} className={`py-2 ${i ? 'border-t border-slate-100' : ''}`}>
                <Text className="text-[13.5px] font-bold text-slate-900">
                  {m.medicine}{hasValue(m.strength) ? ` ${m.strength}` : ''}
                </Text>
                {sub ? <Text className="text-xs text-slate-500 mt-0.5">{sub}</Text> : null}
                {hasValue(m.instructions) ? <Text className="text-xs text-slate-500 mt-0.5 italic">{m.instructions}</Text> : null}
                {hasValue(m.purpose) ? <Text className="text-xs text-slate-500 mt-0.5">Purpose: {m.purpose}</Text> : null}
              </View>
            );
          })}
        </View>
      );
    case 'vitals': {
      const vit = v as Vitals;
      const pairs = VITALS_FIELDS.filter((f) => hasValue(vit[f.key]));
      return (
        <View className="flex-row flex-wrap gap-2">
          {pairs.map((f) => (
            <View key={f.key} className="border border-slate-200 rounded-xl px-3 py-2 min-w-[86px]">
              <Text className="text-[10px] text-slate-500">{vitalHeading(f)}</Text>
              <Text className="text-[13.5px] font-bold text-slate-900 mt-0.5">{vit[f.key]}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'groups':
      return (
        <View className="gap-2">
          {(v as SystemGroup[]).filter((g) => nonEmptyItems(g.findings).length).map((g, i) => (
            <View key={i}>
              {hasValue(g.name) ? <Text className="text-[12px] font-bold text-slate-600 mb-0.5">{g.name}</Text> : null}
              <Bullets items={g.findings} />
            </View>
          ))}
        </View>
      );
    case 'followup': {
      const fu = v as FollowUp;
      const pairs = FOLLOWUP_FIELDS.filter((f) => hasValue(fu[f.key]));
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
      {nonEmptyItems(items).map((it, i) => (
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
      <View className="w-12 h-12 rounded-2xl bg-surface border border-slate-200 items-center justify-center" style={shadow.sm}>
        {busy ? <ActivityIndicator size="small" color={tint} /> : <Ionicons name={icon} size={20} color={tint} />}
      </View>
      <Text className="text-[11px] font-semibold text-slate-600" numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ReportViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t: tt } = useTranslation();
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
        <Text className="text-slate-500 mt-3">{tt('report.notFound')}</Text>
      </SafeAreaView>
    );
  }

  const report = consultation.report;
  const patient = patients.find((p) => p.id === consultation.patientId);
  const patientMeta = patient ? [patient.age ? `${patient.age} yrs` : '', patient.gender].filter(Boolean).join(' • ') : '';

  const soap = report ? deriveSOAP(report) : null;

  // Same condensing the print/PDF path applies, so the preview shows exactly
  // the document that will be printed — not a longer version of it.
  const shown = report ? condenseReport(report) : null;

  // ── Previous visit ──
  // The immediately previous consultation for this patient that carries clinical
  // content. Everything below is derived from two already-stored reports, so
  // every past consultation gains the comparison with no new data. Not memoized:
  // the early return above sits before this point, so a hook here would be
  // conditional.
  const previousConsult = findPreviousVisit(consultation, consultations);
  const previousReport = previousConsult?.report ? normalizeReport(previousConsult.report) : null;
  const previousDate = previousConsult ? formatConsultDate(previousConsult) || previousConsult.date : undefined;

  const buildMeta = (): ReportMeta => ({
    patientName: consultation.patientName,
    patientMeta,
    date: consultation.date,
    dateTime: consultation.date,
    // Patient Information block. Absent fields are omitted from the document,
    // never printed as "N/A" — see patientInfoHtml() in utils/report.ts.
    patientAge: patient?.age || undefined,
    patientGender: patient?.gender || undefined,
    patientPhone: patient?.phone || undefined,
    patientId: consultation.patientId || undefined,
    consultationDate: formatConsultDate(consultation),
    consultationTime: formatConsultTime(consultation),
    // Persisted at capture time. Consultations recorded before that was stored,
    // or left on auto-detect, simply omit the row.
    transcriptionLanguage:
      consultation.language && consultation.language !== 'auto'
        ? languageLabel(consultation.language)
        : undefined,
    doctorName: settings?.doctorName || undefined,
    doctorQualification: settings?.qualification || undefined,
    doctorRegNo: settings?.registrationNumber || undefined,
    clinicName: settings?.clinicName || undefined,
    consultationId: consultation.id,
    signatureUri: settings?.signatureUri || undefined,
    soap: soap || undefined,
    // Printed as the "Since Last Visit" panel; omitted when there is no earlier
    // visit or nothing comparable between the two.
    comparison: shown ? buildComparisonMeta(consultation, consultations, shown) : undefined,
  });

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    if (!report) return;
    setBusy(key);
    try { await fn(); if (done) flash(done); }
    catch { Alert.alert(tt('report.actionFailedTitle'), tt('report.actionFailedBody')); }
    finally { setBusy(null); }
  };

  const doEdit = () => router.push(`/consultation/${consultation.id}`);
  const doPdf = () => run('pdf', () => exportReportPdf(report!, buildMeta()));
  const doPrint = () => run('print', () => printReport(report!, buildMeta()));
  const doJson = () => run('json', () => exportReportJson(report!, buildMeta()));
  const doCopy = () => run('copy', () => copyReportToClipboard(report!, buildMeta()), tt('report.reportCopied'));
  const doShare = () => run('share', () => exportReportPdf(report!, buildMeta()));

  // Versions (synthesize a single "current" entry for older reports).
  const versions: ReportVersion[] = consultation.reportVersions?.length
    ? consultation.reportVersions
    : report
      ? [{ version: 1, report, savedAt: consultation.updatedAt || consultation.createdAt || new Date().toISOString(), label: tt('report.currentReport') }]
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

  const filledSections = shown ? REPORT_SECTIONS.filter((sec) => sectionHasContent(shown, sec)) : [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — flat on the canvas, dark text, hairline divider. */}
      <View className="flex-row items-center gap-3 px-4 pt-3 pb-3 border-b border-slate-100">
        <IconButton icon="arrow-back" onPress={() => router.back()} bg="bg-white border border-slate-200" color={colors.slate700} accessibilityLabel={tt('common.back')} />
        <View className="flex-1">
          <Text className="text-[17px] font-bold text-slate-900 tracking-tight" numberOfLines={1}>{tt('report.viewerTitle')}</Text>
          <Text className="text-xs text-slate-400" numberOfLines={1}>{consultation.patientName} · {consultation.date}</Text>
        </View>
        <IconButton icon="git-branch-outline" onPress={() => setVersionsOpen(true)} bg="bg-white border border-slate-200" color={colors.slate700} accessibilityLabel={tt('report.toolbarVersions')} />
      </View>

      {!report ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-brand-50 items-center justify-center mb-4">
            <Ionicons name="clipboard-outline" size={34} color={colors.brand} />
          </View>
          <Text className="text-base font-bold text-slate-800">{tt('report.noReportTitle')}</Text>
          <Text className="text-sm text-slate-400 mt-1.5 text-center">{tt('report.noReportBody')}</Text>
          <TouchableOpacity onPress={doEdit} className="mt-5"><Text className="text-brand-600 font-semibold">{tt('report.goToConsultation')} →</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Action bar */}
          <View className="border-b border-slate-100 bg-surface">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
              <ActionBtn icon="create-outline" label={tt("report.toolbarEdit")} onPress={doEdit} tint={colors.brand} />
              <ActionBtn icon="download-outline" label="PDF" onPress={doPdf} busy={busy === 'pdf'} tint={colors.error} />
              <ActionBtn icon="print-outline" label={tt("report.toolbarPrint")} onPress={doPrint} busy={busy === 'print'} />
              <ActionBtn icon="share-social-outline" label={tt("report.toolbarShare")} onPress={doShare} busy={busy === 'share'} tint={colors.accent} />
              <ActionBtn icon="copy-outline" label={tt("report.toolbarCopy")} onPress={doCopy} busy={busy === 'copy'} />
              <ActionBtn icon="code-slash-outline" label={tt("report.toolbarJson")} onPress={doJson} busy={busy === 'json'} tint={colors.successDark} />
              <ActionBtn icon="git-branch-outline" label={tt("report.toolbarVersions")} onPress={() => setVersionsOpen(true)} />
            </ScrollView>
          </View>

          {/* The preview renders the SAME document the PDF prints: letterhead,
              patient strip, "Since Last Visit", then titled sections on one
              continuous sheet — no numbering, no card per section. */}
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }} showsVerticalScrollIndicator={false}>
            {/* overflow-hidden: the patient strip is full-bleed (-mx-4), so its
                tinted band has to be clipped by the card's rounded corners. */}
            <Card className="px-4 pt-4 pb-5 overflow-hidden" elevation="sm">
              {/* Letterhead */}
              <View className="flex-row items-start gap-3">
                <View className="flex-1">
                  <Text className="text-[19px] font-bold text-slate-900 tracking-tight">{settings?.clinicName?.trim() || 'NovaScribe Clinic'}</Text>
                  <Text className="text-[11.5px] mt-1" style={{ color: colors.docAccent }}>
                    {[
                      settings?.doctorName?.trim() || L('Attending Physician'),
                      settings?.qualification?.trim(),
                      settings?.registrationNumber?.trim() ? `Reg. ${settings.registrationNumber.trim()}` : '',
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[11.5px] text-slate-500">{formatConsultDate(consultation) || consultation.date}</Text>
                  {formatConsultTime(consultation) ? (
                    <Text className="text-[11.5px] text-slate-500 mt-0.5">OPD · {formatConsultTime(consultation)}</Text>
                  ) : null}
                </View>
              </View>

              {/* Patient strip */}
              <View className="-mx-4 mt-3 px-4 py-2.5 bg-slate-50 border-y border-slate-200">
                <View className="flex-row flex-wrap gap-x-5 gap-y-1">
                  <StripItem label={L('Patient')} value={consultation.patientName} />
                  {patient?.age || patient?.gender ? (
                    <StripItem
                      label={patient?.age && patient?.gender ? L('Age / Sex') : patient?.age ? L('Age') : L('Sex')}
                      value={[patient?.age ? String(patient.age) : '', patient?.gender || ''].filter(Boolean).join(' / ')}
                    />
                  ) : null}
                  {patient?.phone ? <StripItem label={L('Phone')} value={patient.phone} /> : null}
                </View>
              </View>

              {/* What changed since the previous visit — same content, same
                  place in the sheet as the document's "Since Last Visit" panel.
                  Absent on a first visit, exactly as the PDF omits it. */}
              {previousReport ? (
                <View className="mt-4">
                  <CompareVisit current={shown!} previous={previousReport} previousDate={previousDate} flat />
                </View>
              ) : null}

              {/* Sections — `shown`, not `report`: the condensed object is what
                  the print/PDF path renders, so the preview must use it too. */}
              <View className="mt-4 gap-4">
                {filledSections.map((sec) => (
                  <View key={sec.key}>
                    <Text
                      className="text-[10px] font-bold uppercase mb-1.5"
                      style={{ color: sec.key === 'prescribedMedications' ? colors.docRx : colors.docAccent, letterSpacing: 0.9 }}
                    >
                      {sectionHeading(sec)}
                    </Text>
                    <SectionBody section={sec} report={shown!} />
                  </View>
                ))}

                {filledSections.length === 0 ? (
                  <Text className="text-sm text-slate-400 text-center py-4">This report has no content yet.</Text>
                ) : null}
              </View>

              {/* Signature */}
              <View className="items-end mt-7">
                {settings?.signatureUri ? (
                  <Text className="text-[11px] text-slate-400 mb-1">{tt('report.signatureOnFile')}</Text>
                ) : null}
                <View className="w-44 border-t border-slate-200 pt-1.5 items-center">
                  <Text className="font-bold text-slate-900 text-[13px]">{settings?.doctorName?.trim() || L('Attending Physician')}</Text>
                  <Text className="text-[11px] text-slate-400">{L("Doctor's Signature")}</Text>
                </View>
              </View>
            </Card>

            {/* SOAP */}
            {soap && (soap.subjective || soap.objective || soap.assessment || soap.plan) ? (
              <Card className="p-4" elevation="sm">
                <Text className="text-[10px] font-bold uppercase mb-3" style={{ color: colors.docAccent, letterSpacing: 0.9 }}>
                  {L('SOAP Summary')}
                </Text>
                <View className="gap-3">
                  <SoapBlock letter="S" label={L('Subjective')} text={soap.subjective} />
                  <SoapBlock letter="O" label={L('Objective')} text={soap.objective} />
                  <SoapBlock letter="A" label={L('Assessment')} text={soap.assessment} />
                  <SoapBlock letter="P" label={L('Plan')} text={soap.plan} />
                </View>
              </Card>
            ) : null}
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
          <View className="bg-surface rounded-t-3xl p-5" style={{ paddingBottom: insets.bottom + 16, maxHeight: '75%' }}>
            <View className="items-center pb-2"><View className="w-10 h-1.5 rounded-full bg-slate-200" /></View>
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons name="git-branch-outline" size={18} color={colors.brand} />
              <Text className="text-lg font-bold text-slate-900">{tt('report.versionsTitle')}</Text>
            </View>
            <Text className="text-xs text-slate-400 mb-3">{tt('report.versionsBody')}</Text>
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
                        <Text className="text-xs font-semibold text-brand-600">{tt('report.restore')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View className="bg-success-50 px-3 py-1.5 rounded-lg"><Text className="text-xs font-semibold text-success-700">{tt('report.active')}</Text></View>
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

/** One "Label: value" pair on the patient strip. */
function StripItem({ label, value }: { label: string; value: string }) {
  return (
    <Text className="text-[12px] text-slate-500">
      {label}: <Text className="font-bold text-slate-900">{value}</Text>
    </Text>
  );
}

function SoapBlock({ letter, label, text }: { letter: string; label: string; text: string }) {
  if (!text?.trim()) return null;
  return (
    <View className="flex-row gap-2.5">
      <View className="w-7 h-7 rounded-lg items-center justify-center" style={{ backgroundColor: colors.docAccent }}>
        <Text className="text-white font-bold text-[13px]">{letter}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{label}</Text>
        <Text className="text-[13px] leading-5 text-slate-700">{text}</Text>
      </View>
    </View>
  );
}
