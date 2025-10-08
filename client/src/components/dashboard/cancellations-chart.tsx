import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface CancellationsChartProps {
  configuration?: any;
}

export default function CancellationsChart({ configuration }: CancellationsChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/charts/cancellations"],
  });

  if (isLoading || !data) {
    return <div className="h-[300px] flex items-center justify-center">Loading...</div>;
  }

  const cancellationsData = data as any[];
  const totalCancellations = cancellationsData.reduce((sum, item) => sum + item.cancellations, 0);

  // Group by reason for summary
  const reasonCounts = cancellationsData.reduce((acc: any, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4" data-testid="cancellations-chart-content">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <p className="text-sm text-muted-foreground">Total Cancellations (30d)</p>
          <p className="text-2xl font-bold">{totalCancellations}</p>
        </div>
        <div className="flex gap-2">
          {Object.entries(reasonCounts).slice(0, 2).map(([reason, count]) => (
            <div key={reason} className="text-xs text-muted-foreground">
              <span className="font-medium">{reason}:</span> {count as number}
            </div>
          ))}
        </div>
      </div>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={cancellationsData.slice(-7)}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const date = new Date(value);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip
              labelFormatter={(label) => new Date(label).toLocaleDateString()}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Bar
              dataKey="cancellations"
              fill="hsl(var(--chart-5))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
