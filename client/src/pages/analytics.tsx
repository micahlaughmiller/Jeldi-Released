import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/api-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { useToast } from "@/hooks/use-toast";
import { performLogout } from "@/lib/logout";
import { BarChart3, TrendingUp, TrendingDown, Download, RefreshCw, AlertTriangle, CheckCircle, XCircle, Activity, Settings } from "lucide-react";
import KpiCustomization from "@/components/kpi/kpi-customization";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface BusinessMetrics {
  totalRevenue: number;
  monthlyGrowth: number;
  activeOrders: number;
  inventoryValue: number;
  systemPerformance: number;
  connectedSystems: number;
  dataFreshness: string;
}

interface KPISummary {
  id: string;
  name: string;
  type: string;
  value: string;
  change: number;
  lastUpdated: string;
}

interface ERPSystem {
  name: string;
  displayName: string;
  isConnected: boolean;
  lastSync?: Date;
}

interface AnalyticsOverview {
  businessMetrics: BusinessMetrics;
  kpiSummary: KPISummary[];
  erpSystems: ERPSystem[];
  lastUpdated: string;
}

interface RevenueData {
  period: string;
  revenue: number;
  target: number;
  previousYear: number;
}

interface RevenueAnalytics {
  revenueData: RevenueData[];
  summary: {
    totalRevenue: number;
    monthlyGrowth: number;
    targetAchievement: number;
    averageMonthlyRevenue: number;
  };
  lastUpdated: string;
}

interface SystemPerformance {
  systemName: string;
  displayName: string;
  isConnected: boolean;
  performance: number;
  uptime: number;
  responseTime: number | null;
  lastSync?: Date;
  dataQuality: number;
  issues: number | null;
}

interface ERPPerformanceAnalytics {
  systemPerformance: SystemPerformance[];
  overallHealth: {
    averagePerformance: number;
    averageUptime: number;
    systemsOnline: number;
    totalSystems: number;
  };
  dataSyncStatus: {
    totalSystems: number;
    connectedSystems: number;
    healthySystems: number;
    lastGlobalSync: Date | null;
  };
  lastUpdated: string;
}

interface Insight {
  type: string;
  title: string;
  description: string;
  impact: string;
  timeframe: string;
  category: string;
}

interface BusinessInsights {
  aiInsights: string[];
  businessInsights: Insight[];
  summary: {
    totalInsights: number;
    highImpactInsights: number;
    categories: string[];
  };
  lastUpdated: string;
}

