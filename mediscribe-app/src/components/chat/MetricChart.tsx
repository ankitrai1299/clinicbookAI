// Charts for assistant answers, drawn with react-native-svg.
//
// Recharts is a DOM library and cannot run here; react-native-svg is already a
// dependency, so this needs nothing new installed. Only two shapes are offered
// because only two are ever warranted by the data the assistant returns: a bar
// chart for anything ordered or counted, and a donut for a parts-of-a-whole
// breakdown. A line chart over a handful of sparse days would imply a trend the
// data cannot support.
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, G, Circle, Path } from 'react-native-svg';
import type { ChatMetric } from '../../services/api';
import { colors } from '../../theme';

const PALETTE = [colors.brand, colors.accent, colors.successDark, colors.warningDark, '#7c6cf0', '#e07ab8', '#4bb8c9', '#9aa5b8'];

function BarChart({ series }: { series: { name: string; value: number }[] }) {
  const max = Math.max(...series.map((s) => s.value), 1);
  // A 24-hour breakdown is dense; anything else gets breathing room.
  const dense = series.length > 12;
  const height = 132;
  const gap = dense ? 2 : 6;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 300 ${height}`} preserveAspectRatio="none">
        {series.map((s, i) => {
          const w = (300 - gap * (series.length - 1)) / series.length;
          const h = Math.max(1, (s.value / max) * (height - 20));
          return (
            <Rect
              key={i}
              x={i * (w + gap)}
              y={height - h}
              width={w}
              height={h}
              rx={dense ? 1.5 : 3}
              fill={s.value === max ? colors.brand : '#c9d4e6'}
            />
          );
        })}
      </Svg>
      <View className="flex-row mt-1.5">
        {series.map((s, i) => {
          // Dense axes only label the peak and the ends, or the text collides.
          const show = !dense || i === 0 || i === series.length - 1 || s.value === max;
          return (
            <View key={i} style={{ flex: 1 }} className="items-center">
              <Text className="text-[9px] text-slate-400" numberOfLines={1}>
                {show ? s.name : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Donut arc path for one slice. */
function arc(cx: number, cy: number, r: number, inner: number, from: number, to: number): string {
  const p = (angle: number, radius: number) => [
    cx + radius * Math.cos(angle - Math.PI / 2),
    cy + radius * Math.sin(angle - Math.PI / 2),
  ];
  const [x1, y1] = p(from, r);
  const [x2, y2] = p(to, r);
  const [x3, y3] = p(to, inner);
  const [x4, y4] = p(from, inner);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

function Donut({ series }: { series: { name: string; value: number }[] }) {
  const total = series.reduce((a, b) => a + b.value, 0);
  if (!total) return null;
  let angle = 0;

  return (
    <View className="flex-row items-center gap-4">
      <Svg width={104} height={104} viewBox="0 0 104 104">
        <G>
          {series.map((s, i) => {
            const sweep = (s.value / total) * Math.PI * 2;
            const d = arc(52, 52, 50, 31, angle, angle + sweep);
            angle += sweep;
            // A single 100% slice is a full ring, which the arc path cannot
            // express (start and end coincide) — draw a circle instead.
            if (series.length === 1) {
              return <Circle key={i} cx={52} cy={52} r={40.5} stroke={PALETTE[0]} strokeWidth={19} fill="none" />;
            }
            return <Path key={i} d={d} fill={PALETTE[i % PALETTE.length]} />;
          })}
        </G>
      </Svg>
      <View className="flex-1 gap-1">
        {series.slice(0, 5).map((s, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PALETTE[i % PALETTE.length] }} />
            <Text className="text-[12px] text-slate-600 flex-1" numberOfLines={1}>
              {s.name}
            </Text>
            <Text className="text-[12px] font-semibold text-slate-800">
              {Math.round((s.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Render a metric's series, when one is worth showing.
 *
 * Returns null rather than an empty frame when there is nothing to plot — a
 * chart of one bar, or of all zeros, communicates less than the sentence above
 * it already did.
 */
export default function MetricChart({ metric }: { metric: ChatMetric }) {
  const series = (metric.series || []).filter((s) => Number.isFinite(s.value));
  if (series.length < 2) return null;
  if (!series.some((s) => s.value > 0)) return null;

  // Parts of a whole → donut. Ordered or counted → bars.
  const isBreakdown = series.length <= 6 && /rate|language|breakdown|status|incomplete/.test(metric.id);

  return (
    <View className="mt-3 bg-white rounded-2xl p-3.5 border border-slate-100">
      <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
        {metric.label}
      </Text>
      {isBreakdown ? <Donut series={series} /> : <BarChart series={series} />}
      {metric.coverage && metric.coverage.have < metric.coverage.total ? (
        <Text className="text-[10px] text-slate-300 mt-2">
          Based on {metric.coverage.have} of {metric.coverage.total} consultations that recorded this.
        </Text>
      ) : null}
    </View>
  );
}
