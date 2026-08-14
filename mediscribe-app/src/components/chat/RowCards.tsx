// Compact cards for a list answer ("show last 10 patients", "who visited
// multiple times"). Replaces the wide markdown table, which did not fit a phone
// and — as a horizontal ScrollView with no height bound — stretched and
// overflowed its message bubble.
//
// Each row object becomes one small card: the first column is the title (the
// patient name), the rest render as a muted "key value" line beneath it. Height
// is entirely content-driven, so nothing is ever an empty placeholder.
import React from 'react';
import { View, Text } from 'react-native';

type Row = Record<string, unknown>;

export default function RowCards({ rows }: { rows: Row[] }) {
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]);
  const [titleKey, ...restKeys] = cols;

  return (
    <View className="mt-2 gap-1.5 w-full">
      {rows.map((row, i) => (
        <View
          key={i}
          className="flex-row items-center justify-between bg-slate-50 rounded-xl px-3.5 py-2.5"
        >
          <Text className="text-[14px] font-semibold text-slate-800 flex-1" numberOfLines={1}>
            {String(row[titleKey] ?? '-')}
          </Text>
          {restKeys.length ? (
            <Text className="text-[12.5px] text-slate-500 ml-3" numberOfLines={1}>
              {restKeys.map((k) => `${row[k]} ${k}`.trim()).join(' · ')}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
