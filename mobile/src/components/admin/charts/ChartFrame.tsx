import React, { ReactNode, useState } from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../ui';
import { colors } from '../../../theme';

type Ion = keyof typeof Ionicons.glyphMap;

/**
 * Shared framing for every admin chart: a titled Card, a width-measuring body,
 * and a built-in empty state so callers stay tiny. `empty` renders the empty
 * placeholder instead of the chart (used when a series is all zeros / missing).
 */
export function ChartFrame({
  title,
  subtitle,
  icon = 'stats-chart-outline',
  height = 160,
  empty,
  emptyLabel = 'No data yet',
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: Ion;
  height?: number;
  empty?: boolean;
  emptyLabel?: string;
  children: (width: number) => ReactNode;
  footer?: ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <Card className="p-4" elevation="sm">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="w-7 h-7 rounded-lg bg-brand-50 items-center justify-center">
          <Ionicons name={icon} size={15} color={colors.brand} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-[15px] text-slate-900 tracking-tight">{title}</Text>
          {subtitle ? <Text className="text-[11px] text-slate-400 mt-0.5">{subtitle}</Text> : null}
        </View>
      </View>

      <View onLayout={onLayout} style={{ minHeight: height }}>
        {empty ? (
          <View className="items-center justify-center" style={{ height }}>
            <Ionicons name="bar-chart-outline" size={26} color={colors.slate300} />
            <Text className="text-xs text-slate-400 mt-2">{emptyLabel}</Text>
          </View>
        ) : width > 0 ? (
          children(width)
        ) : null}
      </View>

      {footer ? <View className="mt-3">{footer}</View> : null}
    </Card>
  );
}

// Nice, human-friendly compact number for axis / labels.
export const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
};

export const allZero = (values: number[]): boolean =>
  values.length === 0 || values.every((v) => !v || v === 0);
