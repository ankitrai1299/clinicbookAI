import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TimeSeriesPoint } from '../../../contracts';
import ChartCard, { CHART, isEmptySeries, tooltipStyle } from './ChartCard';

interface LineChartCardProps {
  title: string;
  subtitle?: string;
  data: TimeSeriesPoint[];
  color?: string;
  /** Suffix appended to axis/tooltip values, e.g. "%". */
  unit?: string;
  height?: number;
}

export default function LineChartCard({
  title,
  subtitle,
  data,
  color = CHART.blue,
  unit,
  height,
}: LineChartCardProps) {
  const empty = isEmptySeries(data);
  return (
    <ChartCard title={title} subtitle={subtitle} empty={empty} height={height}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
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
            tickFormatter={(v) => `${v}${unit || ''}`}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(v: number) => [`${v}${unit || ''}`, title]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