export default function Analytics() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("12m");
  const [activeTab, setActiveTab] = useState("overview");
  const [showKpiCustomization, setShowKpiCustomization] = useState(false);
  const { toast } = useToast();

  // Analytics Overview Query
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
    enabled: !!user,
  });

  // Revenue Analytics Query
  const { data: revenueAnalytics, isLoading: revenueLoading } = useQuery<RevenueAnalytics>({
    queryKey: ["/api/analytics/revenue", selectedPeriod],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const response = await fetch(getApiUrl(`/api/analytics/revenue?period=${selectedPeriod}`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`);
      }
      return response.json();
    },
    enabled: !!user,
  });

  // ERP Performance Query
  const { data: erpPerformance, isLoading: erpLoading } = useQuery<ERPPerformanceAnalytics>({
    queryKey: ["/api/analytics/erp-performance"],
    enabled: !!user,
  });

  // Business Insights Query
  const { data: insights, isLoading: insightsLoading } = useQuery<BusinessInsights>({
    queryKey: ["/api/analytics/insights"],
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

  const handleLogout = async () => {
    await performLogout(setLocation, { showToast: true });
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/revenue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/erp-performance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/insights"] });
    toast({
      title: "Analytics Refreshed",
      description: "All analytics data has been updated.",
    });
  };

  const handleExport = async () => {
    try {
      const response = await fetch(getApiUrl(`/api/analytics/export?type=overview&format=json`), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 0);
        
        toast({
          title: "Export Successful",
          description: "Analytics data has been exported.",
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export analytics data.",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const getPerformanceColor = (performance: number) => {
    if (performance >= 95) return "text-green-600";
    if (performance >= 85) return "text-yellow-600";
    return "text-red-600";
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "opportunity":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "insight":
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="analytics-container">
      <Sidebar 
        user={user} 
        onLogout={handleLogout}
        onERPClick={() => {}}
        connectedCount={overview?.businessMetrics.connectedSystems || 0}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          connectedCount={overview?.businessMetrics.connectedSystems || 0}
          connectionStatus="connected"
        />
        
        <div className="flex-1 overflow-auto p-6">
          {/* Analytics Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold" data-testid="analytics-title">Business Analytics</h1>
                <p className="text-muted-foreground mt-1">
                  Comprehensive business intelligence and performance insights
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3m">3 Months</SelectItem>
                    <SelectItem value="6m">6 Months</SelectItem>
                    <SelectItem value="12m">12 Months</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  data-testid="button-refresh"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  data-testid="button-export"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </div>

          {/* Analytics Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="kpis" data-testid="tab-kpis">
                <Settings className="h-4 w-4 mr-2" />
                KPIs
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {overviewLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-6">
                        <div className="animate-pulse">
                          <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                          <div className="h-8 bg-muted rounded w-1/2"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : overview ? (
                <>
                  {/* Business Metrics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card data-testid="metric-revenue">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                            <p className="text-2xl font-bold">{formatCurrency(overview.businessMetrics.totalRevenue)}</p>
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <BarChart3 className="h-6 w-6 text-green-600" />
                          </div>
                        </div>
                        <div className="flex items-center mt-4 text-sm">
                          <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                          <span className="text-green-600">+{overview.businessMetrics.monthlyGrowth}%</span>
                          <span className="text-muted-foreground ml-1">from last month</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="metric-orders">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Active Orders</p>
                            <p className="text-2xl font-bold">{formatNumber(overview.businessMetrics.activeOrders)}</p>
                          </div>
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Activity className="h-6 w-6 text-blue-600" />
                          </div>
                        </div>
                        <Progress value={75} className="mt-4" />
                      </CardContent>
                    </Card>

                    <Card data-testid="metric-inventory">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Inventory Value</p>
                            <p className="text-2xl font-bold">{formatCurrency(overview.businessMetrics.inventoryValue)}</p>
                          </div>
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <CheckCircle className="h-6 w-6 text-purple-600" />
                          </div>
                        </div>
                        <div className="mt-4">
                          <span className="text-sm text-muted-foreground">89.2% fill rate</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="metric-performance">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">System Performance</p>
                            <p className="text-2xl font-bold">{overview.businessMetrics.systemPerformance}%</p>
                          </div>
                          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                            <Activity className="h-6 w-6 text-orange-600" />
                          </div>
                        </div>
                        <Progress value={overview.businessMetrics.systemPerformance} className="mt-4" />
                      </CardContent>
                    </Card>
                  </div>

                  {/* KPI Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Key Performance Indicators</CardTitle>
                      <CardDescription>Current KPI status and trends</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {overview.kpiSummary.map((kpi) => (
                          <div key={kpi.id} className="p-4 border rounded-lg" data-testid={`kpi-${kpi.type}`}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{kpi.name}</h4>
                              <Badge variant={kpi.change >= 0 ? "default" : "destructive"}>
                                {kpi.change >= 0 ? "+" : ""}{kpi.change.toFixed(1)}%
                              </Badge>
                            </div>
                            <p className="text-2xl font-bold">{kpi.value}</p>
                            <p className="text-sm text-muted-foreground">
                              Updated {new Date(kpi.lastUpdated).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* ERP Systems Status */}
                  <Card>
                    <CardHeader>
                      <CardTitle>ERP Systems Status</CardTitle>
                      <CardDescription>Connected systems and data sync status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {overview.erpSystems.map((system) => (
                          <div key={system.name} className="p-4 border rounded-lg" data-testid={`erp-${system.name}`}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{system.displayName}</h4>
                              {system.isConnected ? (
                                <CheckCircle className="h-5 w-5 text-green-600" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-600" />
                              )}
                            </div>
                            <Badge variant={system.isConnected ? "default" : "secondary"}>
                              {system.isConnected ? "Connected" : "Disconnected"}
                            </Badge>
                            {system.lastSync && (
                              <p className="text-sm text-muted-foreground mt-2">
                                Last sync: {new Date(system.lastSync).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Unable to Load Analytics</AlertTitle>
                  <AlertDescription>
                    Failed to load analytics overview. Please try refreshing the page.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Revenue Tab */}
            <TabsContent value="revenue" className="space-y-6">
              {revenueLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
                      <div className="h-64 bg-muted rounded"></div>
                    </div>
                  </CardContent>
                </Card>
              ) : revenueAnalytics ? (
                <>
                  {/* Revenue Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                        <p className="text-2xl font-bold">{formatCurrency(revenueAnalytics.summary.totalRevenue)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Monthly Growth</p>
                        <p className="text-2xl font-bold text-green-600">+{revenueAnalytics.summary.monthlyGrowth}%</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Target Achievement</p>
                        <p className="text-2xl font-bold">{revenueAnalytics.summary.targetAchievement.toFixed(1)}%</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Avg Monthly</p>
                        <p className="text-2xl font-bold">{formatCurrency(revenueAnalytics.summary.averageMonthlyRevenue)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Revenue Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue Trend</CardTitle>
                      <CardDescription>Monthly revenue vs targets for {selectedPeriod}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 flex items-center justify-center border rounded-lg bg-muted/20">
                        <p className="text-muted-foreground">Revenue chart visualization would be rendered here</p>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Revenue Data Unavailable</AlertTitle>
                  <AlertDescription>
                    Failed to load revenue analytics. Please ensure ERP systems are connected.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Operations Tab */}
            <TabsContent value="operations" className="space-y-6">
              {erpLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 bg-muted rounded"></div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : erpPerformance ? (
                <>
                  {/* Overall Health */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Average Performance</p>
                        <p className="text-2xl font-bold">{erpPerformance.overallHealth.averagePerformance}%</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Average Uptime</p>
                        <p className="text-2xl font-bold">{erpPerformance.overallHealth.averageUptime.toFixed(1)}%</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Systems Online</p>
                        <p className="text-2xl font-bold">
                          {erpPerformance.overallHealth.systemsOnline}/{erpPerformance.overallHealth.totalSystems}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Healthy Systems</p>
                        <p className="text-2xl font-bold">{erpPerformance.dataSyncStatus.healthySystems}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* System Performance Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle>System Performance Details</CardTitle>
                      <CardDescription>Individual ERP system health and metrics</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {erpPerformance.systemPerformance.map((system) => (
                          <div key={system.systemName} className="p-4 border rounded-lg" data-testid={`system-${system.systemName}`}>
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h4 className="font-medium">{system.displayName}</h4>
                                <p className="text-sm text-muted-foreground">{system.systemName}</p>
                              </div>
                              <Badge variant={system.isConnected ? "default" : "secondary"}>
                                {system.isConnected ? "Online" : "Offline"}
                              </Badge>
                            </div>
                            
                            {system.isConnected && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">Performance</p>
                                  <p className={`font-medium ${getPerformanceColor(system.performance)}`}>
                                    {system.performance}%
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Uptime</p>
                                  <p className="font-medium">{system.uptime.toFixed(1)}%</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Response Time</p>
                                  <p className="font-medium">{system.responseTime}ms</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Data Quality</p>
                                  <p className="font-medium">{system.dataQuality.toFixed(1)}%</p>
                                </div>
                              </div>
                            )}
                            
                            {system.lastSync && (
                              <p className="text-sm text-muted-foreground mt-3">
                                Last sync: {new Date(system.lastSync).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Operations Data Unavailable</AlertTitle>
                  <AlertDescription>
                    Failed to load operational analytics. Please check system connectivity.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Insights Tab */}
            <TabsContent value="insights" className="space-y-6">
              {insightsLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-20 bg-muted rounded"></div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : insights ? (
                <>
                  {/* Insights Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Total Insights</p>
                        <p className="text-2xl font-bold">{insights.summary.totalInsights}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">High Impact</p>
                        <p className="text-2xl font-bold text-red-600">{insights.summary.highImpactInsights}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-muted-foreground">Categories</p>
                        <p className="text-2xl font-bold">{insights.summary.categories.length}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Business Insights */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Business Insights</CardTitle>
                      <CardDescription>AI-powered recommendations and observations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {insights.businessInsights.map((insight, index) => (
                          <div key={index} className="p-4 border rounded-lg" data-testid={`insight-${index}`}>
                            <div className="flex items-start space-x-3">
                              {getInsightIcon(insight.type)}
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-medium">{insight.title}</h4>
                                  <div className="flex items-center space-x-2">
                                    <Badge variant={insight.impact === "high" ? "destructive" : insight.impact === "medium" ? "default" : "secondary"}>
                                      {insight.impact}
                                    </Badge>
                                    <Badge variant="outline">{insight.category}</Badge>
                                  </div>
                                </div>
                                <p className="text-muted-foreground">{insight.description}</p>
                                <p className="text-sm text-muted-foreground mt-2">
                                  Timeframe: {insight.timeframe}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* AI Insights */}
                  {insights.aiInsights.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>AI-Generated Insights</CardTitle>
                        <CardDescription>Machine learning analysis of your business data</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {insights.aiInsights.map((insight, index) => (
                            <div key={index} className="p-3 bg-muted/50 rounded-lg">
                              <p className="text-sm">{insight}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Insights Unavailable</AlertTitle>
                  <AlertDescription>
                    Failed to generate business insights. Ensure sufficient data is available.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* KPIs Tab */}
            <TabsContent value="kpis" className="space-y-6">
              <KpiCustomization />
            </TabsContent>

          </Tabs>
        </div>
      </main>
    </div>
  );
}