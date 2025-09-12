import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import EmailComposer from "@/components/modals/email-composer";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import type { User, EmailStatusResponse, EmailConnectResponse } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function EmailCenter() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch email status from API
  const { data: emailStatus, isLoading, refetch } = useQuery<EmailStatusResponse>({
    queryKey: ['/api/email/status'],
    enabled: !!user,
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    
    if (!token || !userData) {
      setLocation("/login");
      return;
    }

    try {
      setUser(JSON.parse(userData));
    } catch (error) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setLocation("/login");
    }
  }, [setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setLocation("/login");
  };

  const connectProviderMutation = useMutation<EmailConnectResponse, Error, 'gmail' | 'outlook'>({
    mutationFn: async (provider: 'gmail' | 'outlook') => {
      const response = await apiRequest("POST", `/api/email/connect/${provider}`, {});
      return response.json();
    },
    onSuccess: (data, provider) => {
      if (data.authUrl) {
        // Open OAuth URL in new window
        window.open(data.authUrl, "_blank");
        
        toast({
          title: "OAuth Started",
          description: `Please complete the ${provider} authentication in the new window`,
        });
      } else if (data.isConnected) {
        toast({
          title: "Already Connected",
          description: data.message || `${provider} is already connected`,
        });
        // Refresh the status
        refetch();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect email provider",
        variant: "destructive",
      });
    },
  });

  const handleConnectProvider = (provider: 'gmail' | 'outlook') => {
    connectProviderMutation.mutate(provider);
  };

  // Listen for OAuth callback success
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'email_oauth_success') {
        toast({
          title: "Email Connected",
          description: `${event.data.provider} has been connected successfully`,
        });
        refetch(); // Refresh status
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [toast, refetch]);

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
          <p className="text-muted-foreground">Loading email center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="email-center-container">
      <Sidebar 
        user={user} 
        onLogout={handleLogout}
        onERPClick={() => {}}
        connectedCount={0}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          connectedCount={0}
          connectionStatus="disconnected"
          onEmailClick={() => setIsComposerOpen(true)}
        />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-email-center">Email Center</h1>
              <p className="text-muted-foreground">
                Connect your email providers and manage business communications
              </p>
            </div>

            {/* Provider Connections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">Gmail</CardTitle>
                  <Badge variant={emailStatus?.gmail?.isConnected ? "default" : "secondary"}>
                    {emailStatus?.gmail?.isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Connect your Gmail account to send emails directly from the platform
                  </p>
                  {emailStatus?.gmail?.email && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Connected as: {emailStatus.gmail.email}
                    </p>
                  )}
                  <Button 
                    onClick={() => handleConnectProvider('gmail')}
                    disabled={emailStatus?.gmail?.isConnected || connectProviderMutation.isPending}
                    data-testid="button-connect-gmail"
                  >
                    <i className="fab fa-google mr-2"></i>
                    {connectProviderMutation.isPending ? "Connecting..." : 
                     emailStatus?.gmail?.isConnected ? "Connected" : "Connect Gmail"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">Outlook</CardTitle>
                  <Badge variant={emailStatus?.outlook?.isConnected ? "default" : "secondary"}>
                    {emailStatus?.outlook?.isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Connect your Outlook account to send emails directly from the platform
                  </p>
                  {emailStatus?.outlook?.email && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Connected as: {emailStatus.outlook.email}
                    </p>
                  )}
                  <Button 
                    onClick={() => handleConnectProvider('outlook')}
                    disabled={emailStatus?.outlook?.isConnected || connectProviderMutation.isPending}
                    data-testid="button-connect-outlook"
                  >
                    <i className="fab fa-microsoft mr-2"></i>
                    {connectProviderMutation.isPending ? "Connecting..." : 
                     emailStatus?.outlook?.isConnected ? "Connected" : "Connect Outlook"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Quick Compose */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <i className="fas fa-edit"></i>
                  <span>Quick Compose</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Compose and send emails using your connected email providers
                  </p>
                  
                  <div className="flex items-center space-x-4">
                    <Button 
                      onClick={() => setIsComposerOpen(true)}
                      data-testid="button-compose-email"
                    >
                      <i className="fas fa-paper-plane mr-2"></i>
                      Compose Email
                    </Button>
                    
                    <Button variant="outline" data-testid="button-email-templates">
                      <i className="fas fa-file-alt mr-2"></i>
                      Use Template
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Templates Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <i className="fas fa-file-alt"></i>
                  <span>Email Templates</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer" data-testid="template-business">
                    <h3 className="font-medium">Business Communication</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Professional business emails and updates
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer" data-testid="template-project">
                    <h3 className="font-medium">Project Updates</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Status reports and project communications
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer" data-testid="template-meeting">
                    <h3 className="font-medium">Meeting Invitations</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Schedule and invite participants to meetings
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Email Composer Modal */}
      <EmailComposer 
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
      />
    </div>
  );
}