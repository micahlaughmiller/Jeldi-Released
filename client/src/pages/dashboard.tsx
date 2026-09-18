import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import DraggableKPIGrid from "@/components/dashboard/draggable-kpi-grid";
import KPISelector from "@/components/modals/kpi-selector";
import DraggableChartGrid from "@/components/dashboard/draggable-chart-grid";
import ChartSelector from "@/components/modals/chart-selector";
import EmailComposer from "@/components/modals/email-composer";
import ERPConnectionsModal from "@/components/erp/erp-connections-modal";
import { useRealtimeData } from "@/hooks/use-realtime-data";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { performLogout } from "@/lib/logout";
import { getApiUrl } from "@/lib/api-config";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface ERPSystem {
  name: string;
  displayName: string;
  description: string;
  isConnected?: boolean;
  lastSync?: Date;
}

interface KPIConfig {
  id: string;
  name: string;
  type: string;
  position: number;
  latestData?: {
    value: string;
    change: number;
    timestamp: Date;
  };
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isERPModalOpen, setIsERPModalOpen] = useState(false);
  const [isKPISelectorOpen, setIsKPISelectorOpen] = useState(false);
  const [isChartSelectorOpen, setIsChartSelectorOpen] = useState(false);
  const { toast } = useToast();
  
  // Real-time data hook
  const { kpiData, erpSystems, connectionStatus } = useRealtimeData();

  // Fetch KPI Preferences
  const { data: kpiPreferencesData } = useQuery<{ preferences: any[]; defaults: string[] }>({
    queryKey: ["/api/dashboard/kpi-preferences"],
    enabled: !!user,
  });

  // Fetch Chart Preferences (backend auto-creates default if empty)
  const { data: chartPreferences = [] } = useQuery({
    queryKey: ["/api/dashboard/chart-preferences"],
    enabled: !!user,
  });

  // Fetch ERP systems
  const { data: systems = [], refetch: refetchSystems } = useQuery<ERPSystem[]>({
    queryKey: ["/api/erp/systems"],
    enabled: !!user,
  });

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("user");
      
      // Check if on demo.jeldi.app and no auth token
      const isDemoEnv = window.location.hostname.includes('demo.jeldi.app');
      
      if (!token || !userData) {
        // Auto-login for demo environment
        if (isDemoEnv) {
          try {
            const response = await fetch(getApiUrl('/api/auth/demo-login'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
              const data = await response.json();
              localStorage.setItem("token", data.token);
              localStorage.setItem("user", JSON.stringify(data.user));
              setUser(data.user);
              return;
            }
          } catch (error) {
            console.error('Demo auto-login failed:', error);
          }
        }
        
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
    };
    
    initAuth();
  }, [setLocation]);

  // Handle OAuth callback parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connectedSystem = urlParams.get('connected');
    const emailConnected = urlParams.get('email_connected');
    
    if (connectedSystem) {
      toast({
        title: "ERP System Connected",
        description: `Successfully connected to ${connectedSystem}!`,
      });
      
      // Refresh ERP systems data
      refetchSystems();
      queryClient.invalidateQueries({ queryKey: ["/api/erp/systems"] });
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (emailConnected) {
      toast({
        title: "Email Provider Connected",
        description: `Successfully connected to ${emailConnected}!`,
      });
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast, refetchSystems]);

  const handleLogout = async () => {
    await performLogout(setLocation, { showToast: true });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const connectedSystemsCount = systems.filter((s: ERPSystem) => s.isConnected).length;

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="dashboard-container">
      <Sidebar 
        user={user} 
        onLogout={handleLogout}
        onERPClick={() => setIsERPModalOpen(true)}
        connectedCount={connectedSystemsCount}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          connectedCount={connectedSystemsCount}
          connectionStatus={connectionStatus}
          onERPClick={() => setIsERPModalOpen(true)}
          onAccountClick={() => setLocation("/settings")}
        />
        
        <div className="flex-1 overflow-auto">
          {/* KPI Dashboard */}
          <div className="p-6 space-y-8">
            <DraggableKPIGrid
              preferences={kpiPreferencesData?.preferences || []}
              onCustomize={() => setIsKPISelectorOpen(true)}
            />

            {/* Charts Section */}
            <DraggableChartGrid
              preferences={chartPreferences as any[]}
              onAddChart={() => setIsChartSelectorOpen(true)}
            />
          </div>
        </div>
      </main>

      <EmailComposer
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
      />

      <ERPConnectionsModal
        isOpen={isERPModalOpen}
        onClose={() => setIsERPModalOpen(false)}
      />

      <KPISelector
        open={isKPISelectorOpen}
        onOpenChange={setIsKPISelectorOpen}
      />

      <ChartSelector
        isOpen={isChartSelectorOpen}
        onClose={() => setIsChartSelectorOpen(false)}
      />
    </div>
  );
}
