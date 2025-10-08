import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface RefundsChartProps {
  configuration?: any;
}

export default function RefundsChart({ configuration }: RefundsChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/charts/refunds"],
  });

  if (isLoading || !data) {
    return <div className="h-[300px] flex items-center justify-center">Loading...</div>;
  }

  const refundsData = data as any[];
  const totalRefunds = refundsData.reduce((sum, item) => sum + item.refunds, 0);
  const totalAmount = refundsData.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-4" data-testid="refunds-chart-content">
      <div className="flex items-center gap-6 pb-4 border-b">
        <div>
          <p className="text-sm text-muted-foreground">Total Refunds</p>
          <p className="text-xl font-bold">{totalRefunds}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total Amount</p>
          <p className="text-xl font-bold">${totalAmount.toLocaleString()}</p>
        </div>
      </div>
      
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={refundsData}>
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
            <Legend />
            <Line
              type="monotone"
              dataKey="refunds"
              name="Count"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="amount"
              name="Amount ($)"
              stroke="hsl(var(--chart-4))"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
