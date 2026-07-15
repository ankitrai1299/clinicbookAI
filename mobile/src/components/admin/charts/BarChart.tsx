import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Line, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { TimeSeriesPoint } from '../../../contracts';
import { colors } from '../../../theme';
import { ChartFrame, fmt, allZero } from './ChartFrame';

/** Vertical bar chart — weekly usage, monthly analytics. */
export function BarChart({
  title,
  subtitle,
  icon,
  data,
  color = colors.brand,
  height = 170,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  data: TimeSeriesPoint[];
  color?: string;
  height?: number;
}) {
  const values = data.map((d) => d.value);
  const empty = allZero(values);

  return (
    <ChartFrame title={title} subtitle={subtitle} icon={icon} height={height} empty={empty}>
      {(width) => {
        const padX = 6;
        const padTop = 12;
        const padBottom = 22;
        const w = width;
        const h = height;
        const innerW = w - padX * 2;
        const innerH = h - padTop - padBottom;
        const max = Math.max(...values, 1);
        const n = data.length;
        const slot = n > 0 ? innerW / n : innerW;
        const barW = Math.max(6, Math.min(28, slot * 0.6));

        const labelIdx = n <= 6 ? data.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

        return (
          <View>
            <Svg width={w} height={h}>
              <Defs>
                <SvgGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={1} />
                  <Stop offset="1" stopColor={color} stopOpacity={0.55} />
                </SvgGradient>
              </Defs>
              <Line x1={padX} y1={padTop + innerH} x2={w - padX} y2={padTop + innerH} stroke={colors.slate150} strokeWidth={1} />
              {data.map((d, i) => {
                const barH = Math.max(2, (d.value / max) * innerH);
                const x = padX + i * slot + (slot - barW) / 2;
                const y = padTop + innerH - barH;
                return <Rect key={i} x={x} y={y} width={barW} height={barH} rx={4} fill="url(#barFill)" />;
              })}
            </Svg>
            <View className="flex-row justify-between mt-1" style={{ paddingHorizontal: padX }}>
              {labelIdx.map((i) => (
                <Text key={i} className="text-[10px] text-slate-400" numberOfLines={1}>
                  {data[i]?.label}
                </Text>
              ))}
            </View>
            <Text className="text-[11px] text-slate-400 mt-2">
              Peak <Text className="font-bold text-slate-600">{fmt(max)}</Text>
            </Text>
          </View>
        );
      }}
    </ChartFrame>
  );
}
