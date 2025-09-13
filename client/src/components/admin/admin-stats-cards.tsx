import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  totalPermissions: number;
  recentLogins: number;
}

interface AdminStatsCardsProps {
  stats?: SystemStats;
  isLoading: boolean;
}

export function AdminStatsCards({ stats, isLoading }: AdminStatsCardsProps) {
  const statsCards = [
    {
      title: "Total Users",
      value: stats?.totalUsers || 0,
      icon: "fas fa-users",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      description: "Registered users",
      testId: "stat-total-users"
    },
    {
      title: "Active Users",
      value: stats?.activeUsers || 0,
      icon: "fas fa-user-check",
      color: "text-green-600", 
      bgColor: "bg-green-50",
      description: "Active in last 30 days",
      testId: "stat-active-users"
    },
    {
      title: "System Roles",
      value: stats?.totalRoles || 0,
      icon: "fas fa-user-shield",
      color: "text-purple-600",
      bgColor: "bg-purple-50", 
      description: "Configured roles",
      testId: "stat-total-roles"
    },
    {
      title: "Permissions",
      value: stats?.totalPermissions || 0,
      icon: "fas fa-key",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      description: "System permissions",
      testId: "stat-total-permissions"
    },
    {
      title: "Recent Logins",
      value: stats?.recentLogins || 0,
      icon: "fas fa-sign-in-alt",
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      description: "Last 24 hours",
      testId: "stat-recent-logins"
    }
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {statsCards.map((card) => (
        <Card key={card.title} className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {card.title}
            </CardTitle>
            <div className={`w-8 h-8 rounded-lg ${card.bgColor} flex items-center justify-center`}>
              <i className={`${card.icon} ${card.color} text-sm`}></i>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid={card.testId}>
              {card.value.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}