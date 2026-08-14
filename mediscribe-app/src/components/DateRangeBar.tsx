// Date-range filter: preset chips, the selected range, and a custom From/To
// picker.
//
// The calendar is built here rather than pulled in from a native date-picker
// package on purpose — a native module needs a rebuild to appear, and this has
// to work in Expo Go and in any existing dev build. It also keeps the picker in
// the app's own visual language instead of the OS dialog's.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Card } from './ui';
import {
  DateRange,
  RangePreset,
  PRESET_LABELS,
  presetRange,
  presetTriggerKey,
  rangeFromDates,
  rangeLabel,
} from '../utils/dateRange';
import { colors } from '../theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Days to render for `month`, padded so the 1st lands on the right weekday. */
function monthGrid(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const cells: (Date | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
  return cells;
}

const sameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.toDateString() === b.toDateString();

function Calendar({
  month,
  onMonthChange,
  from,
  to,
  onPick,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  from: Date | null;
  to: Date | null;
  onPick: (d: Date) => void;
}) {
  const cells = monthGrid(month);
  const today = new Date();
  // A future consultation cannot have happened, so future dates are not
  // selectable — it would only ever produce an empty range.
  const isFuture = (d: Date) => d.getTime() > new Date().setHours(23, 59, 59, 999);

  const inRange = (d: Date) =>
    !!from && !!to && d.getTime() >= from.setHours(0, 0, 0, 0) && d.getTime() <= to.setHours(23, 59, 59, 999);

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <TouchableOpacity
          onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          accessibilityLabel="Previous month"
          className="w-8 h-8 rounded-full bg-slate-50 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={16} color={colors.slate500} />
        </TouchableOpacity>
        <Text className="text-[15px] font-bold text-slate-900">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          accessibilityLabel="Next month"
          className="w-8 h-8 rounded-full bg-slate-50 items-center justify-center"
        >
          <Ionicons name="chevron-forward" size={16} color={colors.slate500} />
        </TouchableOpacity>
      </View>

      <View className="flex-row">
        {WEEKDAYS.map((w, i) => (
          <View key={i} className="items-center" style={{ width: `${100 / 7}%` }}>
            <Text className="text-[11px] font-bold text-slate-300">{w}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap mt-1">
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 38 }} />;
          const selected = sameDay(d, from) || sameDay(d, to);
          const between = !selected && inRange(new Date(d));
          const disabled = isFuture(d);
          return (
            <View key={i} style={{ width: `${100 / 7}%`, height: 38 }} className="items-center justify-center">
              <TouchableOpacity
                disabled={disabled}
                onPress={() => onPick(d)}
                activeOpacity={0.7}
                accessibilityLabel={d.toDateString()}
                className={`w-8 h-8 rounded-full items-center justify-center ${
                  selected ? 'bg-brand-500' : between ? 'bg-brand-50' : ''
                }`}
              >
                <Text
                  className="text-[13px]"
                  style={{
                    color: disabled
                      ? colors.slate300
                      : selected
                        ? colors.white
                        : sameDay(d, today)
                          ? colors.brand
                          : colors.slate700,
                    fontWeight: selected || sameDay(d, today) ? '700' : '400',
                  }}
                >
                  {d.getDate()}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function DateRangeBar({
  range,
  onChange,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);

  const openCustom = () => {
    setFrom(new Date(range.start));
    setTo(new Date(range.end));
    setMonth(new Date(range.end));
    setOpen(true);
  };

  const pick = (d: Date) => {
    // First tap sets From and clears To; the second completes the range. Tapping
    // a date before From restarts from there rather than producing an inverted
    // range the doctor would have to undo.
    if (!from || to || d.getTime() < from.getTime()) {
      setFrom(d);
      setTo(null);
      return;
    }
    setTo(d);
  };

  const apply = () => {
    if (!from) return;
    onChange(rangeFromDates(from, to ?? from, 'custom'));
    setOpen(false);
  };

  const select = (preset: RangePreset) => {
    setSheetOpen(false);
    if (preset === 'custom') return openCustom();
    onChange(presetRange(preset));
  };

  return (
    <>
      {/* Compact filter control: the selected period on the left as a quiet
          text trigger, the dates it resolved to on the right. No oversized
          chips — this reads like Stripe/Linear rather than a toggle bar. */}
      <View className="flex-row items-center justify-between mb-3">
        <TouchableOpacity
          onPress={() => setSheetOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('dateRange.selectPeriod')}
          className="flex-row items-center gap-1"
        >
          <Text className="text-[15px] font-semibold text-slate-900">{t(presetTriggerKey(range))}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.slate400} />
        </TouchableOpacity>
        <Text className="text-[12.5px] font-medium text-slate-400">{rangeLabel(range)}</Text>
      </View>

      {/* Period picker — a bottom sheet, not a row of buttons. */}
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSheetOpen(false)} className="flex-1 bg-black/40 justify-end">
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <Card className="rounded-b-none" elevation="lg">
              <View className="items-center pt-2.5 pb-1">
                <View className="w-9 h-1 rounded-full bg-slate-200" />
              </View>
              <View className="px-5 pt-2 pb-1">
                <Text className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
                  {t('dateRange.selectPeriod')}
                </Text>
              </View>
              <View className="px-3 pb-2">
                {PRESET_LABELS.map((p, i) => {
                  const active = range.preset === p.key;
                  const isCustom = p.key === 'custom';
                  return (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => select(p.key)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className={`flex-row items-center justify-between px-2.5 py-3.5 ${
                        i < PRESET_LABELS.length - 1 ? 'border-b border-slate-50' : ''
                      }`}
                    >
                      <View className="flex-row items-center gap-3">
                        {isCustom ? (
                          <Ionicons name="calendar-outline" size={18} color={colors.slate400} />
                        ) : (
                          <View style={{ width: 18 }} />
                        )}
                        <Text
                          className={`text-[15px] ${active ? 'font-bold text-brand-600' : 'font-medium text-slate-700'}`}
                        >
                          {t(p.labelKey)}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark" size={18} color={colors.brand} />
                      ) : isCustom ? (
                        <Ionicons name="chevron-forward" size={16} color={colors.slate300} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <Card className="rounded-b-none max-h-[85%]" elevation="lg">
            <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-[17px] font-bold text-slate-900">{t('dateRange.customTitle')}</Text>
                <TouchableOpacity onPress={() => setOpen(false)} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={colors.slate400} />
                </TouchableOpacity>
              </View>

              <View className="flex-row gap-3 mb-4">
                {[
                  { label: t('dateRange.from'), value: from },
                  { label: t('dateRange.to'), value: to },
                ].map((f) => (
                  <View key={f.label} className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5">
                    <Text className="text-[11px] font-bold text-slate-400 uppercase">{f.label}</Text>
                    <Text className="text-[14px] font-semibold text-slate-900 mt-0.5">
                      {f.value
                        ? f.value.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
                        : t('dateRange.select')}
                    </Text>
                  </View>
                ))}
              </View>

              <Calendar month={month} onMonthChange={setMonth} from={from} to={to} onPick={pick} />

              <Text className="text-[11.5px] text-slate-400 mt-3 text-center">
                {!from || to ? t('dateRange.pickStart') : t('dateRange.pickEnd')}
              </Text>

              <TouchableOpacity
                onPress={apply}
                disabled={!from}
                activeOpacity={0.85}
                className={`mt-4 py-3.5 rounded-2xl items-center ${from ? 'bg-brand-500' : 'bg-slate-200'}`}
              >
                <Text className="text-white font-bold text-[15px]">
                  {from && !to ? t('dateRange.applySingleDay') : t('dateRange.applyRange')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Card>
        </View>
      </Modal>
    </>
  );
}
