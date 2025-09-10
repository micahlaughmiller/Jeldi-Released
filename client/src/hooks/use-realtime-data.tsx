import { useState, useEffect } from "react";
import { useWebSocket, WebSocketMessage } from "./use-websocket";

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
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  const { isConnected, lastMessage } = useWebSocket(wsUrl, token || undefined);

  useEffect(() => {
    setData(prev => ({
      ...prev,
      connectionStatus: isConnected ? "connected" : "disconnected"
    }));
  }, [isConnected]);

  useEffect(() => {
    if (!lastMessage) return;

    const message = lastMessage as WebSocketMessage;

    switch (message.type) {
      case "kpi_update":
        if (message.data && Array.isArray(message.data)) {
          const kpiUpdates: Record<string, KPIDataPoint> = {};
          
          message.data.forEach((kpi: any) => {
            kpiUpdates[kpi.id] = {
              id: kpi.id,
              name: kpi.name,
              type: kpi.type,
              value: kpi.value,
              change: parseFloat(kpi.change) || 0,
              timestamp: new Date(kpi.timestamp)
            };
          });

          setData(prev => ({
            ...prev,
            kpiData: { ...prev.kpiData, ...kpiUpdates }
          }));
        }
        break;

      case "erp_status_update":
        if (message.data && Array.isArray(message.data)) {
          setData(prev => ({
            ...prev,
            erpSystems: message.data.map((system: any) => ({
              name: system.name,
              displayName: system.displayName,
              description: system.description,
              isConnected: system.isConnected,
              lastSync: system.lastSync ? new Date(system.lastSync) : undefined,
              status: system.isConnected ? "active" : "inactive"
            }))
          }));
        }
        break;

      case "insights_update":
        if (message.data) {
          setData(prev => ({
            ...prev,
            insights: {
              summary: message.data.summary || "",
              alerts: message.data.alerts || [],
              trends: message.data.trends || []
            }
          }));
        }
        break;

      case "chat_response":
        // Handle chat responses if needed
        console.log("Chat response received:", message.data);
        break;

      case "auth_success":
        console.log("WebSocket authenticated successfully");
        break;

      case "auth_error":
        console.error("WebSocket authentication failed:", message.error);
        break;

      default:
        console.log("Unknown WebSocket message type:", message.type);
    }
  }, [lastMessage]);

  // Simulate some initial data for better UX
  useEffect(() => {
    if (Object.keys(data.kpiData).length === 0) {
      const initialKPIData: Record<string, KPIDataPoint> = {
        "default-revenue": {
          id: "default-revenue",
          name: "Monthly Revenue",
          type: "revenue",
          value: "$2.45M",
          change: 12.5,
          timestamp: new Date()
        },
        "default-orders": {
          id: "default-orders",
          name: "Active Orders",
          type: "orders",
          value: "1,247",
          change: 8.2,
          timestamp: new Date()
        },
        "default-inventory": {
          id: "default-inventory",
          name: "Inventory Fill Rate",
          type: "inventory",
          value: "89.2%",
          change: -3.1,
          timestamp: new Date()
        },
        "default-performance": {
          id: "default-performance",
          name: "System Performance",
          type: "performance",
          value: "94.8%",
          change: 15.7,
          timestamp: new Date()
        },
        "default-efficiency": {
          id: "default-efficiency",
          name: "Operational Efficiency",
          type: "efficiency",
          value: "87.3%",
          change: 6.4,
          timestamp: new Date()
        }
      };

      setData(prev => ({
        ...prev,
        kpiData: initialKPIData
      }));
    }
  }, [data.kpiData]);

  return data;
}
