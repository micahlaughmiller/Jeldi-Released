import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import KPIWidget from "@/components/dashboard/kpi-widget";
import RevenueChart from "@/components/dashboard/revenue-chart";
import ERPStatus from "@/components/dashboard/erp-status";
import ChatInterface from "@/components/dashboard/chat-interface";
import EmailComposer from "@/components/modals/email-composer";
import ERPConnections from "@/components/modals/erp-connections";
import { useRealtimeData } from "@/hooks/use-realtime-data";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  
  // Real-time data hook
  const { kpiData, erpSystems, connectionStatus } = useRealtimeData();

  // Fetch KPIs
  const { data: kpis = [] } = useQuery<KPIConfig[]>({
    queryKey: ["/api/kpis"],
    enabled: !!user,
  });

  // Fetch ERP systems
  const { data: systems = [], refetch: refetchSystems } = useQuery<ERPSystem[]>({
    queryKey: ["/api/erp/systems"],
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

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setLocation("/login");
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
          onEmailClick={() => setIsEmailModalOpen(true)}
        />
        
        <div className="flex-1 overflow-auto">
          {/* KPI Dashboard */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
              {kpis.slice(0, 5).map((kpi: KPIConfig, index: number) => (
                <KPIWidget
                  key={kpi.id}
                  kpi={kpi}
                  data={kpiData[kpi.id]}
                  position={index}
                />
              ))}
              
              {/* Default KPIs if none configured */}
              {kpis.length === 0 && (
                <>
                  <KPIWidget
                    kpi={{
                      id: "default-revenue",
                      name: "Monthly Revenue",
                      type: "revenue",
                      position: 1
                    }}
                    data={{
                      value: "$2.45M",
                      change: 12.5,
                      timestamp: new Date()
                    }}
                    position={0}
                  />
                  <KPIWidget
                    kpi={{
                      id: "default-orders",
                      name: "Active Orders",
                      type: "orders",
                      position: 2
                    }}
                    data={{
                      value: "1,247",
                      change: 8.2,
                      timestamp: new Date()
                    }}
                    position={1}
                  />
                  <KPIWidget
                    kpi={{
                      id: "default-inventory",
                      name: "Inventory Fill Rate",
                      type: "inventory",
                      position: 3
                    }}
                    data={{
                      value: "89.2%",
                      change: -3.1,
                      timestamp: new Date()
                    }}
                    position={2}
                  />
                  <KPIWidget
                    kpi={{
                      id: "default-performance",
                      name: "System Performance",
                      type: "performance",
                      position: 4
                    }}
                    data={{
                      value: "94.8%",
                      change: 15.7,
                      timestamp: new Date()
                    }}
                    position={3}
                  />
                  <KPIWidget
                    kpi={{
                      id: "default-efficiency",
                      name: "Operational Efficiency",
                      type: "efficiency",
                      position: 5
                    }}
                    data={{
                      value: "87.3%",
                      change: 6.4,
                      timestamp: new Date()
                    }}
                    position={4}
                  />
                </>
              )}
            </div>

            {/* Detailed Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <RevenueChart data={kpiData} />
              <ERPStatus systems={erpSystems.length > 0 ? erpSystems : systems} />
            </div>
          </div>
        </div>

        <ChatInterface userId={user.id} />
      </main>

      <EmailComposer
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
      />

      <ERPConnections
        isOpen={isERPModalOpen}
        onClose={() => setIsERPModalOpen(false)}
        systems={systems}
      />
    </div>
  );
}
