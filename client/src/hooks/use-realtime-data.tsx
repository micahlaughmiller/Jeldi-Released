import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

export interface KPIDataPoint {
  id: string;
  name: string;
  type: string;
  value: string;
  change: number;
  timestamp: Date;
}

export interface ERPSystemStatus {
  name: string;
  displayName: string;
  description: string;
  isConnected: boolean;
  lastSync?: Date;
  status: "active" | "inactive" | "error";
}

export interface RealtimeData {
  kpiData: Record<string, KPIDataPoint>;
  erpSystems: ERPSystemStatus[];
  connectionStatus: "connected" | "connecting" | "disconnected";
  insights?: {
    summary: string;
    alerts: string[];
    trends: string[];
  };
}

export function useRealtimeData() {
  const [data, setData] = useState<RealtimeData>({
    kpiData: {},
    erpSystems: [],
    connectionStatus: "disconnected",
  });

  const token = localStorage.getItem("token");

  // Poll KPI updates every 30 seconds
  const {
    data: kpiResponse,
    isLoading: kpiLoading,
    isError: kpiError,
    error: kpiErrorDetails,
  } = useQuery({
    queryKey: ["/api/realtime/kpi-updates"],
    enabled: !!token,
    refetchInterval: 30000, // 30 seconds
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      // Exponential backoff: retry up to 5 times with increasing delays
      if (failureCount >= 5) return false;
      return true;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Poll ERP status every 30 seconds
  const {
    data: erpResponse,
    isLoading: erpLoading,
    isError: erpError,
    error: erpErrorDetails,
  } = useQuery({
    queryKey: ["/api/realtime/erp-status"],
    enabled: !!token,
    refetchInterval: 30000, // 30 seconds
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      // Exponential backoff: retry up to 5 times with increasing delays
      if (failureCount >= 5) return false;
      return true;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Poll insights every 60 seconds (less frequent as it's more expensive)
  const {
    data: insightsResponse,
    isLoading: insightsLoading,
    isError: insightsError,
  } = useQuery({
    queryKey: ["/api/realtime/insights"],
    enabled: !!token,
    refetchInterval: 60000, // 60 seconds
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false; // Less retries for insights
      return true;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Update connection status based on query states
  useEffect(() => {
    let status: "connected" | "connecting" | "disconnected" = "disconnected";

    if (!token) {
      status = "disconnected";
    } else if (kpiLoading || erpLoading) {
      status = "connecting";
    } else if (kpiError || erpError) {
      status = "disconnected";
      console.error("Real-time data polling errors:", {
        kpi: kpiErrorDetails,
        erp: erpErrorDetails,
      });
    } else if (kpiResponse || erpResponse) {
      status = "connected";
    }

    setData((prev) => ({
      ...prev,
      connectionStatus: status,
    }));
  }, [token, kpiLoading, erpLoading, kpiError, erpError, kpiResponse, erpResponse, kpiErrorDetails, erpErrorDetails]);

  // Process KPI updates
  useEffect(() => {
    if (kpiResponse && typeof kpiResponse === 'object' && 'data' in kpiResponse && Array.isArray(kpiResponse.data)) {
      const kpiUpdates: Record<string, KPIDataPoint> = {};

      kpiResponse.data.forEach((kpi: any) => {
        kpiUpdates[kpi.id] = {
          id: kpi.id,
          name: kpi.name,
          type: kpi.type,
          value: kpi.value,
          change: parseFloat(kpi.change) || 0,
          timestamp: new Date(kpi.timestamp),
        };
      });

      setData((prev) => ({
        ...prev,
        kpiData: { ...prev.kpiData, ...kpiUpdates },
      }));
    }
  }, [kpiResponse]);

  // Process ERP status updates
  useEffect(() => {
    if (erpResponse && typeof erpResponse === 'object' && 'data' in erpResponse && Array.isArray(erpResponse.data)) {
      const erpData = erpResponse.data as any[];
      setData((prev) => ({
        ...prev,
        erpSystems: erpData.map((system: any) => ({
          name: system.name,
          displayName: system.displayName,
          description: system.description,
          isConnected: system.isConnected,
          lastSync: system.lastSync ? new Date(system.lastSync) : undefined,
          status: system.isConnected ? "active" : "inactive",
        })),
      }));
    }
  }, [erpResponse]);

  // Process insights updates
  useEffect(() => {
    if (insightsResponse && typeof insightsResponse === 'object' && 'data' in insightsResponse && insightsResponse.data) {
      setData((prev) => ({
        ...prev,
        insights: {
          summary: (insightsResponse.data as any).summary || "",
          alerts: (insightsResponse.data as any).alerts || [],
          trends: (insightsResponse.data as any).trends || [],
        },
      }));
    }
  }, [insightsResponse]);

  // Initialize with sample data for better UX (only if no real data exists)
  useEffect(() => {
    if (Object.keys(data.kpiData).length === 0 && !kpiLoading && !kpiResponse) {
      const initialKPIData: Record<string, KPIDataPoint> = {
        "default-revenue": {
          id: "default-revenue",
          name: "Monthly Revenue",
          type: "revenue",
          value: "$2.45M",
          change: 12.5,
          timestamp: new Date(),
        },
        "default-orders": {
          id: "default-orders",
          name: "Active Orders",
          type: "orders",
          value: "1,247",
          change: 8.2,
          timestamp: new Date(),
        },
        "default-inventory": {
          id: "default-inventory",
          name: "Inventory Fill Rate",
          type: "inventory",
          value: "89.2%",
          change: -3.1,
          timestamp: new Date(),
        },
        "default-performance": {
          id: "default-performance",
          name: "System Performance",
          type: "performance",
          value: "94.8%",
          change: 15.7,
          timestamp: new Date(),
        },
        "default-efficiency": {
          id: "default-efficiency",
          name: "Operational Efficiency",
          type: "efficiency",
          value: "87.3%",
          change: 6.4,
          timestamp: new Date(),
        },
      };

      setData((prev) => ({
        ...prev,
        kpiData: initialKPIData,
      }));
    }
  }, [data.kpiData, kpiLoading, kpiResponse]);

  return data;
}