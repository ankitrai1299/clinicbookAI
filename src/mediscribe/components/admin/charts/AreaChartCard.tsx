import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TimeSeriesPoint } from '../../../contracts';
import ChartCard, { CHART, isEmptySeries, tooltipStyle } from './ChartCard';

interface AreaChartCardProps {
  title: string;
  subtitle?: string;
  data: TimeSeriesPoint[];
  color?: string;
  height?: number;
}

export default function AreaChartCard({
  title,
  subtitle,
  data,
  color = CHART.blue,
  height,
}: AreaChartCardProps) {
  const empty = isEmptySeries(data);
  const gradientId = `area-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <ChartCard title={title} subtitle={subtitle} empty={empty} height={height}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.28} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: CHART.axis }}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: CHART.axis }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [v, title]} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
