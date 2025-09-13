import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SystemHealth {
  database: {
    status: string;
    responseTime: number;
    connectionStatus: string;
  };
  api: {
    status: string;
    responseTime: number;
  };
  system: {
    totalUsers: number;
    activeUsers: number;
    totalRoles: number;
    totalPermissions: number;
    recentLogins: number;
    uptime: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    nodeVersion: string;
  };
  timestamp: string;
}

export function AdminSystemMonitoring() {
  const [activeTab, setActiveTab] = useState("health");

  // Fetch system health data
  const { data: healthData, isLoading, refetch } = useQuery<SystemHealth>({
    queryKey: ['/api/admin/system/health'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getHealthStatus = (status: string, responseTime: number) => {
    if (status === "healthy" && responseTime < 100) return { color: "green", text: "Excellent" };
    if (status === "healthy" && responseTime < 500) return { color: "yellow", text: "Good" };
    if (status === "healthy") return { color: "orange", text: "Slow" };
    return { color: "red", text: "Critical" };
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Monitoring</h2>
          <p className="text-muted-foreground">Monitor system health and performance metrics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-health">
            <i className="fas fa-sync-alt mr-2"></i>
            Refresh
          </Button>
          <Badge variant={healthData?.database.status === "healthy" ? "default" : "destructive"}>
            System {healthData?.database.status === "healthy" ? "Healthy" : "Unhealthy"}
          </Badge>
        </div>
      </div>

      {/* Monitoring Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="health" data-testid="tab-health">
            <i className="fas fa-heartbeat mr-2"></i>
            Health Check
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">
            <i className="fas fa-chart-line mr-2"></i>
            Performance
          </TabsTrigger>
          <TabsTrigger value="resources" data-testid="tab-resources">
            <i className="fas fa-server mr-2"></i>
            Resources
          </TabsTrigger>
        </TabsList>

        {/* Health Check Tab */}
        <TabsContent value="health" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Database Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-database text-blue-600"></i>
                  Database
                </CardTitle>
                <CardDescription>
                  PostgreSQL connection and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Status</span>
                    <Badge 
                      variant={healthData?.database.status === "healthy" ? "default" : "destructive"}
                      data-testid="database-status"
                    >
                      {healthData?.database.status || "Unknown"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Response Time</span>
                    <span className="text-sm font-mono" data-testid="database-response-time">
                      {healthData?.database.responseTime}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Connection</span>
                    <Badge variant="outline" data-testid="database-connection">
                      {healthData?.database.connectionStatus}
                    </Badge>
                  </div>
                  <Progress 
                    value={healthData?.database.responseTime ? Math.min(100, (healthData.database.responseTime / 1000) * 100) : 0}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* API Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-globe text-green-600"></i>
                  API Server
                </CardTitle>
                <CardDescription>
                  REST API response and availability
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Status</span>
                    <Badge 
                      variant={healthData?.api.status === "healthy" ? "default" : "destructive"}
                      data-testid="api-status"
                    >
                      {healthData?.api.status || "Unknown"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Response Time</span>
                    <span className="text-sm font-mono" data-testid="api-response-time">
                      {healthData?.api.responseTime}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Health Check</span>
                    <Badge variant="outline">
                      {getHealthStatus(healthData?.api.status || "", healthData?.api.responseTime || 0).text}
                    </Badge>
                  </div>
                  <Progress 
                    value={healthData?.api.responseTime ? Math.min(100, (healthData.api.responseTime / 1000) * 100) : 0}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* System Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-cogs text-purple-600"></i>
                  System
                </CardTitle>
                <CardDescription>
                  Overall system metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Uptime</span>
                    <span className="text-sm font-mono" data-testid="system-uptime">
                      {healthData?.system.uptime ? formatUptime(healthData.system.uptime) : "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Node.js</span>
                    <Badge variant="outline" data-testid="node-version">
                      {healthData?.system.nodeVersion}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Active Users</span>
                    <span className="text-sm font-mono" data-testid="active-users-count">
                      {healthData?.system.activeUsers || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Users</span>
                    <span className="text-sm font-mono" data-testid="total-users-count">
                      {healthData?.system.totalUsers || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Response Times */}
            <Card>
              <CardHeader>
                <CardTitle>Response Times</CardTitle>
                <CardDescription>
                  API and database response performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Database Query</span>
                      <span className="font-mono" data-testid="db-response-display">
                        {healthData?.database.responseTime}ms
                      </span>
                    </div>
                    <Progress 
                      value={healthData?.database.responseTime ? Math.min(100, (healthData.database.responseTime / 100) * 100) : 0}
                      className="h-3"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Target: &lt;50ms
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>API Response</span>
                      <span className="font-mono" data-testid="api-response-display">
                        {healthData?.api.responseTime}ms
                      </span>
                    </div>
                    <Progress 
                      value={healthData?.api.responseTime ? Math.min(100, (healthData.api.responseTime / 500) * 100) : 0}
                      className="h-3"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Target: &lt;200ms
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Metrics</CardTitle>
                <CardDescription>
                  User activity and system usage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <div className="flex items-center gap-3">
                      <i className="fas fa-users text-blue-600"></i>
                      <span className="font-medium">Active Users</span>
                    </div>
                    <span className="text-xl font-bold" data-testid="active-users-metric">
                      {healthData?.system.activeUsers || 0}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <div className="flex items-center gap-3">
                      <i className="fas fa-sign-in-alt text-green-600"></i>
                      <span className="font-medium">Recent Logins</span>
                    </div>
                    <span className="text-xl font-bold" data-testid="recent-logins-metric">
                      {healthData?.system.recentLogins || 0}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <div className="flex items-center gap-3">
                      <i className="fas fa-user-shield text-purple-600"></i>
                      <span className="font-medium">System Roles</span>
                    </div>
                    <span className="text-xl font-bold" data-testid="roles-metric">
                      {healthData?.system.totalRoles || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Memory Usage */}
            <Card>
              <CardHeader>
                <CardTitle>Memory Usage</CardTitle>
                <CardDescription>
                  Node.js memory consumption
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Heap Used</span>
                      <span className="font-mono" data-testid="heap-used">
                        {healthData?.system.memory ? formatBytes(healthData.system.memory.heapUsed) : "Unknown"}
                      </span>
                    </div>
                    <Progress 
                      value={healthData?.system.memory ? (healthData.system.memory.heapUsed / healthData.system.memory.heapTotal) * 100 : 0}
                      className="h-3"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Heap Total</span>
                      <span className="font-mono" data-testid="heap-total">
                        {healthData?.system.memory ? formatBytes(healthData.system.memory.heapTotal) : "Unknown"}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>RSS</span>
                      <span className="font-mono" data-testid="memory-rss">
                        {healthData?.system.memory ? formatBytes(healthData.system.memory.rss) : "Unknown"}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>External</span>
                      <span className="font-mono" data-testid="memory-external">
                        {healthData?.system.memory ? formatBytes(healthData.system.memory.external) : "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Information */}
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>
                  Runtime and environment details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <span className="font-medium">Node.js Version</span>
                    <Badge variant="outline" data-testid="system-node-version">
                      {healthData?.system.nodeVersion}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <span className="font-medium">Uptime</span>
                    <span className="font-mono" data-testid="system-uptime-display">
                      {healthData?.system.uptime ? formatUptime(healthData.system.uptime) : "Unknown"}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <span className="font-medium">Last Health Check</span>
                    <span className="text-sm" data-testid="last-health-check">
                      {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : "Unknown"}
                    </span>
                  </div>
                  
                  <div className="p-3 bg-green-50 border border-green-200 rounded">
                    <div className="flex items-center gap-2 text-green-800">
                      <i className="fas fa-check-circle"></i>
                      <span className="font-medium">System Status: Operational</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      All systems are functioning normally
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}