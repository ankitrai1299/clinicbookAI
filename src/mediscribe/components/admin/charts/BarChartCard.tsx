import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { TimeSeriesPoint, NamedCount } from '../../../contracts';
import ChartCard, { CHART, CHART_PALETTE, isEmptySeries, tooltipStyle } from './ChartCard';

interface BarChartCardProps {
  title: string;
  subtitle?: string;
  data: (TimeSeriesPoint | NamedCount)[];
  color?: string;
  /** Render horizontal bars (good for ranked name lists like doctor activity). */
  horizontal?: boolean;
  /** Colour each bar from the categorical palette. */
  multicolor?: boolean;
  height?: number;
}

// Normalizes both TimeSeriesPoint ({label,value}) and NamedCount ({name,value})
// into a common {name,value} shape for the bars.
function normalize(data: (TimeSeriesPoint | NamedCount)[]) {
  return data.map((d) => ({
    name: 'label' in d ? d.label : d.name,
    value: d.value,
  }));
}

export default function BarChartCard({
  title,
  subtitle,
  data,
  color = CHART.blue,
  horizontal = false,
  multicolor = false,
  height,
}: BarChartCardProps) {
  const empty = isEmptySeries(data);
  const rows = normalize(data);

  return (
    <ChartCard title={title} subtitle={subtitle} empty={empty} height={height}>
      <ResponsiveContainer>
        <BarChart
          data={rows}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 16, left: horizontal ? 8 : -12, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={!horizontal ? false : true} horizontal={horizontal ? false : true} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: CHART.axis }}
                tickLine={false}
                axisLine={{ stroke: CHART.grid }}
                width={110}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: CHART.axis }}
                tickLine={false}
                axisLine={{ stroke: CHART.grid }}
              />
              <YAxis tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} width={40} />
            </>
          )}
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(37,99,235,0.06)' }} formatter={(v: number) => [v, title]} />
          <Bar dataKey="value" fill={color} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={48}>
            {multicolor &&
              rows.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
