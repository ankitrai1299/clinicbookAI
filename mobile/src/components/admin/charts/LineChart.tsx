import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { TimeSeriesPoint } from '../../../contracts';
import { colors } from '../../../theme';
import { ChartFrame, fmt, allZero } from './ChartFrame';

/**
 * Smooth-ish line chart with a soft gradient fill under the curve. Used for
 * daily consultations, AI report usage, STT accuracy (%) and patient growth.
 */
export function LineChart({
  title,
  subtitle,
  icon,
  data,
  color = colors.brand,
  suffix = '',
  height = 170,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  data: TimeSeriesPoint[];
  color?: string;
  suffix?: string;
  height?: number;
}) {
  const values = data.map((d) => d.value);
  const empty = allZero(values);

  return (
    <ChartFrame title={title} subtitle={subtitle} icon={icon} height={height} empty={empty}>
      {(width) => {
        const padX = 8;
        const padTop = 12;
        const padBottom = 22;
        const w = width;
        const h = height;
        const innerW = w - padX * 2;
        const innerH = h - padTop - padBottom;
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const range = max - min || 1;
        const n = data.length;
        const stepX = n > 1 ? innerW / (n - 1) : 0;

        const pts = data.map((d, i) => {
          const x = padX + i * stepX;
          const y = padTop + innerH - ((d.value - min) / range) * innerH;
          return { x, y };
        });

        const linePath = pts
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' ');
        const areaPath =
          pts.length > 0
            ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${padTop + innerH} L ${pts[0].x.toFixed(1)} ${padTop + innerH} Z`
            : '';

        // Sparse x labels (first, middle, last) to avoid crowding.
        const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

        return (
          <View>
            <Svg width={w} height={h}>
              <Defs>
                <SvgGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={color} stopOpacity={0.01} />
                </SvgGradient>
              </Defs>
              {/* baseline */}
              <Line x1={padX} y1={padTop + innerH} x2={w - padX} y2={padTop + innerH} stroke={colors.slate150} strokeWidth={1} />
              {areaPath ? <Path d={areaPath} fill="url(#lineFill)" /> : null}
              {linePath ? <Path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
              {pts.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={i === n - 1 ? 4 : 2.5} fill={colors.white} stroke={color} strokeWidth={2} />
              ))}
            </Svg>
            <View className="flex-row justify-between mt-1" style={{ paddingHorizontal: padX }}>
              {labelIdx.map((i) => (
                <Text key={i} className="text-[10px] text-slate-400" numberOfLines={1}>
                  {data[i]?.label}
                </Text>
              ))}
            </View>
            <View className="flex-row items-center gap-3 mt-2">
              <Text className="text-[11px] text-slate-400">
                Peak <Text className="font-bold text-slate-600">{fmt(max)}{suffix}</Text>
              </Text>
              <Text className="text-[11px] text-slate-400">
                Latest <Text className="font-bold text-slate-600">{fmt(values[values.length - 1] || 0)}{suffix}</Text>
              </Text>
            </View>
          </View>
        );
      }}
    </ChartFrame>
  );
}
