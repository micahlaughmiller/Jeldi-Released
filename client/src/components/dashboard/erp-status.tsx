interface ERPSystem {
  name: string;
  displayName: string;
  description: string;
  isConnected?: boolean;
  lastSync?: Date;
}

interface ERPStatusProps {
  systems: ERPSystem[];
}

export default function ERPStatus({ systems }: ERPStatusProps) {
  const getSystemIcon = (name: string) => {
    switch (name) {
      case "sap": return "fas fa-database";
      case "netsuite": return "fas fa-cloud";
      case "dynamics365": return "fas fa-windows";
      case "oracle_fusion": return "fas fa-building";
      case "workday": return "fas fa-users";
      case "ifs": return "fas fa-tools";
      default: return "fas fa-database";
    }
  };

  const getSystemColor = (name: string) => {
    switch (name) {
      case "sap": return "bg-blue-600";
      case "netsuite": return "bg-red-600";
      case "dynamics365": return "bg-blue-500";
      case "oracle_fusion": return "bg-red-700";
      case "workday": return "bg-yellow-600";
      case "ifs": return "bg-green-600";
      default: return "bg-primary";
    }
  };

  const connectedSystems = systems.filter(s => s.isConnected).slice(0, 3);

  return (
    <div className="bg-card rounded-xl border border-border p-6" data-testid="erp-status">
      <h3 className="text-lg font-semibold mb-6">ERP Systems Status</h3>
      <div className="space-y-4">
        {connectedSystems.length > 0 ? (
          connectedSystems.map((system) => (
            <div 
              key={system.name}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              data-testid={`erp-system-${system.name}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 ${getSystemColor(system.name)} rounded-lg flex items-center justify-center`}>
                  <i className={`${getSystemIcon(system.name)} text-white text-sm`}></i>
                </div>
                <div>
                  <p className="font-medium">{system.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    Last sync: {system.lastSync ? "2 min ago" : "Never"}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-chart-2 rounded-full animate-pulse-dot"></div>
                <span className="text-sm text-chart-2">Active</span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <i className="fas fa-plug text-4xl text-muted-foreground mb-4"></i>
            <p className="text-muted-foreground">No ERP systems connected</p>
            <p className="text-sm text-muted-foreground">Connect your first ERP system to see status updates</p>
          </div>
        )}
      </div>
    </div>
  );
}
