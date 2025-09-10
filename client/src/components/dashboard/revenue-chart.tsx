interface RevenueChartProps {
  data: Record<string, any>;
}

export default function RevenueChart({ data }: RevenueChartProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-6" data-testid="revenue-chart">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Revenue Trend</h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-chart-1 rounded-full"></div>
          <span className="text-sm text-muted-foreground">Last 30 days</span>
        </div>
      </div>
      <div className="chart-container">
        <svg className="w-full h-full" viewBox="0 0 400 200">
          <defs>
            <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{stopColor: "hsl(var(--chart-1))", stopOpacity: 0.3}} />
              <stop offset="100%" style={{stopColor: "hsl(var(--chart-1))", stopOpacity: 0}} />
            </linearGradient>
          </defs>
          <path 
            d="M0,150 L50,120 L100,100 L150,80 L200,90 L250,70 L300,50 L350,40 L400,30" 
            className="trend-line"
          />
          <path 
            d="M0,150 L50,120 L100,100 L150,80 L200,90 L250,70 L300,50 L350,40 L400,30 L400,200 L0,200 Z" 
            fill="url(#revenueGradient)"
          />
        </svg>
      </div>
    </div>
  );
}
