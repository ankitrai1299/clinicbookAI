import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui';
import { colors } from '../../theme';
import { ReportData, ComplaintRow, AllergyRow, MedicationRow, SystemGroup, Vitals, FollowUp } from '../../types';
import { REPORT_SECTIONS, ReportSectionDef, sectionHasContent, VITALS_FIELDS, FOLLOWUP_FIELDS, normalizeReport } from '../../utils/report';

const s = (v: any) => (typeof v === 'string' ? v : '');

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
                <Text className="text-[13.5px] font-bold text-slate-800">{m.medicine}{m.strength ? ` ${m.strength}` : ''}</Text>
                {sub ? <Text className="text-xs text-slate-500 mt-0.5">{sub}</Text> : null}
                {m.instructions ? <Text className="text-xs text-slate-500 mt-0.5 italic">{m.instructions}</Text> : null}
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

/** Clean, read-only render of a clinical report — reused by admin detail views. */
export function ReportView({ report }: { report: ReportData }) {
  const normalized = normalizeReport(report);
  const filled = REPORT_SECTIONS.filter((sec) => sectionHasContent(normalized, sec));
  if (filled.length === 0) {
    return (
      <Card className="p-6 items-center" elevation="sm">
        <Text className="text-sm text-slate-400">This report has no content.</Text>
      </Card>
    );
  }
  return (
    <View className="gap-3">
      {filled.map((sec, i) => (
        <Card key={sec.key} className="p-4" elevation="sm">
          <View className="flex-row items-center gap-2 mb-2.5">
            <View className="w-6 h-6 rounded-lg bg-brand-50 items-center justify-center">
              <Text className="text-[11px] font-bold text-brand-600">{i + 1}</Text>
            </View>
            <Text className="font-bold text-[14px] text-slate-900 flex-1">{sec.title}</Text>
          </View>
          <SectionBody section={sec} report={normalized} />
        </Card>
      ))}
    </View>
  );
}
