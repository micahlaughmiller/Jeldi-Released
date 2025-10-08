import { Link, useLocation } from "wouter";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface SidebarProps {
  user: User;
  onLogout: () => void;
  onERPClick: () => void;
  connectedCount: number;
}

export default function Sidebar({ user, onLogout, onERPClick, connectedCount }: SidebarProps) {
  const [location] = useLocation();

  const getUserInitials = (username: string) => {
    return username
      .split(" ")
      .map(name => name.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Sidebar Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-network-wired text-primary-foreground text-sm"></i>
          </div>
          <div>
            <h1 className="text-lg font-semibold">Jeldi</h1>
            <p className="text-xs text-muted-foreground">Business Decisions at the Speed of Thought</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        <Link href="/dashboard">
          <a 
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              location === "/dashboard" 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            data-testid="nav-dashboard"
          >
            <i className="fas fa-tachometer-alt w-4"></i>
            <span className="font-medium">Dashboard</span>
          </a>
        </Link>
        
        <button
          onClick={onERPClick}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          data-testid="nav-erp-connections"
        >
          <i className="fas fa-plug w-4"></i>
          <span>ERP Connections</span>
          <span className="ml-auto text-xs bg-chart-2 text-white px-1.5 py-0.5 rounded-full">
            {connectedCount}
          </span>
        </button>
        
        <Link href="/analytics">
          <a 
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              location === "/analytics" 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            data-testid="nav-analytics"
          >
            <i className="fas fa-chart-bar w-4"></i>
            <span className="font-medium">Analytics</span>
          </a>
        </Link>
        
        <Link href="/ai-assistant">
          <a 
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              location === "/ai-assistant" || location === "/assistant"
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            data-testid="nav-ai-assistant"
          >
            <i className="fas fa-robot w-4"></i>
            <span className="font-medium">AI Assistant</span>
          </a>
        </Link>
        
        {/* Admin Section - Only show for admin users */}
        {user.role === "admin" && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Administration
              </p>
            </div>
            
            <Link href="/admin">
              <a 
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  location === "/admin" || location === "/admin/dashboard"
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                data-testid="nav-admin-dashboard"
              >
                <i className="fas fa-shield-alt w-4"></i>
                <span className="font-medium">Admin Dashboard</span>
              </a>
            </Link>
            
            <Link href="/admin/roles">
              <a 
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  location === "/admin/roles" 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                data-testid="nav-role-management"
              >
                <i className="fas fa-users-cog w-4"></i>
                <span>Role Management</span>
              </a>
            </Link>
          </>
        )}
        
        <Link href="/settings">
          <a 
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              location === "/settings" 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            data-testid="nav-settings"
          >
            <i className="fas fa-cog w-4"></i>
            <span>Settings</span>
          </a>
        </Link>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-primary to-chart-1 rounded-full flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-semibold">
              {getUserInitials(user.username)}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" data-testid="user-name">{user.username}</p>
            <p className="text-xs text-muted-foreground" data-testid="user-role">{user.role}</p>
          </div>
          <button 
            className="text-muted-foreground hover:text-foreground"
            onClick={onLogout}
            title="Logout"
            data-testid="button-logout"
          >
            <i className="fas fa-sign-out-alt text-sm"></i>
          </button>
        </div>
      </div>
    </aside>
  );
}
