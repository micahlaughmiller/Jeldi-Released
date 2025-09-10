import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ERPSystem {
  name: string;
  displayName: string;
  description: string;
  isConnected?: boolean;
  lastSync?: Date;
}

interface ERPConnectionsProps {
  isOpen: boolean;
  onClose: () => void;
  systems: ERPSystem[];
}

export default function ERPConnections({ isOpen, onClose, systems }: ERPConnectionsProps) {
  const { toast } = useToast();

  const handleConnect = async (systemName: string) => {
    try {
      const response = await apiRequest("POST", `/api/erp/connect/${systemName}`, {});
      const data = await response.json();
      
      // Redirect to OAuth URL
      window.location.href = data.authUrl;
    } catch (error) {
      toast({
        title: "Connection failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const getSystemIcon = (name: string) => {
    switch (name) {
      case "sap": return "fas fa-database";
      case "netsuite": return "fas fa-cloud";
      case "dynamics365": return "fas fa-windows";
      case "oracle_fusion": return "fas fa-building";
      case "workday": return "fas fa-users";
      case "ifs": return "fas fa-tools";
      case "epicor": return "fas fa-industry";
      case "infor": return "fas fa-chart-network";
      case "acumatica": return "fas fa-cube";
      case "sage": return "fas fa-calculator";
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
      case "epicor": return "bg-gray-600";
      case "infor": return "bg-purple-600";
      case "acumatica": return "bg-teal-600";
      case "sage": return "bg-orange-600";
      default: return "bg-primary";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto" data-testid="erp-connections-modal">
        <DialogHeader>
          <DialogTitle>ERP System Connections</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {systems.map((system) => (
            <div 
              key={system.name}
              className="border border-border rounded-lg p-4 hover:shadow-lg transition-shadow"
              data-testid={`erp-card-${system.name}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 ${getSystemColor(system.name)} rounded-lg flex items-center justify-center`}>
                    <i className={`${getSystemIcon(system.name)} text-white`}></i>
                  </div>
                  <div>
                    <h4 className="font-semibold">{system.displayName}</h4>
                    <p className="text-xs text-muted-foreground">
                      {system.name === "sap" ? "Enterprise ERP" :
                       system.name === "netsuite" ? "Cloud ERP Leader" :
                       system.name === "dynamics365" ? "Integrated Business Apps" :
                       "ERP Solution"}
                    </p>
                  </div>
                </div>
                {system.isConnected && (
                  <div className="w-2 h-2 bg-chart-2 rounded-full animate-pulse-dot"></div>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-4">{system.description}</p>
              
              {system.isConnected ? (
                <Button 
                  className="w-full" 
                  variant="outline" 
                  disabled
                  data-testid={`button-connected-${system.name}`}
                >
                  <i className="fas fa-check mr-2"></i>
                  Connected
                </Button>
              ) : (
                <Button 
                  className="w-full" 
                  onClick={() => handleConnect(system.name)}
                  data-testid={`button-connect-${system.name}`}
                >
                  <i className="fas fa-plus mr-2"></i>
                  Connect
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
