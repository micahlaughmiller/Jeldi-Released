import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SystemSettings {
  security: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSpecialChars: boolean;
    };
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
  };
  email: {
    fromAddress: string;
    smtpEnabled: boolean;
  };
  oauth: {
    googleEnabled: boolean;
    microsoftEnabled: boolean;
  };
  features: {
    erpIntegrations: boolean;
    aiAssistant: boolean;
    emailCenter: boolean;
    advancedAnalytics: boolean;
  };
  system: {
    maintenanceMode: boolean;
    debugMode: boolean;
    logLevel: string;
  };
}

export function AdminSettings() {
  const [activeTab, setActiveTab] = useState("security");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch system settings
  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['/api/admin/settings'],
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: ({ category, settings: newSettings }: { category: string; settings: any }) =>
      apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ category, settings: newSettings }),
      }),
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "System settings have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings.",
        variant: "destructive",
      });
    },
  });

  const handleSettingUpdate = (category: string, key: string, value: any) => {
    if (!settings) return;
    
    const newSettings = {
      ...settings[category as keyof SystemSettings],
      [key]: value,
    };
    
    updateSettingsMutation.mutate({ category, settings: newSettings });
  };

  const handleNestedSettingUpdate = (category: string, parentKey: string, key: string, value: any) => {
    if (!settings) return;
    
    const categorySettings = settings[category as keyof SystemSettings] as any;
    const newSettings = {
      ...categorySettings,
      [parentKey]: {
        ...categorySettings[parentKey],
        [key]: value,
      },
    };
    
    updateSettingsMutation.mutate({ category, settings: newSettings });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Settings</h2>
          <p className="text-muted-foreground">Configure global system settings and policies</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-export-settings">
            <i className="fas fa-download mr-2"></i>
            Export Config
          </Button>
          <Button variant="outline" data-testid="button-reset-settings">
            <i className="fas fa-undo mr-2"></i>
            Reset to Defaults
          </Button>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="security" data-testid="tab-security">
            <i className="fas fa-shield-alt mr-2"></i>
            Security
          </TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email">
            <i className="fas fa-envelope mr-2"></i>
            Email
          </TabsTrigger>
          <TabsTrigger value="oauth" data-testid="tab-oauth">
            <i className="fas fa-key mr-2"></i>
            OAuth
          </TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">
            <i className="fas fa-cogs mr-2"></i>
            Features
          </TabsTrigger>
          <TabsTrigger value="system" data-testid="tab-system">
            <i className="fas fa-server mr-2"></i>
            System
          </TabsTrigger>
        </TabsList>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password Policy</CardTitle>
              <CardDescription>
                Configure password requirements for user accounts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="minLength">Minimum Length</Label>
                  <Input
                    id="minLength"
                    type="number"
                    value={settings?.security.passwordPolicy.minLength || 8}
                    onChange={(e) => handleNestedSettingUpdate('security', 'passwordPolicy', 'minLength', parseInt(e.target.value))}
                    data-testid="input-min-password-length"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="requireUppercase">Require Uppercase</Label>
                    <Switch
                      id="requireUppercase"
                      checked={settings?.security.passwordPolicy.requireUppercase || false}
                      onCheckedChange={(checked) => handleNestedSettingUpdate('security', 'passwordPolicy', 'requireUppercase', checked)}
                      data-testid="switch-require-uppercase"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="requireLowercase">Require Lowercase</Label>
                    <Switch
                      id="requireLowercase"
                      checked={settings?.security.passwordPolicy.requireLowercase || false}
                      onCheckedChange={(checked) => handleNestedSettingUpdate('security', 'passwordPolicy', 'requireLowercase', checked)}
                      data-testid="switch-require-lowercase"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="requireNumbers">Require Numbers</Label>
                    <Switch
                      id="requireNumbers"
                      checked={settings?.security.passwordPolicy.requireNumbers || false}
                      onCheckedChange={(checked) => handleNestedSettingUpdate('security', 'passwordPolicy', 'requireNumbers', checked)}
                      data-testid="switch-require-numbers"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="requireSpecialChars">Require Special Characters</Label>
                    <Switch
                      id="requireSpecialChars"
                      checked={settings?.security.passwordPolicy.requireSpecialChars || false}
                      onCheckedChange={(checked) => handleNestedSettingUpdate('security', 'passwordPolicy', 'requireSpecialChars', checked)}
                      data-testid="switch-require-special-chars"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session & Authentication</CardTitle>
              <CardDescription>
                Configure session timeout and login security
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings?.security.sessionTimeout || 30}
                    onChange={(e) => handleNestedSettingUpdate('security', 'sessionTimeout', 'sessionTimeout', parseInt(e.target.value))}
                    data-testid="input-session-timeout"
                  />
                </div>
                <div>
                  <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={settings?.security.maxLoginAttempts || 5}
                    onChange={(e) => handleNestedSettingUpdate('security', 'maxLoginAttempts', 'maxLoginAttempts', parseInt(e.target.value))}
                    data-testid="input-max-login-attempts"
                  />
                </div>
                <div>
                  <Label htmlFor="lockoutDuration">Lockout Duration (minutes)</Label>
                  <Input
                    id="lockoutDuration"
                    type="number"
                    value={settings?.security.lockoutDuration || 15}
                    onChange={(e) => handleNestedSettingUpdate('security', 'lockoutDuration', 'lockoutDuration', parseInt(e.target.value))}
                    data-testid="input-lockout-duration"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Settings */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration</CardTitle>
              <CardDescription>
                Configure system email settings and SMTP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="fromAddress">From Email Address</Label>
                <Input
                  id="fromAddress"
                  type="email"
                  value={settings?.email.fromAddress || ""}
                  onChange={(e) => handleNestedSettingUpdate('email', 'fromAddress', 'fromAddress', e.target.value)}
                  placeholder="noreply@jeldi.com"
                  data-testid="input-from-email"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="smtpEnabled">SMTP Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable SMTP for sending system emails
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="smtpEnabled"
                    checked={settings?.email.smtpEnabled || false}
                    onCheckedChange={(checked) => handleNestedSettingUpdate('email', 'smtpEnabled', 'smtpEnabled', checked)}
                    data-testid="switch-smtp-enabled"
                  />
                  <Badge variant={settings?.email.smtpEnabled ? "default" : "secondary"}>
                    {settings?.email.smtpEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OAuth Settings */}
        <TabsContent value="oauth" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>OAuth Providers</CardTitle>
              <CardDescription>
                Configure external authentication providers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <i className="fab fa-google text-2xl text-red-500"></i>
                    <div>
                      <h4 className="font-medium">Google OAuth</h4>
                      <p className="text-sm text-muted-foreground">
                        Allow users to sign in with Google
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={settings?.oauth.googleEnabled ? "default" : "secondary"}
                      data-testid="badge-google-oauth"
                    >
                      {settings?.oauth.googleEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Switch
                      checked={settings?.oauth.googleEnabled || false}
                      onCheckedChange={(checked) => handleNestedSettingUpdate('oauth', 'googleEnabled', 'googleEnabled', checked)}
                      data-testid="switch-google-oauth"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <i className="fab fa-microsoft text-2xl text-primary"></i>
                    <div>
                      <h4 className="font-medium">Microsoft OAuth</h4>
                      <p className="text-sm text-muted-foreground">
                        Allow users to sign in with Microsoft
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={settings?.oauth.microsoftEnabled ? "default" : "secondary"}
                      data-testid="badge-microsoft-oauth"
                    >
                      {settings?.oauth.microsoftEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Switch
                      checked={settings?.oauth.microsoftEnabled || false}
                      onCheckedChange={(checked) => handleNestedSettingUpdate('oauth', 'microsoftEnabled', 'microsoftEnabled', checked)}
                      data-testid="switch-microsoft-oauth"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Settings */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Toggles</CardTitle>
              <CardDescription>
                Enable or disable system features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="erpIntegrations">ERP Integrations</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable ERP system connections and data sync
                    </p>
                  </div>
                  <Switch
                    id="erpIntegrations"
                    checked={settings?.features.erpIntegrations || false}
                    onCheckedChange={(checked) => handleNestedSettingUpdate('features', 'erpIntegrations', 'erpIntegrations', checked)}
                    data-testid="switch-erp-integrations"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="aiAssistant">AI Assistant</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable AI-powered business intelligence assistant
                    </p>
                  </div>
                  <Switch
                    id="aiAssistant"
                    checked={settings?.features.aiAssistant || false}
                    onCheckedChange={(checked) => handleNestedSettingUpdate('features', 'aiAssistant', 'aiAssistant', checked)}
                    data-testid="switch-ai-assistant"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="emailCenter">Email Center</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable email composition and management features
                    </p>
                  </div>
                  <Switch
                    id="emailCenter"
                    checked={settings?.features.emailCenter || false}
                    onCheckedChange={(checked) => handleNestedSettingUpdate('features', 'emailCenter', 'emailCenter', checked)}
                    data-testid="switch-email-center"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="advancedAnalytics">Advanced Analytics</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable detailed analytics and reporting features
                    </p>
                  </div>
                  <Switch
                    id="advancedAnalytics"
                    checked={settings?.features.advancedAnalytics || false}
                    onCheckedChange={(checked) => handleNestedSettingUpdate('features', 'advancedAnalytics', 'advancedAnalytics', checked)}
                    data-testid="switch-advanced-analytics"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Settings */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                Configure system-level settings and maintenance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="maintenanceMode">Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable maintenance mode to restrict user access
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="maintenanceMode"
                      checked={settings?.system.maintenanceMode || false}
                      onCheckedChange={(checked) => handleNestedSettingUpdate('system', 'maintenanceMode', 'maintenanceMode', checked)}
                      data-testid="switch-maintenance-mode"
                    />
                    <Badge variant={settings?.system.maintenanceMode ? "destructive" : "default"}>
                      {settings?.system.maintenanceMode ? "Maintenance" : "Operational"}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="debugMode">Debug Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable debug logging and development features
                    </p>
                  </div>
                  <Switch
                    id="debugMode"
                    checked={settings?.system.debugMode || false}
                    onCheckedChange={(checked) => handleNestedSettingUpdate('system', 'debugMode', 'debugMode', checked)}
                    data-testid="switch-debug-mode"
                  />
                </div>

                <div>
                  <Label htmlFor="logLevel">Log Level</Label>
                  <Select
                    value={settings?.system.logLevel || "info"}
                    onValueChange={(value) => handleNestedSettingUpdate('system', 'logLevel', 'logLevel', value)}
                  >
                    <SelectTrigger data-testid="select-log-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warn">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="trace">Trace</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <i className="fas fa-exclamation-triangle"></i>
                  <span className="font-medium">Dangerous Actions</span>
                </div>
                <div className="space-y-2">
                  <Button variant="destructive" size="sm" disabled data-testid="button-reset-database">
                    <i className="fas fa-database mr-2"></i>
                    Reset Database
                  </Button>
                  <Button variant="destructive" size="sm" disabled data-testid="button-clear-audit-logs">
                    <i className="fas fa-trash mr-2"></i>
                    Clear Audit Logs
                  </Button>
                  <Button variant="destructive" size="sm" disabled data-testid="button-factory-reset">
                    <i className="fas fa-undo mr-2"></i>
                    Factory Reset
                  </Button>
                </div>
                <p className="text-sm text-red-700">
                  These actions are currently disabled for safety. Contact support to enable them.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}