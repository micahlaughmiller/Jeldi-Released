import { storage } from "../storage";
import { User, UserWithRoles, Permission, Role, PermissionCheck, InsertAuditLog, AuthUser } from "@shared/schema";
import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  userPermissions?: Permission[];
  userRoles?: Role[];
}

export class RBACService {
  /**
   * Get user with their roles and permissions
   */
  static async getUserWithPermissions(userId: string): Promise<UserWithRoles | null> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return null;

      const userRoles = await storage.getUserRoles(userId);
      const permissions = await storage.getUserPermissions(userId);

      return {
        ...user,
        userRoles,
        permissions,
      };
    } catch (error) {
      console.error("Error getting user with permissions:", error);
      return null;
    }
  }

  /**
   * Check if user has specific permission
   */
  static async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    try {
      const permissions = await storage.getUserPermissions(userId);
      return permissions.some(p => p.resource === resource && p.action === action);
    } catch (error) {
      console.error("Error checking permission:", error);
      return false;
    }
  }

  /**
   * Check if user has any of the specified roles
   */
  static async hasAnyRole(userId: string, roleNames: string[]): Promise<boolean> {
    try {
      const userRoles = await storage.getUserRoles(userId);
      const userRoleNames = userRoles.map(ur => ur.role.name);
      return roleNames.some(roleName => userRoleNames.includes(roleName));
    } catch (error) {
      console.error("Error checking roles:", error);
      return false;
    }
  }

  /**
   * Check if user has all of the specified roles
   */
  static async hasAllRoles(userId: string, roleNames: string[]): Promise<boolean> {
    try {
      const userRoles = await storage.getUserRoles(userId);
      const userRoleNames = userRoles.map(ur => ur.role.name);
      return roleNames.every(roleName => userRoleNames.includes(roleName));
    } catch (error) {
      console.error("Error checking roles:", error);
      return false;
    }
  }

  /**
   * Get permissions for a specific resource
   */
  static async getResourcePermissions(userId: string, resource: string): Promise<Permission[]> {
    try {
      const permissions = await storage.getUserPermissions(userId);
      return permissions.filter(p => p.resource === resource);
    } catch (error) {
      console.error("Error getting resource permissions:", error);
      return [];
    }
  }

  /**
   * Log audit event
   */
  static async logAuditEvent(auditData: InsertAuditLog): Promise<void> {
    try {
      await storage.createAuditLog(auditData);
    } catch (error) {
      console.error("Error logging audit event:", error);
    }
  }

  /**
   * Ensure existing users have RBAC roles assigned based on their legacy role field
   */
  static async ensureExistingUsersHaveRoles(): Promise<void> {
    try {
      // Get all users
      const users = await storage.getAllUsersWithRoles();
      
      for (const user of users) {
        // Check if user already has RBAC roles assigned
        if (user.userRoles && user.userRoles.length > 0) {
          continue; // User already has RBAC roles
        }
        
        // Assign RBAC role based on legacy role field
        let roleName = "user"; // Default to user role
        if (user.role === "admin") {
          roleName = "admin";
        }
        
        const role = await storage.getRoleByName(roleName);
        if (role) {
          await storage.assignRoleToUser(user.id, role.id);
          console.log(`Migrated user ${user.email} to RBAC role: ${roleName}`);
        }
      }
    } catch (error) {
      console.error("Error ensuring existing users have roles:", error);
    }
  }

  /**
   * Initialize default roles and permissions
   */
  static async initializeDefaultRoles(): Promise<void> {
    try {
      // Define default roles
      const defaultRoles = [
        {
          name: "admin",
          displayName: "Administrator",
          description: "Full system access and user management",
          color: "#dc2626",
          isSystem: true,
          isActive: true,
        },
        {
          name: "ops_manager",
          displayName: "Operations Manager",
          description: "Operations and workflow management",
          color: "#2563eb",
          isSystem: true,
          isActive: true,
        },
        {
          name: "finance",
          displayName: "Finance",
          description: "Financial data and reporting access",
          color: "#059669",
          isSystem: true,
          isActive: true,
        },
        {
          name: "cfo",
          displayName: "CFO",
          description: "Executive financial oversight and analytics",
          color: "#7c3aed",
          isSystem: true,
          isActive: true,
        },
        {
          name: "project_manager",
          displayName: "Project Manager",
          description: "Project tracking and resource management",
          color: "#ea580c",
          isSystem: true,
          isActive: true,
        },
        {
          name: "cost_manager",
          displayName: "Cost Manager",
          description: "Cost analysis and budget oversight",
          color: "#0891b2",
          isSystem: true,
          isActive: true,
        },
        {
          name: "sales",
          displayName: "Sales",
          description: "Sales analytics and customer data",
          color: "#dc2626",
          isSystem: true,
          isActive: true,
        },
        {
          name: "marketing",
          displayName: "Marketing",
          description: "Marketing metrics and campaign analysis",
          color: "#c2410c",
          isSystem: true,
          isActive: true,
        },
        {
          name: "user",
          displayName: "User",
          description: "Basic user access",
          color: "#6366f1",
          isSystem: true,
          isActive: true,
        },
      ];

      // Define default permissions
      const defaultPermissions = [
        // User Management
        { name: "user.create", displayName: "Create Users", description: "Create new user accounts", category: "user_management", resource: "users", action: "create", isSystem: true },
        { name: "user.read", displayName: "View Users", description: "View user information", category: "user_management", resource: "users", action: "read", isSystem: true },
        { name: "user.update", displayName: "Update Users", description: "Update user information", category: "user_management", resource: "users", action: "update", isSystem: true },
        { name: "user.delete", displayName: "Delete Users", description: "Delete user accounts", category: "user_management", resource: "users", action: "delete", isSystem: true },
        { name: "user.manage_roles", displayName: "Manage User Roles", description: "Assign and revoke user roles", category: "user_management", resource: "users", action: "manage_roles", isSystem: true },

        // Financial Data
        { name: "financial.view", displayName: "View Financial Data", description: "Access financial reports and analytics", category: "financial_data", resource: "financial", action: "read", isSystem: true },
        { name: "financial.create", displayName: "Create Financial Records", description: "Create financial data entries", category: "financial_data", resource: "financial", action: "create", isSystem: true },
        { name: "financial.update", displayName: "Update Financial Data", description: "Modify financial records", category: "financial_data", resource: "financial", action: "update", isSystem: true },
        { name: "financial.export", displayName: "Export Financial Data", description: "Export financial reports", category: "financial_data", resource: "financial", action: "export", isSystem: true },

        // ERP Access
        { name: "erp.view", displayName: "View ERP Data", description: "Access ERP system data", category: "erp_access", resource: "erp_connections", action: "read", isSystem: true },
        { name: "erp.connect", displayName: "Connect ERP Systems", description: "Connect new ERP systems", category: "erp_access", resource: "erp_connections", action: "create", isSystem: true },
        { name: "erp.manage", displayName: "Manage ERP Connections", description: "Manage ERP system connections", category: "erp_access", resource: "erp_connections", action: "manage", isSystem: true },
        { name: "erp.sync", displayName: "Sync ERP Data", description: "Synchronize ERP data", category: "erp_access", resource: "erp_connections", action: "sync", isSystem: true },

        // KPI & Dashboard
        { name: "kpi.view", displayName: "View KPIs", description: "View KPI data and dashboards", category: "dashboard", resource: "kpis", action: "read", isSystem: true },
        { name: "kpi.create", displayName: "Create KPIs", description: "Create new KPI configurations", category: "dashboard", resource: "kpis", action: "create", isSystem: true },
        { name: "kpi.update", displayName: "Update KPIs", description: "Modify KPI configurations", category: "dashboard", resource: "kpis", action: "update", isSystem: true },
        { name: "kpi.delete", displayName: "Delete KPIs", description: "Remove KPI configurations", category: "dashboard", resource: "kpis", action: "delete", isSystem: true },

        // AI Assistant
        { name: "ai.basic", displayName: "Basic AI Access", description: "Basic AI assistant functionality", category: "ai_assistant", resource: "ai", action: "basic", isSystem: true },
        { name: "ai.advanced", displayName: "Advanced AI Features", description: "Advanced AI assistant features", category: "ai_assistant", resource: "ai", action: "advanced", isSystem: true },
        { name: "ai.admin", displayName: "AI Administration", description: "AI system administration", category: "ai_assistant", resource: "ai", action: "admin", isSystem: true },

        // Email
        { name: "email.send", displayName: "Send Emails", description: "Send emails through the system", category: "email", resource: "email", action: "send", isSystem: true },
        { name: "email.manage", displayName: "Manage Email Settings", description: "Manage email configurations", category: "email", resource: "email", action: "manage", isSystem: true },

        // Settings
        { name: "settings.view", displayName: "View Settings", description: "View system settings", category: "settings", resource: "settings", action: "read", isSystem: true },
        { name: "settings.update", displayName: "Update Settings", description: "Modify system settings", category: "settings", resource: "settings", action: "update", isSystem: true },
        { name: "settings.admin", displayName: "Admin Settings", description: "Administrative settings access", category: "settings", resource: "settings", action: "admin", isSystem: true },

        // Analytics
        { name: "analytics.view", displayName: "View Analytics", description: "Access analytics dashboards and reports", category: "analytics", resource: "analytics", action: "read", isSystem: true },
        { name: "analytics.create", displayName: "Create Analytics", description: "Create custom analytics dashboards", category: "analytics", resource: "analytics", action: "create", isSystem: true },
        { name: "analytics.export", displayName: "Export Analytics", description: "Export analytics data and reports", category: "analytics", resource: "analytics", action: "export", isSystem: true },
        { name: "analytics.advanced", displayName: "Advanced Analytics", description: "Access advanced analytics features and insights", category: "analytics", resource: "analytics", action: "advanced", isSystem: true },
        
        // Organizations
        { name: "organizations.read", displayName: "View Organizations", description: "Access organization information and listings", category: "organizations", resource: "organizations", action: "read", isSystem: true },
        { name: "organizations.create", displayName: "Create Organizations", description: "Create new organizations", category: "organizations", resource: "organizations", action: "create", isSystem: true },
        { name: "organizations.update", displayName: "Update Organizations", description: "Modify organization details", category: "organizations", resource: "organizations", action: "update", isSystem: true },
        { name: "organizations.delete", displayName: "Delete Organizations", description: "Remove organizations from the system", category: "organizations", resource: "organizations", action: "delete", isSystem: true },
        { name: "organizations.manage", displayName: "Manage Organizations", description: "Full organization management access", category: "organizations", resource: "organizations", action: "manage", isSystem: true },
      ];

      // Create roles and permissions
      for (const role of defaultRoles) {
        await storage.createRoleIfNotExists(role);
      }

      for (const permission of defaultPermissions) {
        await storage.createPermissionIfNotExists(permission);
      }

      // Define role-permission mappings
      const rolePermissionMappings = {
        admin: [
          "users.create", "users.read", "users.update", "users.delete", "users.manage_roles",
          "financial.read", "financial.create", "financial.update", "financial.export",
          "erp_connections.read", "erp_connections.create", "erp_connections.manage", "erp_connections.sync",
          "kpis.read", "kpis.create", "kpis.update", "kpis.delete",
          "ai.basic", "ai.advanced", "ai.admin",
          "email.send", "email.manage",
          "settings.read", "settings.update", "settings.admin",
          "analytics.read", "analytics.create", "analytics.export", "analytics.advanced",
          "organizations.read", "organizations.create", "organizations.update", "organizations.delete", "organizations.manage"
        ],
        ops_manager: [
          "erp_connections.read", "erp_connections.create", "erp_connections.manage", "erp_connections.sync",
          "kpis.read", "kpis.create", "kpis.update",
          "ai.basic", "ai.advanced",
          "email.send", "settings.read",
          "analytics.read", "analytics.create", "analytics.advanced"
        ],
        finance: [
          "financial.read", "financial.create", "financial.update", "financial.export",
          "kpis.read", "ai.basic", "email.send", "settings.read",
          "analytics.read", "analytics.export"
        ],
        cfo: [
          "financial.read", "financial.export",
          "kpis.read", "ai.basic", "ai.advanced",
          "email.send", "settings.read",
          "analytics.read", "analytics.export", "analytics.advanced"
        ],
        project_manager: [
          "kpis.read", "kpis.create", "kpis.update",
          "ai.basic", "email.send", "settings.read",
          "analytics.read", "analytics.create"
        ],
        cost_manager: [
          "financial.read", "financial.export",
          "kpis.read", "ai.basic", "email.send", "settings.read",
          "analytics.read", "analytics.export"
        ],
        sales: [
          "kpis.read", "ai.basic", "email.send", "settings.read",
          "analytics.read"
        ],
        marketing: [
          "kpis.read", "ai.basic", "email.send", "settings.read",
          "analytics.read"
        ],
        user: [
          "kpis.read", "ai.basic", "email.send", "email.manage", "settings.read",
          "analytics.read"
        ]
      };

      // Assign permissions to roles
      for (const [roleName, permissionNames] of Object.entries(rolePermissionMappings)) {
        await storage.assignPermissionsToRole(roleName, permissionNames);
      }

      // Fix existing users who don't have RBAC roles assigned
      await RBACService.ensureExistingUsersHaveRoles();

      console.log("Default roles and permissions initialized successfully");
    } catch (error) {
      console.error("Error initializing default roles:", error);
    }
  }
}

