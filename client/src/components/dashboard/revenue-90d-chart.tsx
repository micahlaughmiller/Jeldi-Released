import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

interface Revenue90DChartProps {
  configuration?: any;
}

export default function Revenue90DChart({ configuration }: Revenue90DChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/charts/revenue-90d"],
  });

  if (isLoading || !data) {
    return <div className="h-[300px] flex items-center justify-center">Loading...</div>;
  }

  // Sample every 3 days to avoid overcrowding the chart
  const sampledData = (Array.isArray(data) ? (data as any[]) : []).filter((_, index) => index % 3 === 0);

  return (
    <div className="h-[300px]" data-testid="revenue-90d-chart-content">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sampledData}>
          <defs>
            <linearGradient id="revenue90dGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }}
            className="text-xs"
          />
          <YAxis
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            className="text-xs"
          />
          <Tooltip
            formatter={(value: any) => [`$${value.toLocaleString()}`, 'Revenue']}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="hsl(var(--chart-1))"
            fillOpacity={1}
            fill="url(#revenue90dGradient)"
          />
          <Line
            type="monotone"
            dataKey="target"
            stroke="hsl(var(--chart-2))"
            strokeDasharray="5 5"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
