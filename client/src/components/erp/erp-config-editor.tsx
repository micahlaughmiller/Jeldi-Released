import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, AlertCircle, CheckCircle2, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";

interface ERPSystem {
  name: string;
  displayName: string;
  description: string;
  apiBaseUrl: string;
}

interface ERPConnection {
  id: string;
  erpSystem: string;
  isConnected: boolean;
  connectionType?: string;
  authMethod?: string;
  lastSync?: Date | string;
  instanceUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
}

interface ERPConfigEditorProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

export default function ERPConfigEditor({ isOpen, onClose, connectionId }: ERPConfigEditorProps) {
  const { toast } = useToast();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");

  const { data: connection, isLoading } = useQuery<ERPConnection>({
    queryKey: ["/api/erp/connections", connectionId],
    enabled: isOpen && !!connectionId,
  });

  const { data: systems = [] } = useQuery<ERPSystem[]>({
    queryKey: ["/api/erp/systems"],
    enabled: isOpen,
  });

  const system = systems.find((s: ERPSystem) => s.name === connection?.erpSystem);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", `/api/erp/config/${connectionId}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration updated",
        description: "ERP connection settings have been saved successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/erp/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/erp/connections"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/erp/disconnect/${connection?.erpSystem}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "ERP disconnected",
        description: "System has been disconnected successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/erp/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/erp/connections"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Disconnect failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/erp/test-connection", {
        erpSystem: connection?.erpSystem,
        apiBaseUrl: instanceUrl || connection?.instanceUrl || system?.apiBaseUrl,
        authMethod: connection?.authMethod || "oauth",
        apiKey: apiKey || connection?.apiKey,
        apiSecret: apiSecret || connection?.apiSecret,
        accessToken: connection?.accessToken
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Connection successful",
          description: "ERP system is responding correctly"
        });
      } else {
        toast({
          title: "Connection test failed",
          description: data.message,
          variant: "destructive"
        });
      }
    }
  });

  const handleUpdateCredentials = () => {
    const updates: any = {};
    
    if (apiKey) updates.apiKey = apiKey;
    if (apiSecret) updates.apiSecret = apiSecret;
    if (instanceUrl) updates.instanceUrl = instanceUrl;
    
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  const getConnectionTypeLabel = (type?: string) => {
    switch (type) {
      case "oauth": return "OAuth";
      case "api_key": return "API Key";
      case "custom": return "Custom";
      default: return "Unknown";
    }
  };

  const getStatusColor = (isConnected?: boolean) => {
    return isConnected ? "bg-green-500" : "bg-red-500";
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl" data-testid="dialog-erp-config-editor">
          <DialogHeader>
            <DialogTitle>ERP Configuration</DialogTitle>
            <DialogDescription>
              Manage settings for {system?.displayName || connection?.erpSystem}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="credentials" data-testid="tab-credentials">Credentials</TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">System Name</Label>
                    <p className="font-medium">{system?.displayName || connection?.erpSystem}</p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Connection Type</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {getConnectionTypeLabel(connection?.connectionType)}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(connection?.isConnected)}`}></div>
                      <span className="text-sm">
                        {connection?.isConnected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Sync</Label>
                    <p className="text-sm">
                      {connection?.lastSync 
                        ? new Date(connection.lastSync).toLocaleString()
                        : "Never"
                      }
                    </p>
                  </div>

                  {connection?.instanceUrl && (
                    <div>
                      <Label className="text-xs text-muted-foreground">API Endpoint</Label>
                      <p className="text-sm font-mono text-xs break-all">
                        {connection.instanceUrl}
                      </p>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs text-muted-foreground">Auth Method</Label>
                    <p className="text-sm capitalize">
                      {connection?.authMethod?.replace('_', ' ') || "OAuth"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  data-testid="button-test-connection"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Test Connection
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => setShowDisconnectDialog(true)}
                  data-testid="button-disconnect"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="credentials" className="space-y-4">
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Update credentials only if you need to change your API keys or tokens. 
                  Leave fields empty to keep existing values.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                {connection?.connectionType !== "oauth" && (
                  <>
                    <div>
                      <Label htmlFor="edit-api-key">API Key</Label>
                      <Input
                        id="edit-api-key"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter new API key"
                        data-testid="input-edit-api-key"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Current: {connection?.apiKey ? "••••••••" : "Not set"}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="edit-api-secret">API Secret</Label>
                      <Input
                        id="edit-api-secret"
                        type="password"
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        placeholder="Enter new API secret"
                        data-testid="input-edit-api-secret"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Current: {connection?.apiSecret ? "••••••••" : "Not set"}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="edit-instance-url">Instance URL</Label>
                      <Input
                        id="edit-instance-url"
                        value={instanceUrl}
                        onChange={(e) => setInstanceUrl(e.target.value)}
                        placeholder={connection?.instanceUrl || system?.apiBaseUrl}
                        data-testid="input-edit-instance-url"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Current: {connection?.instanceUrl || "Using default"}
                      </p>
                    </div>

                    <Button
                      onClick={handleUpdateCredentials}
                      disabled={updateMutation.isPending || (!apiKey && !apiSecret && !instanceUrl)}
                      data-testid="button-update-credentials"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Update Credentials
                    </Button>
                  </>
                )}

                {connection?.connectionType === "oauth" && (
                  <Alert>
                    <AlertDescription>
                      This connection uses OAuth. To update credentials, you'll need to 
                      re-authorize through the OAuth flow.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Data Synchronization</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure how often data is synchronized from this ERP system
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Auto Sync</p>
                      <p className="text-xs text-muted-foreground">
                        Automatically sync data in the background
                      </p>
                    </div>
                    <Badge variant="secondary">Enabled</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Sync Interval</p>
                      <p className="text-xs text-muted-foreground">
                        How often to fetch new data
                      </p>
                    </div>
                    <span className="text-sm">Every 5 minutes</span>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Data Scope</p>
                      <p className="text-xs text-muted-foreground">
                        What data to synchronize
                      </p>
                    </div>
                    <span className="text-sm">All modules</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Advanced Options</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Debug Mode</p>
                      <p className="text-xs text-muted-foreground">
                        Log detailed connection information
                      </p>
                    </div>
                    <Badge variant="outline">Disabled</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Retry on Failure</p>
                      <p className="text-xs text-muted-foreground">
                        Automatically retry failed requests
                      </p>
                    </div>
                    <Badge variant="secondary">Enabled</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent data-testid="alert-disconnect-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect ERP System?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect {system?.displayName || connection?.erpSystem} from your account.
              You can reconnect it later, but you'll need to re-authorize access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-disconnect">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-disconnect"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
