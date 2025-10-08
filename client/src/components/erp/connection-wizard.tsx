import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";

interface ERPSystem {
  name: string;
  displayName: string;
  description: string;
  apiBaseUrl: string;
  supportsApiKey?: boolean;
  supportsManualConfig?: boolean;
}

interface ConnectionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  erpSystem: string | null;
}

type ConnectionMethod = "oauth" | "api_key" | "custom";
type AuthMethod = "oauth" | "api_key" | "basic_auth" | "bearer_token";

export default function ConnectionWizard({ isOpen, onClose, erpSystem }: ConnectionWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>("oauth");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("api_key");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [formData, setFormData] = useState({
    apiKey: "",
    apiSecret: "",
    instanceUrl: "",
    customName: "",
    apiBaseUrl: ""
  });

  const { data: connectionMethods } = useQuery({
    queryKey: ["/api/erp/connection-methods", erpSystem],
    enabled: isOpen && !!erpSystem,
  });

  const { data: systems = [] } = useQuery({
    queryKey: ["/api/erp/systems"],
    enabled: isOpen,
  });

  const system = (systems as ERPSystem[]).find((s: ERPSystem) => s.name === erpSystem);

  const testConnectionMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/erp/test-connection", data);
      return response.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
    },
    onError: (error: any) => {
      setTestResult({
        success: false,
        message: error.message || "Connection test failed"
      });
    }
  });

  const connectMutation = useMutation({
    mutationFn: async (data: any) => {
      let endpoint = "";
      let payload = {};

      if (connectionMethod === "oauth" && erpSystem) {
        const response = await apiRequest("POST", `/api/erp/connect/${erpSystem}`, {});
        const authData = await response.json();
        window.location.href = authData.authUrl;
        return;
      } else if (connectionMethod === "api_key" && erpSystem) {
        endpoint = "/api/erp/connect-api-key";
        payload = {
          erpSystem,
          apiKey: formData.apiKey,
          apiSecret: formData.apiSecret,
          instanceUrl: formData.instanceUrl
        };
      } else if (connectionMethod === "custom") {
        endpoint = "/api/erp/connect-custom";
        payload = {
          customName: formData.customName,
          apiBaseUrl: formData.apiBaseUrl,
          authMethod,
          credentials: {
            apiKey: formData.apiKey,
            apiSecret: formData.apiSecret
          }
        };
      }

      const response = await apiRequest("POST", endpoint, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/erp/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/erp/connections"] });
      setStep(3);
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleTestConnection = () => {
    const testData: any = {
      apiBaseUrl: formData.instanceUrl || system?.apiBaseUrl || formData.apiBaseUrl,
      authMethod: connectionMethod === "custom" ? authMethod : "api_key",
      apiKey: formData.apiKey,
      apiSecret: formData.apiSecret
    };

    if (erpSystem) {
      testData.erpSystem = erpSystem;
    }

    testConnectionMutation.mutate(testData);
  };

  const handleNext = () => {
    if (step === 2 && connectionMethod !== "oauth") {
      handleTestConnection();
    } else {
      setStep(step + 1);
    }
  };

  const handleConnect = () => {
    connectMutation.mutate({});
  };

  const resetWizard = () => {
    setStep(1);
    setConnectionMethod("oauth");
    setAuthMethod("api_key");
    setFormData({
      apiKey: "",
      apiSecret: "",
      instanceUrl: "",
      customName: "",
      apiBaseUrl: ""
    });
    setTestResult(null);
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Choose Connection Method</h3>
        <p className="text-sm text-muted-foreground">
          Select how you want to connect to {system?.displayName || "your ERP system"}
        </p>
      </div>

      <RadioGroup value={connectionMethod} onValueChange={(v) => setConnectionMethod(v as ConnectionMethod)}>
        {(!erpSystem || connectionMethods?.oauth) && (
          <div className="flex items-start space-x-3 border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="oauth" id="oauth" data-testid="radio-oauth" />
            <div className="flex-1">
              <Label htmlFor="oauth" className="font-semibold cursor-pointer">
                OAuth (Recommended)
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Secure automatic authorization through {system?.displayName || "the ERP provider"}
              </p>
              <Badge variant="secondary" className="mt-2">Most Secure</Badge>
            </div>
          </div>
        )}

        {(!erpSystem || connectionMethods?.apiKey || system?.supportsApiKey) && (
          <div className="flex items-start space-x-3 border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="api_key" id="api_key" data-testid="radio-api-key" />
            <div className="flex-1">
              <Label htmlFor="api_key" className="font-semibold cursor-pointer">
                API Credentials
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Connect using API key and secret from your ERP system
              </p>
              <Badge variant="outline" className="mt-2">Manual Setup</Badge>
            </div>
          </div>
        )}

        {!erpSystem && (
          <div className="flex items-start space-x-3 border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="custom" id="custom" data-testid="radio-custom" />
            <div className="flex-1">
              <Label htmlFor="custom" className="font-semibold cursor-pointer">
                Custom Configuration
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Add a custom ERP system with your own endpoint and credentials
              </p>
              <Badge variant="outline" className="mt-2">Advanced</Badge>
            </div>
          </div>
        )}
      </RadioGroup>
    </div>
  );

  const renderStep2OAuth = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">OAuth Authorization</h3>
        <p className="text-sm text-muted-foreground">
          You'll be redirected to {system?.displayName} to authorize access
        </p>
      </div>

      <Alert>
        <AlertDescription>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Click "Authorize" to open {system?.displayName} login page</li>
            <li>Sign in with your {system?.displayName} credentials</li>
            <li>Grant permission for this application to access your data</li>
            <li>You'll be redirected back here automatically</li>
          </ol>
        </AlertDescription>
      </Alert>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium text-sm mb-2">What we'll access:</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Read business data and reports</li>
          <li>• Access financial information</li>
          <li>• View operational metrics</li>
        </ul>
      </div>
    </div>
  );

  const renderStep2ApiKey = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">API Credentials</h3>
        <p className="text-sm text-muted-foreground">
          Enter your {system?.displayName} API credentials
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="apiKey">API Key *</Label>
          <Input
            id="apiKey"
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="Enter your API key"
            data-testid="input-api-key"
          />
        </div>

        <div>
          <Label htmlFor="apiSecret">API Secret</Label>
          <Input
            id="apiSecret"
            type="password"
            value={formData.apiSecret}
            onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
            placeholder="Enter your API secret (optional)"
            data-testid="input-api-secret"
          />
        </div>

        <div>
          <Label htmlFor="instanceUrl">Instance URL</Label>
          <Input
            id="instanceUrl"
            value={formData.instanceUrl}
            onChange={(e) => setFormData({ ...formData, instanceUrl: e.target.value })}
            placeholder={system?.apiBaseUrl || "https://api.example.com"}
            data-testid="input-instance-url"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Optional: Override default API endpoint
          </p>
        </div>
      </div>

      {testResult && (
        <Alert variant={testResult.success ? "default" : "destructive"}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
          </div>
        </Alert>
      )}
    </div>
  );

  const renderStep2Custom = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Custom ERP Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Configure a custom ERP system connection
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="customName">System Name *</Label>
          <Input
            id="customName"
            value={formData.customName}
            onChange={(e) => setFormData({ ...formData, customName: e.target.value })}
            placeholder="e.g., My Custom ERP"
            data-testid="input-custom-name"
          />
        </div>

        <div>
          <Label htmlFor="apiBaseUrl">API Base URL *</Label>
          <Input
            id="apiBaseUrl"
            value={formData.apiBaseUrl}
            onChange={(e) => setFormData({ ...formData, apiBaseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            data-testid="input-api-base-url"
          />
        </div>

        <div>
          <Label htmlFor="authMethod">Authentication Method *</Label>
          <Select value={authMethod} onValueChange={(v) => setAuthMethod(v as AuthMethod)}>
            <SelectTrigger data-testid="select-auth-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="api_key">API Key</SelectItem>
              <SelectItem value="basic_auth">Basic Auth</SelectItem>
              <SelectItem value="bearer_token">Bearer Token</SelectItem>
              <SelectItem value="oauth">OAuth</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(authMethod === "api_key" || authMethod === "basic_auth") && (
          <>
            <div>
              <Label htmlFor="apiKey">
                {authMethod === "basic_auth" ? "Username" : "API Key"} *
              </Label>
              <Input
                id="apiKey"
                type={authMethod === "basic_auth" ? "text" : "password"}
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                data-testid="input-api-key"
              />
            </div>

            <div>
              <Label htmlFor="apiSecret">
                {authMethod === "basic_auth" ? "Password" : "API Secret"}
              </Label>
              <Input
                id="apiSecret"
                type="password"
                value={formData.apiSecret}
                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                data-testid="input-api-secret"
              />
            </div>
          </>
        )}
      </div>

      {testResult && (
        <Alert variant={testResult.success ? "default" : "destructive"}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
          </div>
        </Alert>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2">Connection Successful!</h3>
        <p className="text-sm text-muted-foreground">
          {system?.displayName || formData.customName} has been connected successfully
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 text-left">
        <h4 className="font-medium text-sm mb-3">Connection Details:</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">System:</span>
            <span className="font-medium">{system?.displayName || formData.customName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Method:</span>
            <span className="font-medium capitalize">{connectionMethod.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant="default" className="bg-green-500">Active</Badge>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Data synchronization will begin automatically
      </p>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="dialog-connection-wizard">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Connect ERP System"}
            {step === 2 && "Configure Connection"}
            {step === 3 && "Setup Complete"}
          </DialogTitle>
          <DialogDescription>
            {system && `Connecting to ${system.displayName}`}
            {!system && erpSystem === null && "Add a custom ERP system"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                1
              </div>
              <div className={`w-12 h-0.5 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                2
              </div>
              <div className={`w-12 h-0.5 ${step >= 3 ? 'bg-primary' : 'bg-muted'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                3
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="min-h-[300px]">
            {step === 1 && renderStep1()}
            {step === 2 && connectionMethod === "oauth" && renderStep2OAuth()}
            {step === 2 && connectionMethod === "api_key" && renderStep2ApiKey()}
            {step === 2 && connectionMethod === "custom" && renderStep2Custom()}
            {step === 3 && renderStep3()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : handleClose()}
            disabled={connectMutation.isPending || step === 3}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          <div className="flex gap-2">
            {step < 3 && (
              <>
                {step === 2 && connectionMethod !== "oauth" && (
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testConnectionMutation.isPending || !formData.apiKey || (connectionMethod === "custom" && !formData.customName)}
                    data-testid="button-test-connection"
                  >
                    {testConnectionMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Test Connection
                  </Button>
                )}
                
                {step === 1 || (step === 2 && connectionMethod === "oauth") ? (
                  <Button onClick={step === 1 ? handleNext : handleConnect} data-testid="button-next">
                    {step === 2 ? "Authorize" : "Next"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnect}
                    disabled={!testResult?.success || connectMutation.isPending}
                    data-testid="button-connect"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Connect
                  </Button>
                )}
              </>
            )}
            
            {step === 3 && (
              <Button onClick={handleClose} data-testid="button-done">
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
