interface KPIWidgetProps {
  kpi: {
    id: string;
    name: string;
    type: string;
    position: number;
  };
  data?: {
    value: string;
    change: number;
    timestamp: Date;
  };
  position: number;
  onDelete?: (id: string) => void;
  preferenceId?: string;
}

export default function KPIWidget({ kpi, data, position, onDelete, preferenceId }: KPIWidgetProps) {
  const getKPIIcon = (type: string) => {
    switch (type) {
      case "revenue": return "fas fa-dollar-sign";
      case "orders": return "fas fa-shopping-cart";
      case "inventory": return "fas fa-boxes";
      case "performance": return "fas fa-chart-line";
      case "efficiency": return "fas fa-cogs";
      default: return "fas fa-chart-bar";
    }
  };

  // Static class names so Tailwind's scanner can see them
  const colorClasses = [
    { iconBg: "bg-chart-1/10", icon: "text-chart-1", bar: "bg-chart-1" },
    { iconBg: "bg-chart-2/10", icon: "text-chart-2", bar: "bg-chart-2" },
    { iconBg: "bg-chart-3/10", icon: "text-chart-3", bar: "bg-chart-3" },
    { iconBg: "bg-chart-4/10", icon: "text-chart-4", bar: "bg-chart-4" },
    { iconBg: "bg-chart-5/10", icon: "text-chart-5", bar: "bg-chart-5" },
  ];
  const getKPIColor = (position: number) => colorClasses[position % colorClasses.length];

  const isPositive = data ? data.change >= 0 : true;
  const color = getKPIColor(position);

  return (
    <div 
      className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-shadow relative group" 
      data-testid={`kpi-widget-${kpi.type}`}
    >
      {onDelete && preferenceId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(preferenceId);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-destructive/20"
          data-testid={`button-delete-kpi-${kpi.type}`}
          title="Remove KPI"
        >
          <i className="fas fa-times text-sm"></i>
        </button>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${color.iconBg} rounded-lg flex items-center justify-center`}>
          <i className={`${getKPIIcon(kpi.type)} ${color.icon} text-xl`}></i>
        </div>
        <div className={`flex items-center space-x-1 text-sm ${
          isPositive ? "text-chart-2" : "text-destructive"
        }`}>
          <i className={`fas fa-arrow-${isPositive ? "up" : "down"}`}></i>
          <span data-testid={`kpi-change-${kpi.type}`}>
            {data ? `${isPositive ? "+" : ""}${data.change.toFixed(1)}%` : "+0.0%"}
          </span>
        </div>
      </div>
      <div>
        <h3 
          className="text-2xl font-bold" 
          data-testid={`kpi-value-${kpi.type}`}
        >
          {data?.value || "N/A"}
        </h3>
        <p className="text-muted-foreground text-sm">{kpi.name}</p>
        <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full ${color.bar} rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(Math.abs(data?.change || 0) * 5, 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
