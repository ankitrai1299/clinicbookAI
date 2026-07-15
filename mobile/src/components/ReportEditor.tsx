import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ReportData,
  MedicationRow,
  ComplaintRow,
  AllergyRow,
  SystemGroup,
  Vitals,
  FollowUp,
} from '../types';
import {
  REPORT_SECTIONS,
  ReportSectionDef,
  ColumnDef,
  sectionHasContent,
  emptyMedicationRow,
  VITALS_FIELDS,
  FOLLOWUP_FIELDS,
  COMPLAINT_COLUMNS,
  ALLERGY_COLUMNS,
  TREATMENT_COLUMNS,
} from '../utils/report';
import { colors } from '../theme';

// Renders / edits the Premium Clinical Report. Section list, editable-vs-read-only
// rules, "hide empty read-only sections" and per-section field keys all match the
// web ConsultationWorkspace exactly — nothing is renamed or removed.
interface Props {
  report: ReportData;
  onChange: (next: ReportData) => void;
}

const inputCls =
  'bg-white border border-slate-200 rounded-md px-2.5 py-2 text-sm text-slate-900';

const cell = (r: Record<string, any>, key: string): string =>
  (typeof r[key] === 'string' && r[key]) || (key === 'dose' ? (r.dosage as string) || '' : '');