/**
 * Middleware to load user permissions
 */
export const loadUserPermissions = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user) {
    try {
      const userWithPermissions = await RBACService.getUserWithPermissions(req.user.id);
      if (userWithPermissions) {
        req.userPermissions = userWithPermissions.permissions;
        req.userRoles = userWithPermissions.userRoles.map(ur => ur.role);
      }
    } catch (error) {
      console.error("Error loading user permissions:", error);
    }
  }
  next();
};

/**
 * Middleware factory for permission-based authorization
 */
export const requirePermission = (resource: string, action: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const hasPermission = await RBACService.hasPermission(req.user.id, resource, action);
    
    if (!hasPermission) {
      await RBACService.logAuditEvent({
        userId: req.user.id,
        action: "permission_denied",
        resource,
        resourceId: null,
        oldValue: null,
        newValue: { requiredPermission: `${resource}.${action}` },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      return res.status(403).json({ 
        message: "Insufficient permissions", 
        required: `${resource}.${action}` 
      });
    }

    next();
  };
};

/**
 * Middleware factory for role-based authorization
 */
export const requireRole = (roles: string | string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const roleArray = Array.isArray(roles) ? roles : [roles];
    const hasRole = await RBACService.hasAnyRole(req.user.id, roleArray);
    
    if (!hasRole) {
      await RBACService.logAuditEvent({
        userId: req.user.id,
        action: "role_access_denied",
        resource: "role_check",
        resourceId: null,
        oldValue: null,
        newValue: { requiredRoles: roleArray },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      return res.status(403).json({ 
        message: "Insufficient role permissions", 
        required: roleArray 
      });
    }

    next();
  };
};

/**
 * Middleware for admin-only access with legacy role fallback
 */
export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // Check RBAC admin role first
  const hasAdminRole = await RBACService.hasAnyRole(req.user.id, ["admin"]);
  
  // If no RBAC admin role, fall back to legacy role field for bootstrap
  if (!hasAdminRole && req.user.role !== "admin") {
    await RBACService.logAuditEvent({
      userId: req.user.id,
      action: "admin_access_denied",
      resource: "admin_access",
      resourceId: null,
      oldValue: null,
      newValue: { 
        hasRBACAdminRole: hasAdminRole,
        legacyRole: req.user.role,
        fallbackUsed: false
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent") || null,
    });

    return res.status(403).json({ 
      message: "Admin access required", 
      details: "Contact system administrator for proper role assignment"
    });
  }

  // Log admin access for audit trail
  await RBACService.logAuditEvent({
    userId: req.user.id,
    action: "admin_access_granted",
    resource: "admin_access", 
    resourceId: null,
    oldValue: null,
    newValue: { 
      hasRBACAdminRole: hasAdminRole,
      legacyRole: req.user.role,
      fallbackUsed: !hasAdminRole && req.user.role === "admin"
    },
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
  });

  next();
};

/**
 * Combined middleware for authentication and permission loading
 */
export const authWithPermissions = [loadUserPermissions];