import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { NamedCount } from '../../../contracts';
import ChartCard, { CHART_PALETTE, isEmptySeries, tooltipStyle } from './ChartCard';

interface DonutChartProps {
  title: string;
  subtitle?: string;
  data: NamedCount[];
  height?: number;
}

export default function DonutChart({ title, subtitle, data, height }: DonutChartProps) {
  const empty = isEmptySeries(data);
  const rows = data.filter((d) => d.value > 0);

  return (
    <ChartCard title={title} subtitle={subtitle} empty={empty} height={height}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="none"
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [v, n]} />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span className="text-slate-600">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
