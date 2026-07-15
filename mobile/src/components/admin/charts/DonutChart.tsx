import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { NamedCount } from '../../../contracts';
import { colors } from '../../../theme';
import { ChartFrame, fmt, allZero } from './ChartFrame';

// Categorical palette (brand-led), reused across donut slices + legend.
const PALETTE = [
  colors.brand,
  colors.accent,
  colors.success,
  colors.warning,
  '#0EA5E9',
  '#EC4899',
  '#14B8A6',
  '#A855F7',
  '#F97316',
  colors.slate400,
];

/** Donut / ring chart — language usage share. */
export function DonutChart({
  title,
  subtitle,
  icon = 'pie-chart-outline',
  data,
  height = 200,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  data: NamedCount[];
  height?: number;
}) {
  const values = data.map((d) => d.value);
  const empty = allZero(values);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  // Top 6 slices; the rest collapse into "Other".
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 6);
  const restVal = sorted.slice(6).reduce((a, b) => a + b.value, 0);
  const slices = restVal > 0 ? [...top, { name: 'Other', value: restVal }] : top;

  return (
    <ChartFrame title={title} subtitle={subtitle} icon={icon} height={height} empty={empty}>
      {() => {
        const size = 132;
        const stroke = 20;
        const r = (size - stroke) / 2;
        const cx = size / 2;
        const cy = size / 2;
        const circ = 2 * Math.PI * r;
        let offset = 0;

        return (
          <View className="flex-row items-center">
            <Svg width={size} height={size}>
              <G rotation={-90} origin={`${cx}, ${cy}`}>
                <Circle cx={cx} cy={cy} r={r} stroke={colors.slate100} strokeWidth={stroke} fill="none" />
                {slices.map((sl, i) => {
                  const frac = sl.value / total;
                  const dash = frac * circ;
                  const el = (
                    <Circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={r}
                      stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={stroke}
                      fill="none"
                      strokeDasharray={`${dash} ${circ - dash}`}
                      strokeDashoffset={-offset}
                      strokeLinecap="butt"
                    />
                  );
                  offset += dash;
                  return el;
                })}
              </G>
            </Svg>
            <View className="flex-1 ml-4 gap-1.5">
              {slices.map((sl, i) => (
                <View key={i} className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <Text className="flex-1 text-[12px] text-slate-600" numberOfLines={1}>{sl.name}</Text>
                  <Text className="text-[12px] font-bold text-slate-800">{fmt(sl.value)}</Text>
                  <Text className="text-[10px] text-slate-400 w-9 text-right">
                    {Math.round((sl.value / total) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      }}
    </ChartFrame>
  );
}
