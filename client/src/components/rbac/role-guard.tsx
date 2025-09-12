import { ReactNode } from "react";
import { usePermissions, useHasPermission, useHasRole, useIsAdmin } from "@/hooks/use-permissions";

// Base interface for all guards
interface BaseGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  loadingComponent?: ReactNode;
}

// Permission Guard - shows content based on specific permission
interface PermissionGuardProps extends BaseGuardProps {
  resource: string;
  action: string;
}

export function PermissionGuard({ 
  resource, 
  action, 
  children, 
  fallback = null, 
  loadingComponent = null 
}: PermissionGuardProps) {
  const { hasPermission, isLoading } = useHasPermission(resource, action);

  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-4 w-24 rounded" data-testid="permission-loading" />;
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>;
}

// Role Guard - shows content based on user role(s)
interface RoleGuardProps extends BaseGuardProps {
  roles: string | string[];
  requireAll?: boolean; // If true, user must have ALL roles; if false, user needs ANY role
}

export function RoleGuard({ 
  roles, 
  requireAll = false, 
  children, 
  fallback = null, 
  loadingComponent = null 
}: RoleGuardProps) {
  const { hasRole, hasAnyRole, hasAllRoles, isLoading } = usePermissions();

  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-4 w-24 rounded" data-testid="role-loading" />;
  }

  const roleArray = Array.isArray(roles) ? roles : [roles];
  const hasAccess = requireAll ? hasAllRoles(roleArray) : hasAnyRole(roleArray);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Admin Guard - shows content only to administrators
export function AdminGuard({ children, fallback = null, loadingComponent = null }: BaseGuardProps) {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-4 w-24 rounded" data-testid="admin-loading" />;
  }

  return isAdmin ? <>{children}</> : <>{fallback}</>;
}

// Financial Access Guard - shows content for users with financial permissions
export function FinancialGuard({ children, fallback = null, loadingComponent = null }: BaseGuardProps) {
  return (
    <RoleGuard 
      roles={['finance', 'cfo', 'admin']} 
      fallback={fallback}
      loadingComponent={loadingComponent}
    >
      {children}
    </RoleGuard>
  );
}

// Operations Guard - shows content for operations-related roles
export function OperationsGuard({ children, fallback = null, loadingComponent = null }: BaseGuardProps) {
  return (
    <RoleGuard 
      roles={['ops_manager', 'admin']} 
      fallback={fallback}
      loadingComponent={loadingComponent}
    >
      {children}
    </RoleGuard>
  );
}

// Management Guard - shows content for management roles
export function ManagementGuard({ children, fallback = null, loadingComponent = null }: BaseGuardProps) {
  return (
    <RoleGuard 
      roles={['admin', 'cfo', 'ops_manager', 'project_manager']} 
      fallback={fallback}
      loadingComponent={loadingComponent}
    >
      {children}
    </RoleGuard>
  );
}

// Multiple Permission Guard - checks for multiple permissions (OR logic)
interface MultiplePermissionGuardProps extends BaseGuardProps {
  permissions: Array<{ resource: string; action: string }>;
}

export function MultiplePermissionGuard({ 
  permissions, 
  children, 
  fallback = null, 
  loadingComponent = null 
}: MultiplePermissionGuardProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-4 w-24 rounded" data-testid="multi-permission-loading" />;
  }

  const hasAnyPermission = permissions.some(({ resource, action }) => 
    hasPermission(resource, action)
  );

  return hasAnyPermission ? <>{children}</> : <>{fallback}</>;
}

// Combined Guard - checks both roles AND permissions (AND logic)
interface CombinedGuardProps extends BaseGuardProps {
  roles?: string | string[];
  permissions?: Array<{ resource: string; action: string }>;
  requireAllRoles?: boolean;
  requireAllPermissions?: boolean;
}

