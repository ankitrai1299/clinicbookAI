import React from 'react';
import { View, Text } from 'react-native';
import { NamedCount } from '../../../contracts';
import { colors } from '../../../theme';
import { ChartFrame, fmt, allZero } from './ChartFrame';

/**
 * Horizontal ranked bars — doctor activity, most-used medicines / diagnoses /
 * ICD codes / LOINC tests. Pure View bars (no SVG needed); each row shows a
 * proportional fill and its value.
 */
export function RankBars({
  title,
  subtitle,
  icon = 'podium-outline',
  data,
  color = colors.brand,
  limit = 8,
  height = 150,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  data: NamedCount[];
  color?: string;
  limit?: number;
  height?: number;
  emptyLabel?: string;
}) {
  const rows = [...data].sort((a, b) => b.value - a.value).slice(0, limit);
  const empty = allZero(rows.map((r) => r.value));
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      icon={icon}
      height={height}
      empty={empty}
      emptyLabel={emptyLabel}
    >
      {() => (
        <View className="gap-2.5">
          {rows.map((r, i) => (
            <View key={`${r.name}-${i}`} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-[12.5px] text-slate-700 font-medium" numberOfLines={1}>
                  {r.name}
                </Text>
                <Text className="text-[12.5px] font-bold text-slate-800 ml-2">{fmt(r.value)}</Text>
              </View>
              <View className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <View
                  className="h-2 rounded-full"
                  style={{ width: `${Math.max(4, (r.value / max) * 100)}%`, backgroundColor: color }}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </ChartFrame>
  );
}
