import { useState, useEffect, useContext, createContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/api-config";

// Types for RBAC system
export interface Permission {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  resource: string;
  action: string;
  isSystem: boolean;
  createdAt: Date;
}

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithRoles {
  user: {
    id: string;
    username: string;
    email: string;
    role: string; // Legacy role field
  };
  roles: Role[];
  permissions: Permission[];
  roleNames: string[];
}

// Permission context for sharing permission state
interface PermissionContextType {
  userRoles: UserWithRoles | null;
  hasPermission: (resource: string, action: string) => boolean;
  hasRole: (roleName: string | string[]) => boolean;
  hasAnyRole: (roleNames: string[]) => boolean;
  hasAllRoles: (roleNames: string[]) => boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

// Permission Provider Component
export function PermissionProvider({ children }: { children: ReactNode }) {
  const [userRoles, setUserRoles] = useState<UserWithRoles | null>(null);

  // Fetch user roles and permissions
  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("token");
  const { data, isLoading, error, refetch } = useQuery<UserWithRoles>({
    queryKey: ["/api/rbac/me"],
    enabled: hasToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) {
      setUserRoles(data);
    }
  }, [data]);

  // Helper function to check if user has specific permission
  const hasPermission = (resource: string, action: string): boolean => {
    if (!userRoles?.permissions) return false;
    
    return userRoles.permissions.some(
      permission => permission.resource === resource && permission.action === action
    );
  };

  // Helper function to check if user has specific role(s)
  const hasRole = (roleName: string | string[]): boolean => {
    if (!userRoles?.roleNames) return false;
    
    if (typeof roleName === 'string') {
      return userRoles.roleNames.includes(roleName);
    }
    
    return roleName.some(role => userRoles.roleNames.includes(role));
  };

  // Helper function to check if user has any of the specified roles
  const hasAnyRole = (roleNames: string[]): boolean => {
    if (!userRoles?.roleNames) return false;
    return roleNames.some(role => userRoles.roleNames.includes(role));
  };

  // Helper function to check if user has all specified roles
  const hasAllRoles = (roleNames: string[]): boolean => {
    if (!userRoles?.roleNames) return false;
    return roleNames.every(role => userRoles.roleNames.includes(role));
  };

  const contextValue: PermissionContextType = {
    userRoles,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    isLoading,
    error,
    refetch
  };

  return (
    <PermissionContext.Provider value={contextValue}>
      {children}
    </PermissionContext.Provider>
  );
}

// Hook to use permission context
export function usePermissions() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
}

// Hook for checking specific permissions
export function useHasPermission(resource: string, action: string) {
  const { hasPermission, isLoading } = usePermissions();
  return { hasPermission: hasPermission(resource, action), isLoading };
}

// Hook for checking specific roles
export function useHasRole(roleName: string | string[]) {
  const { hasRole, isLoading } = usePermissions();
  return { hasRole: hasRole(roleName), isLoading };
}

// Hook for admin access
export function useIsAdmin() {
  const { hasRole, isLoading } = usePermissions();
  return { isAdmin: hasRole('admin'), isLoading };
}

// Hook for checking multiple permissions
export function useHasAnyPermission(permissions: Array<{ resource: string; action: string }>) {
  const { hasPermission, isLoading } = usePermissions();
  
  const hasAnyPermission = permissions.some(({ resource, action }) => 
    hasPermission(resource, action)
  );
  
  return { hasAnyPermission, isLoading };
}

// Hook for checking permission by category
export function usePermissionsByCategory(category: string) {
  const { userRoles, isLoading } = usePermissions();
  
  const permissions = userRoles?.permissions.filter(p => p.category === category) || [];
  
  return { permissions, hasAnyInCategory: permissions.length > 0, isLoading };
}

// Hook for role-based data filtering
export function useRoleBasedAccess() {
  const { userRoles, hasPermission, hasRole, isLoading } = usePermissions();

  const canAccessFinancialData = hasPermission('financial', 'read') || hasRole(['finance', 'cfo', 'admin']);
  const canManageUsers = hasPermission('user', 'manage_roles') || hasRole('admin');
  const canAccessERPData = hasPermission('erp_connections', 'read') || hasRole(['ops_manager', 'admin']);
  const canCreateKPIs = hasPermission('kpis', 'create') || hasRole(['ops_manager', 'project_manager', 'admin']);
  const canUseAdvancedAI = hasPermission('ai', 'advanced') || hasRole(['ops_manager', 'cfo', 'admin']);
  const canManageSettings = hasPermission('settings', 'admin') || hasRole('admin');

  return {
    canAccessFinancialData,
    canManageUsers,
    canAccessERPData,
    canCreateKPIs,
    canUseAdvancedAI,
    canManageSettings,
    isLoading,
    userRoles
  };
}

// Async permission checker for server-side validation
export async function checkPermissionAPI(resource: string, action: string): Promise<boolean> {
  try {
    const response = await queryClient.fetchQuery({
      queryKey: ["/api/rbac/check-permission", resource, action],
      queryFn: async () => {
        const res = await fetch(getApiUrl("/api/rbac/check-permission"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify({ resource, action })
        });
        
        if (!res.ok) {
          throw new Error("Permission check failed");
        }
        
        return res.json();
      },
      staleTime: 2 * 60 * 1000, // 2 minutes cache
    });
    
    return response.hasPermission;
  } catch (error) {
    console.error("Permission check failed:", error);
    return false;
  }
}

// Utility function to get role color for UI display
export function getRoleColor(roleName: string): string {
  const roleColors: Record<string, string> = {
    admin: "#dc2626",
    ops_manager: "#2563eb",
    finance: "#059669",
    cfo: "#7c3aed",
    project_manager: "#ea580c",
    cost_manager: "#0891b2",
    sales: "#dc2626",
    marketing: "#c2410c",
    user: "#6366f1"
  };
  
  return roleColors[roleName] || "#6366f1";
}

// Utility function to get role display name
export function getRoleDisplayName(roleName: string): string {
  const roleDisplayNames: Record<string, string> = {
    admin: "Administrator",
    ops_manager: "Operations Manager",
    finance: "Finance",
    cfo: "CFO",
    project_manager: "Project Manager",
    cost_manager: "Cost Manager",
    sales: "Sales",
    marketing: "Marketing",
    user: "User"
  };
  
  return roleDisplayNames[roleName] || roleName;
}