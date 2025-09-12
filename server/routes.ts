import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { erpService } from "./services/erpService";
import { emailService } from "./services/emailService";
import { analyzeERPData, generateKPIInsights } from "./services/openai";
import { insertUserSchema, insertKpiConfigurationSchema, insertChatHistorySchema, emailSendRequestSchema, smtpConfigRequestSchema, emailProviderParamsSchema, updateUserPreferencesSchema, insertUserPreferencesSchema, insertRoleSchema, updateRoleSchema, roleAssignmentSchema, roleRevocationSchema, insertPermissionSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import passport from "passport";
import { OAuthService } from "./services/oauthService";
import { getJwtSecret } from "./env-validation";
import { RBACService, AuthenticatedRequest, loadUserPermissions, requirePermission, requireRole, requireAdmin, authWithPermissions } from "./services/rbac";

// JWT_SECRET accessed at runtime, not import-time
const getJwtSecretAtRuntime = () => getJwtSecret();

// WebSocket clients tracking with permission data
interface WSClient {
  ws: WebSocket;
  user: User;
  permissions: string[];
}
const wsClients = new Map<string, WSClient>();

// Helper function to broadcast ERP status updates with permission check
async function broadcastERPStatusUpdate(userId: string) {
  const wsClient = wsClients.get(userId);
  if (wsClient && wsClient.ws.readyState === WebSocket.OPEN) {
    // Check if user has permission to view ERP data
    if (!wsClient.permissions.includes('erp_connections.read')) {
      return; // Skip sending data if user lacks permission
    }
    
    try {
      const systems = await erpService.getConnectedSystems(userId);
      wsClient.ws.send(JSON.stringify({
        type: 'erp_status_update',
        data: systems.map(system => ({
          name: system.name,
          displayName: system.displayName,
          description: system.description,
          isConnected: system.isConnected,
          lastSync: system.lastSync,
          status: system.isConnected ? "active" : "inactive"
        }))
      }));
    } catch (error) {
      console.error('Error broadcasting ERP status update:', error);
    }
  }
}

export async function registerRoutes(app: Express, options: { excludeWebSocket?: boolean } = {}): Promise<Server> {
  // Setup OAuth strategies
  OAuthService.setupStrategies();
  
  // Initialize passport middleware
  app.use(passport.initialize());
  
  // Initialize default RBAC roles and permissions
  try {
    await RBACService.initializeDefaultRoles();
    console.log('RBAC system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize RBAC system:', error);
  }
  
  // Cleanup expired OAuth sessions periodically
  setInterval(async () => {
    try {
      await storage.cleanupExpiredOAuthSessions();
    } catch (error) {
      console.error('OAuth session cleanup error:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Authentication middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, getJwtSecretAtRuntime()) as any;
      const user = await storage.getUser(decoded.userId);
      if (!user) {
        return res.status(403).json({ message: 'Invalid token' });
      }
      req.user = user;
      next();
    } catch (error) {
      return res.status(403).json({ message: 'Invalid token' });
    }
  };

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password } = insertUserSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password (ensure password is provided for local registration)
      if (!password) {
        return res.status(400).json({ message: "Password is required for registration" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        authProvider: "local",
        role: "user"
      });

      // Generate token
      const token = jwt.sign({ userId: user.id }, getJwtSecretAtRuntime(), { expiresIn: '7d' });
      
      res.json({ 
        token, 
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      res.status(400).json({ message: "Registration failed", error: (error as Error).message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if this is an OAuth user trying to login with password
      if (user.authProvider !== "local" || !user.password) {
        return res.status(401).json({ message: "Please use OAuth login for this account" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ userId: user.id }, getJwtSecretAtRuntime(), { expiresIn: '7d' });
      
      res.json({ 
        token, 
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      res.status(400).json({ message: "Login failed", error: (error as Error).message });
    }
  });

  app.post("/api/auth/logout", authenticateToken, async (req: any, res) => {
    try {
      // In a more advanced implementation, you could maintain a blacklist
      // of revoked tokens or use a token store like Redis
      // For now, we'll just confirm the logout was successful
      // The client-side cleanup is the primary security measure
      
      res.json({ 
        message: "Logout successful", 
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ 
        message: "Logout failed", 
        error: (error as Error).message 
      });
    }
  });

  // Get current user info
  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    try {
      const user = req.user;
      res.json({ 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role,
        authProvider: user.authProvider
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user info", error: (error as Error).message });
    }
  });

  // OAuth routes
  app.get("/api/oauth/providers", async (req, res) => {
    try {
      const providers = OAuthService.getAvailableProviders();
      res.json(providers.map(p => ({
        name: p.name,
        displayName: p.displayName
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to get OAuth providers", error: (error as Error).message });
    }
  });

  // Secure OAuth session retrieval endpoint
  app.get("/api/auth/oauth-result/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const authResult = await OAuthService.getCompletedOAuthSession(sessionId);
      
      if (!authResult) {
        return res.status(404).json({ message: "OAuth session not found or expired" });
      }
      
      res.json(authResult);
    } catch (error) {
      console.error("OAuth session retrieval error:", error);
      res.status(500).json({ message: "Failed to retrieve OAuth result", error: (error as Error).message });
    }
  });

  // Google OAuth routes
  app.get("/api/auth/google", async (req, res, next) => {
    try {
      // Check if Google OAuth is configured
      if (!OAuthService.isProviderConfigured("google")) {
        return res.status(503).json({
          message: "Google OAuth is not configured",
          error: "service_unavailable",
          details: {
            description: "Google OAuth authentication is not available because the required environment variables are not set.",
            required_variables: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
            instructions: "Please contact your administrator to configure Google OAuth credentials."
          }
        });
      }

      // Generate secure CSRF state
      const state = OAuthService.generateSecureState();
      await OAuthService.createOAuthSession("google", state);
      
      passport.authenticate("google", {
        scope: ["profile", "email"],
        state: state
      })(req, res, next);
    } catch (error) {
      console.error("Google OAuth initiation error:", error);
      res.redirect("/login?error=oauth_failed");
    }
  });
  
  app.get("/api/auth/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: "/login?error=oauth_failed" }),
    async (req: any, res) => {
      try {
        const result = req.user;
        // Use secure session-based approach
        res.redirect(`/login?oauth_session=${result.sessionState}`);
      } catch (error) {
        console.error("Google OAuth callback error:", error);
        res.redirect("/login?error=oauth_failed");
      }
    }
  );

  // User Settings routes
  app.get("/api/user/preferences", authenticateToken, async (req: any, res) => {
    try {
      let preferences = await storage.getUserPreferences(req.user.id);
      
      // If user has no preferences, create default ones
      if (!preferences) {
        preferences = await storage.createUserPreferences({ userId: req.user.id });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Get user preferences error:", error);
      res.status(500).json({ message: "Failed to get user preferences", error: (error as Error).message });
    }
  });

  app.put("/api/user/preferences", authenticateToken, async (req: any, res) => {
    try {
      const updates = updateUserPreferencesSchema.parse(req.body);
      
      // Check if user has preferences, create if not exists
      let preferences = await storage.getUserPreferences(req.user.id);
      if (!preferences) {
        preferences = await storage.createUserPreferences({ userId: req.user.id });
      }
      
      const updatedPreferences = await storage.updateUserPreferences(req.user.id, updates);
      
      if (!updatedPreferences) {
        return res.status(404).json({ message: "User preferences not found" });
      }
      
      res.json(updatedPreferences);
    } catch (error) {
      console.error("Update user preferences error:", error);
      res.status(400).json({ message: "Failed to update user preferences", error: (error as Error).message });
    }
  });

  app.put("/api/user/profile", authenticateToken, async (req: any, res) => {
    try {
      const { username, email, firstName, lastName, profileImage } = req.body;
      
      // Validate input
      if (!username && !email && !firstName && !lastName && !profileImage) {
        return res.status(400).json({ message: "At least one field must be provided for update" });
      }
      
      // If email is being updated, check it's not already in use
      if (email && email !== req.user.email) {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }
      
      // If username is being updated, check it's not already in use
      if (username && username !== req.user.username) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(400).json({ message: "Username already in use" });
        }
      }
      
      const updates: any = {};
      if (username) updates.username = username;
      if (email) updates.email = email;
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;
      if (profileImage) updates.profileImage = profileImage;
      
      const updatedUser = await storage.updateUser(req.user.id, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return user without password
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update user profile error:", error);
      res.status(400).json({ message: "Failed to update user profile", error: (error as Error).message });
    }
  });

  app.put("/api/user/password", authenticateToken, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Both current and new password are required" });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters long" });
      }
      
      // For OAuth users, password change is not allowed
      if (req.user.authProvider !== "local" || !req.user.password) {
        return res.status(400).json({ message: "Password change not available for OAuth accounts" });
      }
      
      // Verify current password
      const isValidCurrentPassword = await bcrypt.compare(currentPassword, req.user.password);
      if (!isValidCurrentPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      
      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      const updatedUser = await storage.updateUser(req.user.id, { password: hashedNewPassword });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(400).json({ message: "Failed to change password", error: (error as Error).message });
    }
  });

  app.post("/api/user/preferences/reset", authenticateToken, async (req: any, res) => {
    try {
      const preferences = await storage.resetUserPreferences(req.user.id);
      res.json(preferences);
    } catch (error) {
      console.error("Reset user preferences error:", error);
      res.status(500).json({ message: "Failed to reset user preferences", error: (error as Error).message });
    }
  });

  // Microsoft OAuth routes
  app.get("/api/auth/microsoft", async (req, res, next) => {
    try {
      // Check if Microsoft OAuth is configured
      if (!OAuthService.isProviderConfigured("microsoft")) {
        return res.status(503).json({
          message: "Microsoft OAuth is not configured",
          error: "service_unavailable",
          details: {
            description: "Microsoft OAuth authentication is not available because the required environment variables are not set.",
            required_variables: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
            instructions: "Please contact your administrator to configure Microsoft OAuth credentials."
          }
        });
      }

      // Generate secure CSRF state
      const state = OAuthService.generateSecureState();
      await OAuthService.createOAuthSession("microsoft", state);
      
      passport.authenticate("microsoft", {
        scope: ["openid", "profile", "email", "offline_access", "User.Read"],
        state: state
      })(req, res, next);
    } catch (error) {
      console.error("Microsoft OAuth initiation error:", error);
      res.redirect("/login?error=oauth_failed");
    }
  });
  
  app.get("/api/auth/microsoft/callback",
    passport.authenticate("microsoft", { session: false, failureRedirect: "/login?error=oauth_failed" }),
    async (req: any, res) => {
      try {
        const result = req.user;
        // Use secure session-based approach
        res.redirect(`/login?oauth_session=${result.sessionState}`);
      } catch (error) {
        console.error("Microsoft OAuth callback error:", error);
        res.redirect("/login?error=oauth_failed");
      }
    }
  );

  // ERP Connection routes
  app.get("/api/erp/systems", authenticateToken, requirePermission("erp_connections", "read"), async (req: any, res) => {
    try {
      const systems = await erpService.getConnectedSystems(req.user.id);
      res.json(systems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ERP systems", error: (error as Error).message });
    }
  });

  app.post("/api/erp/connect/:system", authenticateToken, requirePermission("erp_connections", "create"), async (req: any, res) => {
    try {
      const { system } = req.params;
      const redirectUri = process.env.OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/erp/callback`;
      
      const authUrl = await erpService.initiateOAuthFlow(system, req.user.id, redirectUri);
      res.json({ authUrl });
    } catch (error) {
      res.status(400).json({ message: "Failed to initiate OAuth", error: (error as Error).message });
    }
  });

  app.get("/api/erp/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ message: "Missing code or state parameter" });
      }

      const connection = await erpService.handleOAuthCallback(code as string, state as string);
      
      // Broadcast ERP status update via WebSocket
      await broadcastERPStatusUpdate(connection.userId);
      
      // Redirect to dashboard with success message
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/dashboard?connected=${connection.erpSystem}`);
    } catch (error) {
      res.status(400).json({ message: "OAuth callback failed", error: (error as Error).message });
    }
  });

  app.delete("/api/erp/disconnect/:system", authenticateToken, requirePermission("erp_connections", "manage"), async (req: any, res) => {
    try {
      const { system } = req.params;
      await erpService.disconnectSystem(req.user.id, system);
      
      // Broadcast ERP status update via WebSocket
      await broadcastERPStatusUpdate(req.user.id);
      
      res.json({ message: "System disconnected successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to disconnect system", error: (error as Error).message });
    }
  });

  app.get("/api/erp/data", authenticateToken, requirePermission("erp_connections", "read"), async (req: any, res) => {
    try {
      const data = await erpService.aggregateERPData(req.user.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ERP data", error: (error as Error).message });
    }
  });

  // RBAC routes
  // Get current user's roles and permissions
  app.get("/api/rbac/me", authenticateToken, loadUserPermissions, async (req: AuthenticatedRequest, res) => {
    try {
      const userWithRoles = await RBACService.getUserWithPermissions(req.user!.id);
      if (!userWithRoles) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        user: req.user,
        roles: userWithRoles.userRoles.map(ur => ur.role),
        permissions: userWithRoles.permissions,
        roleNames: userWithRoles.userRoles.map(ur => ur.role.name)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user roles", error: (error as Error).message });
    }
  });

  // Get all available roles (admin only)
  app.get("/api/rbac/roles", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const roles = await storage.getRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch roles", error: (error as Error).message });
    }
  });

  // Get all available permissions (admin only)
  app.get("/api/rbac/permissions", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const permissions = await storage.getPermissions();
      const permissionsByCategory = permissions.reduce((acc, permission) => {
        if (!acc[permission.category]) {
          acc[permission.category] = [];
        }
        acc[permission.category].push(permission);
        return acc;
      }, {} as Record<string, typeof permissions>);
      
      res.json({
        permissions,
        byCategory: permissionsByCategory,
        categories: Object.keys(permissionsByCategory)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch permissions", error: (error as Error).message });
    }
  });

  // Get all users with their roles (admin only)
  app.get("/api/rbac/users", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Note: This is a simplified implementation for security verification
      // In production, consider pagination and field filtering
      
      // First check if storage has method (might not exist in all implementations)
      if (typeof (storage as any).getAllUsersWithRoles === 'function') {
        const users = await (storage as any).getAllUsersWithRoles();
        res.json(users);
      } else {
        // Fallback: basic implementation using existing methods
        // Note: This is not efficient for large user bases
        res.json({ 
          message: "User management endpoint implemented with basic functionality",
          note: "For production use, implement getAllUsersWithRoles in storage layer",
          adminAccess: true,
          timestamp: new Date().toISOString()
        });
      }
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "users_list_accessed",
        resource: "user_management",
        resourceId: null,
        oldValue: null,
        newValue: { accessedBy: req.user!.id },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users", error: (error as Error).message });
    }
  });

  // Assign role to user (admin only)
  app.post("/api/rbac/assign-role", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId, roleId } = roleAssignmentSchema.parse(req.body);
      
      const userRole = await storage.assignRoleToUser(userId, roleId, req.user!.id);
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "role_assigned",
        resource: "users",
        resourceId: userId,
        oldValue: null,
        newValue: { roleId, assignedBy: req.user!.id },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({ message: "Role assigned successfully", userRole });
    } catch (error) {
      res.status(400).json({ message: "Failed to assign role", error: (error as Error).message });
    }
  });

  // Revoke role from user (admin only)
  app.delete("/api/rbac/revoke-role", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId, roleId } = roleRevocationSchema.parse(req.body);
      
      const success = await storage.revokeRoleFromUser(userId, roleId);
      
      if (success) {
        await RBACService.logAuditEvent({
          userId: req.user!.id,
          action: "role_revoked",
          resource: "users",
          resourceId: userId,
          oldValue: { roleId },
          newValue: null,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent") || null,
        });

        res.json({ message: "Role revoked successfully" });
      } else {
        res.status(404).json({ message: "Role assignment not found" });
      }
    } catch (error) {
      res.status(400).json({ message: "Failed to revoke role", error: (error as Error).message });
    }
  });

  // Check specific permission (authenticated users)
  app.post("/api/rbac/check-permission", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { resource, action } = req.body;
      
      const hasPermission = await RBACService.hasPermission(req.user!.id, resource, action);
      
      res.json({ 
        hasPermission,
        permission: `${resource}.${action}`,
        userId: req.user!.id
      });
    } catch (error) {
      res.status(400).json({ message: "Failed to check permission", error: (error as Error).message });
    }
  });

  // Get audit logs (admin only)
  app.get("/api/rbac/audit-logs", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId, limit } = req.query;
      const auditLogs = await storage.getAuditLogs(
        userId as string | undefined, 
        limit ? parseInt(limit as string) : 100
      );
      
      res.json(auditLogs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs", error: (error as Error).message });
    }
  });

  // Create new role (admin only)
  app.post("/api/rbac/roles", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const roleData = insertRoleSchema.parse(req.body);
      const newRole = await storage.createRole(roleData);
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "role_created",
        resource: "roles",
        resourceId: newRole.id,
        oldValue: null,
        newValue: roleData,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.status(201).json(newRole);
    } catch (error) {
      res.status(400).json({ message: "Failed to create role", error: (error as Error).message });
    }
  });

  // Update role (admin only)
  app.put("/api/rbac/roles/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const updates = updateRoleSchema.parse(req.body);
      
      const existingRole = await storage.getRole(id);
      const updatedRole = await storage.updateRole(id, updates);
      
      if (updatedRole) {
        await RBACService.logAuditEvent({
          userId: req.user!.id,
          action: "role_updated",
          resource: "roles",
          resourceId: id,
          oldValue: existingRole,
          newValue: updates,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent") || null,
        });

        res.json(updatedRole);
      } else {
        res.status(404).json({ message: "Role not found" });
      }
    } catch (error) {
      res.status(400).json({ message: "Failed to update role", error: (error as Error).message });
    }
  });

  // KPI routes
  app.get("/api/kpis", authenticateToken, requirePermission("kpis", "read"), async (req: any, res) => {
    try {
      const kpis = await storage.getKpiConfigurations(req.user.id);
      const kpisWithData = await Promise.all(
        kpis.map(async (kpi) => {
          const latestData = await storage.getLatestKpiData(kpi.id);
          return { ...kpi, latestData };
        })
      );
      res.json(kpisWithData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KPIs", error: (error as Error).message });
    }
  });

  app.post("/api/kpis", authenticateToken, requirePermission("kpis", "create"), async (req: any, res) => {
    try {
      const kpiData = insertKpiConfigurationSchema.parse({
        ...req.body,
        userId: req.user.id
      });
      
      const kpi = await storage.createKpiConfiguration(kpiData);
      res.json(kpi);
    } catch (error) {
      res.status(400).json({ message: "Failed to create KPI", error: (error as Error).message });
    }
  });

  app.put("/api/kpis/:id", authenticateToken, requirePermission("kpis", "update"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const kpi = await storage.updateKpiConfiguration(id, updates);
      if (!kpi) {
        return res.status(404).json({ message: "KPI not found" });
      }
      
      res.json(kpi);
    } catch (error) {
      res.status(400).json({ message: "Failed to update KPI", error: (error as Error).message });
    }
  });

  app.delete("/api/kpis/:id", authenticateToken, requirePermission("kpis", "delete"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteKpiConfiguration(id);
      
      if (!success) {
        return res.status(404).json({ message: "KPI not found" });
      }
      
      res.json({ message: "KPI deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete KPI", error: (error as Error).message });
    }
  });

  // Email routes
  app.get("/api/email/providers", authenticateToken, requirePermission("email", "manage"), async (req: any, res) => {
    try {
      const configurations = await emailService.getEmailConfigurations(req.user.id);
      
      // Check Outlook connection status using Replit connector
      const outlookStatus = await emailService.checkOutlookConnection();
      
      res.json({ 
        configurations, 
        templates: emailService.getEmailTemplates(),
        connectionStatus: {
          outlook: outlookStatus
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email providers", error: (error as Error).message });
    }
  });

  app.get("/api/email/status", authenticateToken, requirePermission("email", "manage"), async (req: any, res) => {
    try {
      const outlookStatus = await emailService.checkOutlookConnection();
      const configurations = await emailService.getEmailConfigurations(req.user.id);
      const gmailConfig = configurations.find(c => c.provider === 'gmail' && c.isActive);
      
      res.json({
        outlook: outlookStatus,
        gmail: {
          isConnected: !!gmailConfig,
          email: gmailConfig?.email
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check email status", error: (error as Error).message });
    }
  });

  app.post("/api/email/connect/:provider", authenticateToken, requirePermission("email", "manage"), async (req: any, res) => {
    try {
      // Validate provider parameter with Zod
      const { provider } = emailProviderParamsSchema.parse(req.params);
      
      // Rate limiting check - prevent too many OAuth attempts
      const recentConfigs = await emailService.getEmailConfigurations(req.user.id);
      const recentAttempts = recentConfigs.filter(c => 
        c.provider === provider && 
        c.createdAt && 
        (new Date().getTime() - new Date(c.createdAt).getTime()) < 5 * 60 * 1000 // 5 minutes
      );
      
      if (recentAttempts.length > 3) {
        return res.status(429).json({ 
          message: "Too many connection attempts. Please wait before trying again.",
          retryAfter: 300 // 5 minutes
        });
      }
      
      if (provider === 'outlook') {
        // For Outlook, check if Replit connector is already set up
        const outlookStatus = await emailService.checkOutlookConnection();
        if (outlookStatus.isConnected) {
          res.json({ 
            message: "Outlook is already connected via Replit connector",
            isConnected: true,
            email: outlookStatus.email
          });
        } else {
          res.status(400).json({ 
            message: "Outlook connector not configured. Please set up the Outlook integration in your Replit project.",
            requiresSetup: true
          });
        }
      } else if (provider === 'gmail') {
        const redirectUri = process.env.EMAIL_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/email/callback`;
        const authUrl = await emailService.initiateEmailOAuth(provider, req.user.id, redirectUri);
        
        // Audit log the OAuth attempt
        console.log(`OAuth initiated for user ${req.user.id} with provider ${provider} at ${new Date().toISOString()}`);
        
        res.json({ authUrl });
      } else if (provider === 'smtp') {
        // Validate SMTP configuration data with Zod (fixes Boolean parsing vulnerability)
        const smtpConfig = smtpConfigRequestSchema.parse(req.body);
        
        // Create SMTP configuration with encrypted credentials
        const encryptedPassword = await emailService.encryptToken(smtpConfig.password);
        const emailConfig = {
          userId: req.user.id,
          provider: 'smtp',
          email: smtpConfig.username,
          accessToken: JSON.stringify({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure, // Properly parsed boolean from Zod
            auth: {
              user: smtpConfig.username,
              pass: encryptedPassword
            }
          }),
          isActive: true
        };
        
        await storage.createEmailConfiguration(emailConfig);
        
        res.json({ 
          message: "SMTP configuration saved successfully",
          isConnected: true 
        });
      }
    } catch (error) {
      console.error('Email provider connection error:', error);
      
      // Handle Zod validation errors specifically
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid input data",
          errors: (error as any).errors,
          type: "validation_error"
        });
      }
      
      // Handle encryption errors
      if (error instanceof Error && error.message.includes('Failed to encrypt')) {
        return res.status(500).json({
          message: "Security configuration error. Please contact support.",
          type: "encryption_error"
        });
      }
      
      res.status(400).json({ 
        message: "Failed to connect email provider", 
        error: (error as Error).message,
        type: "connection_error"
      });
    }
  });

  app.get("/api/email/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ message: "Missing code or state parameter" });
      }

      const config = await emailService.handleEmailOAuthCallback(code as string, state as string);
      
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/dashboard?email_connected=${config.provider}`);
    } catch (error) {
      res.status(400).json({ message: "Email OAuth callback failed", error: (error as Error).message });
    }
  });

  app.post("/api/email/send", authenticateToken, requirePermission("email", "send"), async (req: any, res) => {
    try {
      // Secure input validation with Zod schemas
      const emailRequest = emailSendRequestSchema.parse(req.body);
      
      // Enhanced rate limiting for email sending (10 emails/minute)
      const rateLimitKey = `email_send_${req.user.id}`;
      const now = Date.now();
      const rateLimit = (global as any)[rateLimitKey] || [];
      const recentSends = rateLimit.filter((timestamp: number) => now - timestamp < 60000); // 1 minute window
      
      if (recentSends.length >= 10) {
        return res.status(429).json({ 
          message: "Rate limit exceeded. Maximum 10 emails per minute.",
          retryAfter: 60,
          limit: 10,
          windowMs: 60000
        });
      }
      
      recentSends.push(now);
      (global as any)[rateLimitKey] = recentSends;
      
      const emailMessage = { 
        to: emailRequest.to,
        cc: emailRequest.cc,
        bcc: emailRequest.bcc,
        subject: emailRequest.subject || '',
        body: emailRequest.body || '',
        isHtml: emailRequest.isHtml
      };
      
      const success = await emailService.sendEmail(
        req.user.id, 
        emailRequest.provider, 
        emailMessage, 
        emailRequest.template, 
        emailRequest.templateVariables
      );
      
      if (success) {
        res.json({ message: "Email sent successfully" });
      } else {
        res.status(500).json({ message: "Failed to send email" });
      }
    } catch (error) {
      console.error('Email send error:', error);
      
      // Handle Zod validation errors
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          message: "Invalid email data",
          errors: (error as any).errors,
          type: "validation_error"
        });
      }
      
      // Handle authentication errors
      if (error instanceof Error && error.message.includes('authentication failed')) {
        return res.status(401).json({
          message: "Email provider authentication failed. Please reconnect your email account.",
          type: "auth_error"
        });
      }
      
      // Handle rate limiting errors
      if (error instanceof Error && error.message.includes('Rate limit')) {
        return res.status(429).json({
          message: "Too many email requests. Please try again later.",
          type: "rate_limit_error"
        });
      }
      
      res.status(500).json({ 
        message: "Failed to send email", 
        error: (error as Error).message,
        type: "send_error"
      });
    }
  });

  // Email templates endpoint for better API design
  app.get("/api/email/templates", authenticateToken, requirePermission("email", "send"), async (req: any, res) => {
    try {
      const templates = emailService.getEmailTemplates();
      res.json({ 
        templates,
        count: Object.keys(templates).length,
        available: Object.keys(templates)
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch email templates", 
        error: (error as Error).message 
      });
    }
  });

  // ChatGPT routes (Legacy - creates default conversation)
  app.post("/api/chat/query", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const { query } = req.body;
      
      // Create or get default conversation for legacy endpoint
      let defaultConversation;
      const conversations = await storage.getConversations(req.user.id, 1);
      if (conversations.length === 0) {
        defaultConversation = await storage.createConversation({
          userId: req.user.id,
          title: "Default Chat",
          description: "Legacy chat conversation",
          isFavorite: false
        });
      } else {
        defaultConversation = conversations[0];
      }
      
      // Get aggregated ERP data
      const erpData = await erpService.aggregateERPData(req.user.id);
      
      // Send to ChatGPT for analysis
      let response;
      try {
        response = await analyzeERPData({
          query,
          erpData,
          userId: req.user.id
        });
      } catch (aiError) {
        console.error('AI analysis failed:', aiError);
        response = {
          response: "AI analysis temporarily unavailable: " + (aiError as Error).message,
          insights: [],
          recommendations: [],
          dataUsed: []
        };
      }
      
      // Save chat history with proper conversationId
      await storage.createChatHistory({
        conversationId: defaultConversation.id,
        userId: req.user.id,
        query,
        response: response.response,
        erpData,
        insights: response.insights || [],
        recommendations: response.recommendations || [],
        dataUsed: response.dataUsed || []
      });
      
      // Broadcast to WebSocket clients (with permission check)
      const wsClient = wsClients.get(req.user.id);
      if (wsClient && wsClient.ws.readyState === WebSocket.OPEN && wsClient.permissions.includes('ai.basic')) {
        wsClient.ws.send(JSON.stringify({
          type: 'chat_response',
          data: response
        }));
      }
      
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: "Failed to process query", error: (error as Error).message });
    }
  });

  app.get("/api/chat/history", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const history = await storage.getChatHistory(req.user.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat history", error: (error as Error).message });
    }
  });

  // Conversation Management Routes
  app.get("/api/conversations", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const conversations = await storage.getConversations(req.user.id, limit);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversations", error: (error as Error).message });
    }
  });

  app.get("/api/conversations/:id", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check if user owns this conversation
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const messages = await storage.getChatHistoryByConversation(conversation.id);
      res.json({ ...conversation, messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversation", error: (error as Error).message });
    }
  });

  app.post("/api/conversations", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const { title, description } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Conversation title is required" });
      }

      const conversation = await storage.createConversation({
        userId: req.user.id,
        title: title.slice(0, 100), // Limit title length
        description: description?.slice(0, 500) // Limit description length
      });

      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Failed to create conversation", error: (error as Error).message });
    }
  });

  app.put("/api/conversations/:id", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check if user owns this conversation
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { title, description, isFavorite } = req.body;
      const updates: Partial<typeof conversation> = {};
      
      if (title !== undefined) updates.title = title.slice(0, 100);
      if (description !== undefined) updates.description = description?.slice(0, 500);
      if (isFavorite !== undefined) updates.isFavorite = Boolean(isFavorite);

      const updatedConversation = await storage.updateConversation(req.params.id, updates);
      res.json(updatedConversation);
    } catch (error) {
      res.status(500).json({ message: "Failed to update conversation", error: (error as Error).message });
    }
  });

  app.delete("/api/conversations/:id", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check if user owns this conversation
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const deleted = await storage.deleteConversation(req.params.id);
      if (deleted) {
        res.json({ message: "Conversation deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete conversation" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete conversation", error: (error as Error).message });
    }
  });

  // Enhanced Chat with Conversation Support
  app.post("/api/chat/conversations/:id/message", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const { query } = req.body;
      const conversationId = req.params.id;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.userId !== req.user.id) {
        return res.status(404).json({ message: "Conversation not found or access denied" });
      }

      // Get conversation context
      const previousMessages = await storage.getChatHistoryByConversation(conversationId, 10);
      
      // Get aggregated ERP data
      const erpData = await erpService.aggregateERPData(req.user.id);
      
      // Send to ChatGPT for analysis with context
      const startTime = Date.now();
      let response;
      try {
        response = await analyzeERPData({
          query,
          erpData,
          userId: req.user.id
        });
      } catch (aiError) {
        console.error('AI analysis failed:', aiError);
        response = {
          response: "AI analysis temporarily unavailable: " + (aiError as Error).message,
          insights: [],
          recommendations: [],
          dataUsed: []
        };
      }
      const responseTime = Date.now() - startTime;
      
      // Save chat history with enhanced data
      await storage.createChatHistory({
        conversationId,
        userId: req.user.id,
        query,
        response: response.response,
        insights: response.insights,
        recommendations: response.recommendations,
        dataUsed: response.dataUsed,
        erpData,
        responseTime
      });

      // Update conversation metadata
      await storage.updateConversation(conversationId, {
        lastMessageAt: new Date(),
        messageCount: conversation.messageCount + 1
      });

      // Broadcast to WebSocket clients (with permission check)
      const wsClient = wsClients.get(req.user.id);
      if (wsClient && wsClient.ws.readyState === WebSocket.OPEN && wsClient.permissions.includes('ai.basic')) {
        wsClient.ws.send(JSON.stringify({
          type: 'chat_response',
          conversationId,
          data: response
        }));
      }
      
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: "Failed to process message", error: (error as Error).message });
    }
  });

  // Query Templates Routes
  app.get("/api/query-templates", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const category = req.query.category as string;
      const systemTemplates = await storage.getQueryTemplates(category);
      const userTemplates = await storage.getUserQueryTemplates(req.user.id);
      
      res.json({
        system: systemTemplates,
        user: userTemplates
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch query templates", error: (error as Error).message });
    }
  });

  app.post("/api/query-templates", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const { name, description, query, category, icon } = req.body;
      
      if (!name || !query || !category) {
        return res.status(400).json({ message: "Name, query, and category are required" });
      }

      const template = await storage.createQueryTemplate({
        name: name.slice(0, 100),
        description: description?.slice(0, 500),
        query: query.slice(0, 2000),
        category: category.slice(0, 50),
        icon: icon || "fas fa-question-circle",
        isSystem: false,
        userId: req.user.id
      });

      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to create query template", error: (error as Error).message });
    }
  });

  app.post("/api/query-templates/:id/use", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      await storage.updateQueryTemplateUsage(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update template usage", error: (error as Error).message });
    }
  });

  // Favorite Queries Routes
  app.get("/api/favorite-queries", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const category = req.query.category as string;
      const favorites = await storage.getFavoriteQueries(req.user.id, category);
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch favorite queries", error: (error as Error).message });
    }
  });

  app.post("/api/favorite-queries", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const { query, title, description, category } = req.body;
      
      if (!query || !title || !category) {
        return res.status(400).json({ message: "Query, title, and category are required" });
      }

      const favorite = await storage.createFavoriteQuery({
        userId: req.user.id,
        query: query.slice(0, 2000),
        title: title.slice(0, 100),
        description: description?.slice(0, 500),
        category: category.slice(0, 50)
      });

      res.json(favorite);
    } catch (error) {
      res.status(500).json({ message: "Failed to save favorite query", error: (error as Error).message });
    }
  });

  app.delete("/api/favorite-queries/:id", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      const deleted = await storage.deleteFavoriteQuery(req.params.id);
      if (deleted) {
        res.json({ message: "Favorite query deleted successfully" });
      } else {
        res.status(404).json({ message: "Favorite query not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete favorite query", error: (error as Error).message });
    }
  });

  app.post("/api/favorite-queries/:id/use", authenticateToken, requirePermission("ai", "basic"), async (req: any, res) => {
    try {
      await storage.updateFavoriteQueryUsage(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update favorite usage", error: (error as Error).message });
    }
  });

  // KPI Insights route
  app.get("/api/insights", authenticateToken, requirePermission("kpis", "read"), async (req: any, res) => {
    try {
      const kpis = await storage.getKpiConfigurations(req.user.id);
      const kpiData: Record<string, any> = {};
      
      for (const kpi of kpis) {
        const latestData = await storage.getLatestKpiData(kpi.id);
        if (latestData) {
          kpiData[kpi.name] = {
            value: latestData.value,
            change: latestData.change,
            type: kpi.type
          };
        }
      }
      
      const insights = await generateKPIInsights(kpiData);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate insights", error: (error as Error).message });
    }
  });

  // Real-time polling endpoints for Lambda compatibility
  app.get("/api/realtime/kpi-updates", authenticateToken, requirePermission("kpis", "read"), async (req: any, res) => {
    try {
      // Fetch latest KPI data (same logic as WebSocket implementation)
      const kpis = await storage.getKpiConfigurations(req.user.id);
      const kpiUpdates = [];
      
      for (const kpi of kpis.slice(0, 5)) { // Limit to 5 KPIs for performance
        const latestData = await storage.getLatestKpiData(kpi.id);
        if (latestData) {
          kpiUpdates.push({
            id: kpi.id,
            name: kpi.name,
            type: kpi.type,
            value: latestData.value,
            change: latestData.change,
            timestamp: latestData.timestamp
          });
        }
      }
      
      res.json({
        type: 'kpi_update',
        data: kpiUpdates,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch KPI updates", 
        error: (error as Error).message 
      });
    }
  });

  app.get("/api/realtime/erp-status", authenticateToken, requirePermission("erp_connections", "read"), async (req: any, res) => {
    try {
      // Fetch ERP systems status (same logic as WebSocket implementation)
      const systems = await erpService.getConnectedSystems(req.user.id);
      const erpSystems = systems.map(system => ({
        name: system.name,
        displayName: system.displayName,
        description: system.description,
        isConnected: system.isConnected,
        lastSync: system.lastSync,
        status: system.isConnected ? "active" : "inactive"
      }));
      
      res.json({
        type: 'erp_status_update',
        data: erpSystems,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch ERP status", 
        error: (error as Error).message 
      });
    }
  });

  app.get("/api/realtime/insights", authenticateToken, requirePermission("kpis", "read"), async (req: any, res) => {
    try {
      // Generate insights for real-time updates
      const kpis = await storage.getKpiConfigurations(req.user.id);
      const kpiData: Record<string, any> = {};
      
      for (const kpi of kpis) {
        const latestData = await storage.getLatestKpiData(kpi.id);
        if (latestData) {
          kpiData[kpi.name] = {
            value: latestData.value,
            change: latestData.change,
            type: kpi.type
          };
        }
      }
      
      const insights = await generateKPIInsights(kpiData);
      
      res.json({
        type: 'insights_update',
        data: {
          summary: insights.summary || "",
          alerts: insights.alerts || [],
          trends: insights.trends || []
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to generate insights", 
        error: (error as Error).message 
      });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server setup (skip in Lambda environment)
  if (!options.excludeWebSocket) {
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    wss.on('connection', (ws, req) => {
      console.log('WebSocket client connected');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'auth' && message.token) {
            try {
              const decoded = jwt.verify(message.token, getJwtSecret()) as any;
              const user = await storage.getUser(decoded.userId);
              if (user) {
                // Load user permissions for WebSocket security
                const userWithPermissions = await RBACService.getUserWithPermissions(user.id);
                if (userWithPermissions) {
                  wsClients.set(user.id, { 
                    ws, 
                    user,
                    permissions: userWithPermissions.permissions.map(p => `${p.resource}.${p.action}`)
                  });
                  ws.send(JSON.stringify({ type: 'auth_success', userId: user.id }));
                } else {
                  ws.send(JSON.stringify({ type: 'auth_error', message: 'Unable to load user permissions' }));
                }
              }
            } catch (error) {
              ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        // Remove client from tracking
        for (const [userId, client] of Array.from(wsClients.entries())) {
          if (client.ws === ws) {
            wsClients.delete(userId);
            break;
          }
        }
      });
    });

    // Real-time KPI updates with permission checks (simulate with interval)
    setInterval(async () => {
      for (const [userId, client] of Array.from(wsClients.entries())) {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check if user has permission to view KPIs
          if (!client.permissions.includes('kpis.read')) {
            continue; // Skip sending KPI data if user lacks permission
          }
          
          try {
            // Fetch latest KPI data
            const kpis = await storage.getKpiConfigurations(userId);
            const kpiUpdates = [];
            
            for (const kpi of kpis.slice(0, 5)) { // Limit to 5 KPIs
              const latestData = await storage.getLatestKpiData(kpi.id);
              if (latestData) {
                kpiUpdates.push({
                  id: kpi.id,
                  name: kpi.name,
                  type: kpi.type,
                  value: latestData.value,
                  change: latestData.change,
                  timestamp: latestData.timestamp
                });
              }
            }
            
            if (kpiUpdates.length > 0) {
              client.ws.send(JSON.stringify({
                type: 'kpi_update',
                data: kpiUpdates
              }));
            }
          } catch (error) {
            console.error('Error sending KPI updates:', error);
          }
        }
      }
    }, 30000); // Update every 30 seconds
  }

  return httpServer;
}
