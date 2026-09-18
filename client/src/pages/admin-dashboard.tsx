import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { performLogout } from "@/lib/logout";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminStatsCards } from "@/components/admin/admin-stats-cards";
import { AdminUserManagement } from "@/components/admin/admin-user-management";
import { AdminRoleManagement } from "@/components/admin/admin-role-management";
import { AdminAuditLogs } from "@/components/admin/admin-audit-logs";
import { AdminSystemMonitoring } from "@/components/admin/admin-system-monitoring";
import { AdminSettings } from "@/components/admin/admin-settings";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  totalPermissions: number;
  recentLogins: number;
}

interface RecentActivity {
  id: string;
  action: string;
  resource: string;
  timestamp: string;
  userId?: string;
}

interface DashboardData {
  stats: SystemStats;
  recentActivity: RecentActivity[];
  timestamp: string;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  // Fetch dashboard data
  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['/api/admin/dashboard/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    
    if (!token || !userData) {
      setLocation("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      
      // Check if user is admin (basic check)
      if (parsedUser.role !== "admin") {
        toast({
          title: "Access Denied",
          description: "You need administrator privileges to access this page.",
          variant: "destructive",
        });
        setLocation("/dashboard");
        return;
      }
    } catch (error) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setLocation("/login");
    }
  }, [setLocation, toast]);

  const handleLogout = async () => {
    await performLogout(setLocation, { showToast: true });
  };

  useEffect(() => {
    if (error) {
      toast({
        title: "Error Loading Dashboard",
        description: "Failed to load admin dashboard data. Please try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
          <p className="text-muted-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar 
        user={user} 
        onLogout={handleLogout}
        onERPClick={() => {}} // Not needed on admin page
        connectedCount={0} // Not needed on admin page
      />
      
      <div className="flex-1 flex flex-col">
        <Header 
          connectedCount={0}
          connectionStatus="disconnected"
        />
        
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Admin Dashboard Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground" data-testid="admin-dashboard-title">
                  Admin Dashboard
                </h1>
                <p className="text-muted-foreground mt-1">
                  System administration and monitoring for Jeldi
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <i className="fas fa-circle text-green-500 mr-2 text-xs"></i>
                  System Healthy
                </Badge>
                <Badge variant="secondary">
                  Last Updated: {dashboardData?.timestamp ? new Date(dashboardData.timestamp).toLocaleTimeString() : 'Loading...'}
                </Badge>
              </div>
            </div>

            {/* Admin Dashboard Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-6 w-full max-w-4xl">
                <TabsTrigger value="overview" data-testid="tab-overview">
                  <i className="fas fa-tachometer-alt mr-2"></i>
                  Overview
                </TabsTrigger>
                <TabsTrigger value="users" data-testid="tab-users">
                  <i className="fas fa-users mr-2"></i>
                  Users
                </TabsTrigger>
                <TabsTrigger value="roles" data-testid="tab-roles">
                  <i className="fas fa-user-shield mr-2"></i>
                  Roles
                </TabsTrigger>
                <TabsTrigger value="audit" data-testid="tab-audit">
                  <i className="fas fa-file-alt mr-2"></i>
                  Audit Logs
                </TabsTrigger>
                <TabsTrigger value="monitoring" data-testid="tab-monitoring">
                  <i className="fas fa-heartbeat mr-2"></i>
                  Monitoring
                </TabsTrigger>
                <TabsTrigger value="settings" data-testid="tab-settings">
                  <i className="fas fa-cog mr-2"></i>
                  Settings
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                {/* System Stats Cards */}
                <AdminStatsCards 
                  stats={dashboardData?.stats}
                  isLoading={isLoading}
                />

                {/* Quick Actions and Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Quick Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <i className="fas fa-bolt text-primary"></i>
                        Quick Actions
                      </CardTitle>
                      <CardDescription>
                        Common administrative tasks
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Button 
                          variant="outline" 
                          className="h-auto p-4 flex flex-col items-center gap-2"
                          onClick={() => setActiveTab("users")}
                          data-testid="quick-action-add-user"
                        >
                          <i className="fas fa-user-plus text-xl text-primary"></i>
                          <span className="text-sm">Add User</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="h-auto p-4 flex flex-col items-center gap-2"
                          onClick={() => setActiveTab("roles")}
                          data-testid="quick-action-manage-roles"
                        >
                          <i className="fas fa-user-cog text-xl text-green-600"></i>
                          <span className="text-sm">Manage Roles</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="h-auto p-4 flex flex-col items-center gap-2"
                          onClick={() => setActiveTab("audit")}
                          data-testid="quick-action-view-logs"
                        >
                          <i className="fas fa-search text-xl text-orange-600"></i>
                          <span className="text-sm">View Logs</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="h-auto p-4 flex flex-col items-center gap-2"
                          onClick={() => setActiveTab("settings")}
                          data-testid="quick-action-system-settings"
                        >
                          <i className="fas fa-cogs text-xl text-purple-600"></i>
                          <span className="text-sm">System Settings</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Activity */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <i className="fas fa-clock text-primary"></i>
                        Recent Activity
                      </CardTitle>
                      <CardDescription>
                        Latest system events and actions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <div className="space-y-3">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-4 bg-muted rounded animate-pulse"></div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {dashboardData?.recentActivity?.slice(0, 5).map((activity) => (
                            <div 
                              key={activity.id} 
                              className="flex items-center gap-3 p-2 rounded hover:bg-muted transition-colors"
                              data-testid={`activity-${activity.id}`}
                            >
                              <div className="w-2 h-2 bg-primary rounded-full"></div>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{activity.action}</p>
                                <p className="text-xs text-muted-foreground">
                                  {activity.resource} • {new Date(activity.timestamp).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          )) || (
                            <div className="text-center py-4 text-muted-foreground">
                              No recent activity
                            </div>
                          )}
                          {(dashboardData?.recentActivity?.length || 0) > 5 && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full"
                              onClick={() => setActiveTab("audit")}
                            >
                              View All Activity
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* User Management Tab */}
              <TabsContent value="users">
                <AdminUserManagement />
              </TabsContent>

              {/* Role Management Tab */}
              <TabsContent value="roles">
                <AdminRoleManagement />
              </TabsContent>

              {/* Audit Logs Tab */}
              <TabsContent value="audit">
                <AdminAuditLogs />
              </TabsContent>

              {/* System Monitoring Tab */}
              <TabsContent value="monitoring">
                <AdminSystemMonitoring />
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings">
                <AdminSettings />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}