export function CombinedGuard({ 
  roles, 
  permissions, 
  requireAllRoles = false,
  requireAllPermissions = false,
  children, 
  fallback = null, 
  loadingComponent = null 
}: CombinedGuardProps) {
  const { hasPermission, hasAnyRole, hasAllRoles, isLoading } = usePermissions();

  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  if (isLoading) {
    return <div className="animate-pulse bg-muted h-4 w-24 rounded" data-testid="combined-loading" />;
  }

  // Check roles
  let hasRoleAccess = true;
  if (roles) {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    hasRoleAccess = requireAllRoles ? hasAllRoles(roleArray) : hasAnyRole(roleArray);
  }

  // Check permissions
  let hasPermissionAccess = true;
  if (permissions) {
    if (requireAllPermissions) {
      hasPermissionAccess = permissions.every(({ resource, action }) => 
        hasPermission(resource, action)
      );
    } else {
      hasPermissionAccess = permissions.some(({ resource, action }) => 
        hasPermission(resource, action)
      );
    }
  }

  const hasAccess = hasRoleAccess && hasPermissionAccess;

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Feature Guard - shows content based on feature access
interface FeatureGuardProps extends BaseGuardProps {
  feature: 'erp' | 'financial' | 'ai_advanced' | 'user_management' | 'settings' | 'kpi_create';
}

export function FeatureGuard({ feature, children, fallback = null, loadingComponent = null }: FeatureGuardProps) {
  const featurePermissions: Record<string, { resource: string; action: string }[]> = {
    erp: [{ resource: 'erp_connections', action: 'read' }],
    financial: [{ resource: 'financial', action: 'read' }],
    ai_advanced: [{ resource: 'ai', action: 'advanced' }],
    user_management: [{ resource: 'users', action: 'manage_roles' }],
    settings: [{ resource: 'settings', action: 'admin' }],
    kpi_create: [{ resource: 'kpis', action: 'create' }]
  };

  const permissions = featurePermissions[feature];
  if (!permissions) {
    console.warn(`Unknown feature: ${feature}`);
    return <>{fallback}</>;
  }

  return (
    <MultiplePermissionGuard 
      permissions={permissions}
      fallback={fallback}
      loadingComponent={loadingComponent}
    >
      {children}
    </MultiplePermissionGuard>
  );
}

// Navigation Item Guard - for navigation items with proper loading states
interface NavigationGuardProps extends BaseGuardProps {
  roles?: string | string[];
  permissions?: Array<{ resource: string; action: string }>;
  showWhileLoading?: boolean;
}

export function NavigationGuard({ 
  roles, 
  permissions, 
  showWhileLoading = false,
  children, 
  fallback = null 
}: NavigationGuardProps) {
  const { hasPermission, hasAnyRole, isLoading } = usePermissions();

  // Show/hide during loading based on preference
  if (isLoading) {
    return showWhileLoading ? <>{children}</> : <>{fallback}</>;
  }

  // Check roles
  let hasRoleAccess = true;
  if (roles) {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    hasRoleAccess = hasAnyRole(roleArray);
  }

  // Check permissions
  let hasPermissionAccess = true;
  if (permissions) {
    hasPermissionAccess = permissions.some(({ resource, action }) => 
      hasPermission(resource, action)
    );
  }

  const hasAccess = hasRoleAccess && hasPermissionAccess;

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Role Badge Component - displays user's role with appropriate styling
export function RoleBadge({ 
  roleName, 
  className = "" 
}: { 
  roleName: string; 
  className?: string; 
}) {
  const roleColors: Record<string, string> = {
    admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    ops_manager: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    finance: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    cfo: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    project_manager: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    cost_manager: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
    sales: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
    marketing: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
    user: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
  };

  const displayNames: Record<string, string> = {
    admin: "Admin",
    ops_manager: "Ops Manager",
    finance: "Finance",
    cfo: "CFO",
    project_manager: "PM",
    cost_manager: "Cost Manager",
    sales: "Sales",
    marketing: "Marketing",
    user: "User"
  };

  const colorClass = roleColors[roleName] || roleColors.user;
  const displayName = displayNames[roleName] || roleName;

  return (
    <span 
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}
      data-testid={`role-badge-${roleName}`}
    >
      {displayName}
    </span>
  );
}

// Access Denied Component - standardized access denied message
interface AccessDeniedProps {
  message?: string;
  showIcon?: boolean;
  className?: string;
}

export function AccessDenied({ 
  message = "You don't have permission to access this feature.", 
  showIcon = true,
  className = ""
}: AccessDeniedProps) {
  return (
    <div className={`flex items-center justify-center p-8 text-center ${className}`} data-testid="access-denied">
      <div className="max-w-md">
        {showIcon && (
          <div className="mx-auto mb-4 w-12 h-12 bg-muted rounded-full flex items-center justify-center">
            <i className="fas fa-lock text-muted-foreground text-xl" />
          </div>
        )}
        <h3 className="text-lg font-semibold text-foreground mb-2">Access Restricted</h3>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}