export default function ReportEditor({ report, onChange }: Props) {
  // Editable sections the doctor has chosen to add even though the consultation
  // didn't populate them (so empty sections stay hidden until explicitly added).
  const [added, setAdded] = useState<Set<string>>(new Set());

  // ── mutation helpers (ported from ConsultationWorkspace) ────
  const updateBullet = (section: keyof ReportData, index: number, value: string) => {
    const items = [...(report[section] as string[])];
    items[index] = value;
    onChange({ ...report, [section]: items });
  };
  const addBullet = (section: keyof ReportData) =>
    onChange({ ...report, [section]: [...(report[section] as string[]), ''] });
  const removeBullet = (section: keyof ReportData, index: number) =>
    onChange({
      ...report,
      [section]: (report[section] as string[]).filter((_, i) => i !== index),
    });

  const updateVital = (field: keyof Vitals, value: string) =>
    onChange({ ...report, clinicalMeasurements: { ...report.clinicalMeasurements, [field]: value } });
  const updateFollowUp = (field: keyof FollowUp, value: string) =>
    onChange({ ...report, followUp: { ...report.followUp, [field]: value } });

  const updateMed = (
    section: keyof ReportData,
    index: number,
    field: keyof MedicationRow,
    value: string,
  ) => {
    const rows = [...(report[section] as MedicationRow[])];
    rows[index] = { ...rows[index], [field]: value };
    onChange({ ...report, [section]: rows });
  };
  const addMed = (section: keyof ReportData) =>
    onChange({ ...report, [section]: [...(report[section] as MedicationRow[]), emptyMedicationRow()] });
  const removeMed = (section: keyof ReportData, index: number) =>
    onChange({
      ...report,
      [section]: (report[section] as MedicationRow[]).filter((_, i) => i !== index),
    });

  // ── read-only renderers ─────────────────────────────────────
  const renderBulletsRO = (items: string[]) => (
    <View className="gap-1">
      {items.filter(Boolean).map((it, i) => (
        <View key={i} className="flex-row gap-2">
          <Text className="text-blue-400 leading-5">•</Text>
          <Text className="flex-1 text-sm text-slate-700 leading-5">{it}</Text>
        </View>
      ))}
    </View>
  );

  // Mobile-friendly table: one labeled card per row (keeps every column/key).
  const renderTableRO = (cols: ColumnDef[], rows: Record<string, any>[]) => (
    <View className="gap-2">
      {rows.map((r, i) => (
        <View key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 gap-1">
          {cols.map((c) => {
            const v = cell(r, c.key);
            if (!v) return null;
            return (
              <View key={c.key} className="flex-row">
                <Text className="text-[11px] font-semibold text-slate-500 w-24">{c.label}</Text>
                <Text className="flex-1 text-sm text-slate-800">{v}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );

  const renderGroupsRO = (groups: SystemGroup[]) => (
    <View className="gap-2.5">
      {groups
        .filter((g) => g.findings.filter(Boolean).length || g.name.trim())
        .map((g, i) => (
          <View key={i}>
            <Text className="text-[11px] font-bold text-slate-600 mb-0.5">{g.name || 'Findings'}</Text>
            {renderBulletsRO(g.findings)}
          </View>
        ))}
    </View>
  );

  // ── editable renderers ──────────────────────────────────────
  const renderMedEditor = (section: ReportSectionDef) => {
    const cols = section.columns || TREATMENT_COLUMNS;
    const rows = report[section.key] as MedicationRow[];
    return (
      <View className="gap-2">
        {rows.length === 0 && (
          <Text className="text-xs text-slate-400 italic">No medicines added.</Text>
        )}
        {rows.map((row, i) => (
          <View key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Medicine {i + 1}
              </Text>
              <TouchableOpacity onPress={() => removeMed(section.key, i)} hitSlop={8}>
                <Ionicons name="trash-outline" size={15} color={colors.slate400} />
              </TouchableOpacity>
            </View>
            <View className="flex-row flex-wrap gap-1.5">
              {cols.map((col) => (
                <View key={col.key} className="w-[48%]">
                  <TextInput
                    value={(row as Record<string, any>)[col.key] ?? cell(row, col.key)}
                    onChangeText={(t) => updateMed(section.key, i, col.key as keyof MedicationRow, t)}
                    placeholder={col.label}
                    placeholderTextColor={colors.slate400}
                    className={inputCls}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
        <TouchableOpacity
          onPress={() => addMed(section.key)}
          className="flex-row items-center gap-1.5 mt-1"
        >
          <Ionicons name="add" size={16} color={colors.brand} />
          <Text className="text-xs font-semibold text-blue-600">Add medicine</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderBulletEditor = (section: ReportSectionDef) => {
    const items = report[section.key] as string[];
    return (
      <View className="gap-1.5">
        {items.length === 0 && <Text className="text-xs text-slate-400 italic">Nothing added.</Text>}
        {items.map((item, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <Text className="text-slate-400">•</Text>
            <TextInput
              value={item}
              onChangeText={(t) => updateBullet(section.key, i, t)}
              placeholder="—"
              placeholderTextColor={colors.slate400}
              className={`flex-1 ${inputCls}`}
            />
            <TouchableOpacity onPress={() => removeBullet(section.key, i)} hitSlop={8}>
              <Ionicons name="trash-outline" size={15} color={colors.slate400} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={() => addBullet(section.key)} className="flex-row items-center gap-1.5 mt-1">
          <Ionicons name="add" size={16} color={colors.brand} />
          <Text className="text-xs font-semibold text-blue-600">Add item</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderVitalsEditor = () => (
    <View className="flex-row flex-wrap gap-2">
      {VITALS_FIELDS.map((f) => (
        <View key={f.key} className="w-[48%] gap-0.5">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {f.label}
          </Text>
          <TextInput
            value={report.clinicalMeasurements[f.key]}
            onChangeText={(t) => updateVital(f.key, t)}
            placeholder={f.label}
            placeholderTextColor={colors.slate400}
            className={inputCls}
          />
        </View>
      ))}
    </View>
  );

  const renderFollowUpEditor = () => (
    <View className="gap-2">
      {FOLLOWUP_FIELDS.map((f) => (
        <View key={f.key} className="gap-0.5">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {f.label}
          </Text>
          <TextInput
            value={report.followUp[f.key]}
            onChangeText={(t) => updateFollowUp(f.key, t)}
            placeholder={f.label}
            placeholderTextColor={colors.slate400}
            className={inputCls}
          />
        </View>
      ))}
    </View>
  );

  // Dispatch a section to the right renderer (editable vs read-only).
  const renderSectionBody = (section: ReportSectionDef) => {
    const value = report[section.key];
    if (section.editable) {
      switch (section.kind) {
        case 'medications':
          return renderMedEditor(section);
        case 'vitals':
          return renderVitalsEditor();
        case 'followup':
          return renderFollowUpEditor();
        default:
          return renderBulletEditor(section);
      }
    }
    switch (section.kind) {
      case 'overview':
        return <Text className="text-sm text-slate-700 leading-relaxed">{value as string}</Text>;
      case 'complaints':
        return renderTableRO(COMPLAINT_COLUMNS, value as ComplaintRow[]);
      case 'allergies':
        return renderTableRO(ALLERGY_COLUMNS, value as AllergyRow[]);
      case 'groups':
        return renderGroupsRO(value as SystemGroup[]);
      default:
        return renderBulletsRO(value as string[]);
    }
  };

  // Only show sections that actually have content — no empty "Nothing recorded"
  // sections. Editable sections the doctor explicitly added are also shown.
  const visibleSections = REPORT_SECTIONS.filter(
    (s) => sectionHasContent(report, s) || added.has(s.key as string),
  );
  // Editable sections with no data yet — offered as "Add" chips so the doctor
  // can still record medicines/advice/vitals/follow-up when needed.
  const addable = REPORT_SECTIONS.filter(
    (s) => s.editable && !sectionHasContent(report, s) && !added.has(s.key as string),
  );

  const addSection = (section: ReportSectionDef) => {
    setAdded((prev) => new Set(prev).add(section.key as string));
    if (section.kind === 'medications') {
      onChange({ ...report, [section.key]: [...(report[section.key] as MedicationRow[]), emptyMedicationRow()] });
    } else if (section.kind === 'bullets') {
      onChange({ ...report, [section.key]: [...(report[section.key] as string[]), ''] });
    }
    // vitals / followup are objects already present — revealing them is enough.
  };

  return (
    <View className="gap-6">
      {visibleSections.map((section, idx) => (
        <View key={section.key as string}>
          <View className="flex-row items-center justify-between gap-2 mb-2 border-b border-slate-100 pb-1">
            <Text className="text-xs font-bold text-blue-700 uppercase tracking-wide flex-1">
              {idx + 1}. {section.title}
            </Text>
            <View
              className={`px-1.5 py-0.5 rounded ${
                section.editable ? 'bg-emerald-50' : 'bg-slate-100'
              }`}
            >
              <Text
                className={`text-[9px] font-bold uppercase tracking-wider ${
                  section.editable ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {section.editable ? 'Editable' : 'Read-only'}
              </Text>
            </View>
          </View>
          {renderSectionBody(section)}
        </View>
      ))}

      {addable.length > 0 && (
        <View>
          <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Add to report</Text>
          <View className="flex-row flex-wrap gap-2">
            {addable.map((s) => (
              <TouchableOpacity
                key={s.key as string}
                onPress={() => addSection(s)}
                activeOpacity={0.8}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 bg-white"
              >
                <Ionicons name="add" size={15} color={colors.brand} />
                <Text className="text-sm font-medium text-slate-600">{s.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
