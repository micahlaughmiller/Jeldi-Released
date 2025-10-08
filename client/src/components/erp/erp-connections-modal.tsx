import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import ConnectionWizard from "./connection-wizard";
import ERPConfigEditor from "./erp-config-editor";

interface ERPSystem {
  name: string;
  displayName: string;
  description: string;
  isConnected?: boolean;
  lastSync?: Date;
  supportsApiKey?: boolean;
  supportsManualConfig?: boolean;
}

interface ERPConnection {
  id: string;
  erpSystem: string;
  isConnected: boolean;
  lastSync?: Date;
  connectionType?: string;
}

interface ERPConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ERPConnectionsModal({ isOpen, onClose }: ERPConnectionsModalProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedERP, setSelectedERP] = useState<string | null>(null);
  const [configEditorOpen, setConfigEditorOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const { data: systems = [], isLoading } = useQuery<ERPSystem[]>({
    queryKey: ["/api/erp/systems"],
    enabled: isOpen,
  });

  const { data: connections = [] } = useQuery<ERPConnection[]>({
    queryKey: ["/api/erp/connections"],
    enabled: isOpen,
  });

  const connectedSystems = systems.filter(s => s.isConnected);
  const availableSystems = systems.filter(s => !s.isConnected);

  const filteredAvailable = availableSystems.filter(system =>
    system.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    system.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSystemIcon = (name: string) => {
    const icons: Record<string, string> = {
      sap: "database",
      netsuite: "cloud",
      dynamics365: "windows",
      oracle_fusion: "building",
      workday: "users",
      ifs: "tools",
      epicor: "industry",
      infor: "chart-network",
      acumatica: "cube",
      sage: "calculator",
      syteline: "cog"
    };
    return icons[name] || "database";
  };

  const getSystemColor = (name: string) => {
    const colors: Record<string, string> = {
      sap: "bg-blue-600",
      netsuite: "bg-red-600",
      dynamics365: "bg-blue-500",
      oracle_fusion: "bg-red-700",
      workday: "bg-yellow-600",
      ifs: "bg-green-600",
      epicor: "bg-gray-600",
      infor: "bg-purple-600",
      acumatica: "bg-teal-600",
      sage: "bg-orange-600",
      syteline: "bg-indigo-600"
    };
    return colors[name] || "bg-primary";
  };

  const handleConnect = (systemName: string) => {
    setSelectedERP(systemName);
    setWizardOpen(true);
  };

  const handleConfigure = (systemName: string) => {
    const connection = connections.find(c => c.erpSystem === systemName);
    if (connection) {
      setSelectedConnectionId(connection.id);
      setConfigEditorOpen(true);
    }
  };

  const handleAddCustom = () => {
    setSelectedERP(null);
    setWizardOpen(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden" data-testid="modal-erp-connections">
          <DialogHeader>
            <DialogTitle className="text-2xl">ERP System Connections</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[70vh]">
            {/* Left Column: Connected ERPs */}
            <div className="lg:col-span-1 border-r border-border pr-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Connected Systems</h3>
                <Badge variant="secondary" data-testid="badge-connected-count">
                  {connectedSystems.length}
                </Badge>
              </div>
              
              <div className="space-y-3 overflow-y-auto max-h-[calc(70vh-60px)]">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="border border-border rounded-lg p-3">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="w-10 h-10 rounded" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-24 mb-2" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : connectedSystems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No systems connected yet</p>
                    <p className="text-xs mt-1">Connect an ERP to get started</p>
                  </div>
                ) : (
                  connectedSystems.map((system) => (
                    <div
                      key={system.name}
                      className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                      data-testid={`connected-erp-${system.name}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <div className={`w-10 h-10 ${getSystemColor(system.name)} rounded flex items-center justify-center flex-shrink-0`}>
                            <i className={`fas fa-${getSystemIcon(system.name)} text-white text-sm`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate">{system.displayName}</h4>
                            <div className="flex items-center space-x-1 mt-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot"></div>
                              <span className="text-xs text-muted-foreground">Active</span>
                            </div>
                            {system.lastSync && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(system.lastSync).toLocaleTimeString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleConfigure(system.name)}
                          data-testid={`button-configure-${system.name}`}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Available ERPs */}
            <div className="lg:col-span-2">
              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Available Systems</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustom}
                    data-testid="button-add-custom-erp"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Custom ERP
                  </Button>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search ERP systems..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-erp"
                  />
                </div>
              </div>

              <div className="overflow-y-auto max-h-[calc(70vh-120px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="border border-border rounded-lg p-4">
                        <div className="flex items-center space-x-3 mb-3">
                          <Skeleton className="w-12 h-12 rounded" />
                          <div className="flex-1">
                            <Skeleton className="h-4 w-24 mb-2" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </div>
                        <Skeleton className="h-9 w-full" />
                      </div>
                    ))
                  ) : filteredAvailable.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-muted-foreground">
                      <p className="text-sm">No systems found</p>
                      <p className="text-xs mt-1">Try adjusting your search</p>
                    </div>
                  ) : (
                    filteredAvailable.map((system) => (
                      <div
                        key={system.name}
                        className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
                        data-testid={`card-erp-${system.name}`}
                      >
                        <div className="flex items-center space-x-3 mb-3">
                          <div className={`w-12 h-12 ${getSystemColor(system.name)} rounded flex items-center justify-center`}>
                            <i className={`fas fa-${getSystemIcon(system.name)} text-white`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm truncate">{system.displayName}</h4>
                            <p className="text-xs text-muted-foreground truncate">{system.description}</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-1 mb-3">
                          {system.supportsApiKey && (
                            <Badge variant="outline" className="text-xs">API Key</Badge>
                          )}
                          {system.supportsManualConfig && (
                            <Badge variant="outline" className="text-xs">Custom</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">OAuth</Badge>
                        </div>

                        <Button
                          className="w-full"
                          size="sm"
                          onClick={() => handleConnect(system.name)}
                          data-testid={`button-connect-${system.name}`}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Connect
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {wizardOpen && (
        <ConnectionWizard
          isOpen={wizardOpen}
          onClose={() => {
            setWizardOpen(false);
            setSelectedERP(null);
          }}
          erpSystem={selectedERP}
        />
      )}

      {configEditorOpen && selectedConnectionId && (
        <ERPConfigEditor
          isOpen={configEditorOpen}
          onClose={() => {
            setConfigEditorOpen(false);
            setSelectedConnectionId(null);
          }}
          connectionId={selectedConnectionId}
        />
      )}
    </>
  );
}
