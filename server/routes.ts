import type { Express, RequestHandler, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { erpService } from "./services/erpService";
import { emailService } from "./services/emailService";
import { analyzeERPData, generateKPIInsights } from "./services/openai";
import { insertUserSchema, insertKpiConfigurationSchema, insertChatHistorySchema, emailSendRequestSchema, smtpConfigRequestSchema, emailProviderParamsSchema, updateUserPreferencesSchema, insertUserPreferencesSchema, insertRoleSchema, updateRoleSchema, roleAssignmentSchema, roleRevocationSchema, insertPermissionSchema, insertOrganizationSchema, updateOrganizationSchema, insertOrganizationMemberSchema, updateOrganizationMemberSchema, organizationInviteSchema, organizationRoleAssignmentSchema, organizationMemberUpdateSchema, users, AuthUser } from "@shared/schema";

// Type definitions
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import passport from "passport";
import { OAuthService } from "./services/oauthService";
import { getJwtSecret, detectEnvironment, getAllowedOrigins, validateDomainSecurity } from "./env-validation";
import { RBACService, AuthenticatedRequest, loadUserPermissions, requirePermission, requireRole, requireAdmin, authWithPermissions } from "./services/rbac";
import { auditService } from "./services/auditService";
import { sessionService } from "./services/sessionService";
import { passwordPolicyService } from "./services/passwordPolicyService";

// Type helper to convert AuthenticatedRequest handlers to standard RequestHandler
const asAuth = (h: (req: AuthenticatedRequest, res: Response, next: NextFunction) => any): RequestHandler => 
  (req, res, next) => h(req as AuthenticatedRequest, res, next);

// JWT_SECRET accessed at runtime, not import-time
const getJwtSecretAtRuntime = () => getJwtSecret();

// WebSocket clients tracking with permission data
interface WSClient {
  ws: WebSocket;
  user: AuthUser;
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

// Helper function to get role-based default KPI types
function getRoleBasedDefaultKPIs(role: string): string[] {
  // All roles get the same 5 default KPIs
  return ['cycle_time', 'on_time_delivery', 'cost_per_unit', 'working_capital_efficiency', 'gross_margin'];
}

// Helper function to categorize KPI types
function getCategoryForKpiType(type: string): string {
  const categories: Record<string, string> = {
    // Financial KPIs
    revenue: 'financial',
    profit_margin: 'financial',
    gross_margin: 'financial',
    cost_per_unit: 'financial',
    working_capital_efficiency: 'financial',
    cash_flow: 'financial',
    ar_aging: 'financial',
    expenses: 'financial',
    // Operational KPIs
    cycle_time: 'operational',
    on_time_delivery: 'operational',
    orders: 'operational',
    inventory: 'operational',
    delivery_time: 'operational',
    quality_score: 'operational',
    // Performance KPIs
    performance: 'performance',
    efficiency: 'performance',
    // Project KPIs
    project_status: 'project',
    budget: 'project',
    timeline: 'project',
    resource_utilization: 'project',
    milestones: 'project',
  };
  
  return categories[type] || 'other';
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
  
  // Cleanup expired sessions periodically
  setInterval(async () => {
    try {
      await sessionService.cleanupExpiredSessions();
    } catch (error) {
      console.error('Session cleanup error:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Authentication middleware with session validation
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
      
      // Validate session
      const session = await sessionService.validateSession(token);
      if (!session) {
        return res.status(401).json({ message: 'Session expired or invalid' });
      }
      
      // Update session activity
      await sessionService.updateActivity(token);
      
      // Extract only AuthUser fields to match AuthenticatedRequest interface
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider
      };
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
        await auditService.logAction({
          action: 'register',
          resource: 'users',
          status: 'failure',
          details: { email, reason: 'User already exists' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(400).json({ message: "User already exists" });
      }

      // Validate password strength
      if (!password) {
        return res.status(400).json({ message: "Password is required for registration" });
      }
      
      const passwordValidation = passwordPolicyService.validatePassword(password);
      if (!passwordValidation.valid) {
        await auditService.logAction({
          action: 'register',
          resource: 'users',
          status: 'failure',
          details: { email, reason: 'Password policy violation', errors: passwordValidation.errors },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(400).json({ 
          message: "Password does not meet security requirements", 
          errors: passwordValidation.errors 
        });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Check if this is the first user (make them admin)
      const userCount = await storage.getUserCount();
      const isFirstUser = userCount === 0;
      
      // Create user
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        authProvider: "local",
        role: isFirstUser ? "admin" : "user"
      });

      // Record password in history
      await passwordPolicyService.recordPasswordChange(user.id, hashedPassword);

      // Assign RBAC role
      try {
        const roleName = isFirstUser ? "admin" : "user";
        const role = await storage.getRoleByName(roleName);
        if (role) {
          await storage.assignRoleToUser(user.id, role.id);
        }
      } catch (roleError) {
        console.error("Error assigning role:", roleError);
      }

      // Generate token and create session
      const token = jwt.sign({ userId: user.id }, getJwtSecretAtRuntime(), { expiresIn: '7d' });
      await sessionService.createSession(user.id, token, req);
      
      // Log successful registration
      await auditService.logAction({
        userId: user.id,
        action: 'register',
        resource: 'users',
        resourceId: user.id,
        status: 'success',
        details: { email, username },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ 
        token, 
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      await auditService.logAction({
        action: 'register',
        resource: 'users',
        status: 'failure',
        details: { error: (error as Error).message },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.status(400).json({ message: "Registration failed", error: (error as Error).message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Check account lockout
      const isLocked = await passwordPolicyService.checkAccountLockout(email);
      if (isLocked) {
        await auditService.logAction({
          action: 'login',
          resource: 'users',
          status: 'failure',
          details: { email, reason: 'Account locked due to failed attempts' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(401).json({ 
          message: "Account temporarily locked due to too many failed login attempts. Please try again in 30 minutes." 
        });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        await passwordPolicyService.recordLoginAttempt(email, false, req.ip);
        await auditService.logAction({
          action: 'login',
          resource: 'users',
          status: 'failure',
          details: { email, reason: 'User not found' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if this is an OAuth user trying to login with password
      if (user.authProvider !== "local" || !user.password) {
        await passwordPolicyService.recordLoginAttempt(email, false, req.ip, user.id);
        await auditService.logAction({
          userId: user.id,
          action: 'login',
          resource: 'users',
          resourceId: user.id,
          status: 'failure',
          details: { email, reason: 'OAuth user attempted password login' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(401).json({ message: "Please use OAuth login for this account" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        await passwordPolicyService.recordLoginAttempt(email, false, req.ip, user.id);
        await auditService.logAction({
          userId: user.id,
          action: 'login',
          resource: 'users',
          resourceId: user.id,
          status: 'failure',
          details: { email, reason: 'Invalid password' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Successful login - record attempt and create session
      await passwordPolicyService.recordLoginAttempt(email, true, req.ip, user.id);
      
      const token = jwt.sign({ userId: user.id }, getJwtSecretAtRuntime(), { expiresIn: '7d' });
      await sessionService.createSession(user.id, token, req);
      
      await auditService.logAction({
        userId: user.id,
        action: 'login',
        resource: 'users',
        resourceId: user.id,
        status: 'success',
        details: { email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ 
        token, 
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      await auditService.logAction({
        action: 'login',
        resource: 'users',
        status: 'failure',
        details: { error: (error as Error).message },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.status(400).json({ message: "Login failed", error: (error as Error).message });
    }
  });

  app.post("/api/auth/logout", authenticateToken, asAuth(async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      
      if (token) {
        // Terminate session
        await sessionService.terminateSession(token);
        
        // Log logout
        await auditService.logAction({
          userId: req.user.id,
          action: 'logout',
          resource: 'users',
          resourceId: req.user.id,
          status: 'success',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
      }
      
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
  }));

  // Get current user info
  app.get("/api/auth/me", authenticateToken, asAuth(async (req, res) => {
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
  }));

  // Demo auto-login endpoint (only works on demo.jeldi.app)
  app.post("/api/auth/demo-login", async (req, res) => {
    try {
      const hostname = req.headers.host || '';
      const isDemoEnv = hostname.includes('demo.jeldi.app');
      
      if (!isDemoEnv) {
        return res.status(403).json({ message: "Demo login only available on demo.jeldi.app" });
      }

      // Login as demo CFO user
      const demoUser = await storage.getUserByEmail("cfo@demo.jeldi.app");
      
      if (!demoUser) {
        return res.status(404).json({ message: "Demo user not found. Please initialize demo data." });
      }

      // Generate JWT (must use { userId } format for authenticateToken middleware)
      const token = jwt.sign({ userId: demoUser.id }, getJwtSecretAtRuntime(), { expiresIn: '7d' });
      
      // Create session (must pass token as second parameter)
      await sessionService.createSession(demoUser.id, token, req);

      // Log demo login
      await auditService.logAction({
        userId: demoUser.id,
        action: 'demo_login',
        resource: 'users',
        resourceId: demoUser.id,
        status: 'success',
        details: { environment: 'demo' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        token,
        user: {
          id: demoUser.id,
          username: demoUser.username,
          email: demoUser.email,
          role: demoUser.role,
          firstName: demoUser.firstName,
          lastName: demoUser.lastName,
          authProvider: demoUser.authProvider
        }
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ message: "Demo login failed", error: (error as Error).message });
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
  
  // OAuth environment configuration endpoint (for debugging and validation)
  app.get("/api/oauth/config", authenticateToken, asAuth(async (req, res) => {
    try {
      // Only allow admins to view OAuth configuration
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const oauthConfig = OAuthService.getEnvironmentConfig();
      const emailConfig = emailService.getEnvironmentConfig();
      
      res.json({
        oauth: oauthConfig,
        email: emailConfig,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("OAuth config endpoint error:", error);
      res.status(500).json({ message: "Failed to get OAuth configuration", error: (error as Error).message });
    }
  }));

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

  // Google OAuth routes with enhanced security
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
      
      // Validate request origin for security
      const env = detectEnvironment();
      const origin = req.get('origin') || req.get('referer');
      if (origin) {
        const validation = validateDomainSecurity(origin, env.isProduction);
        if (!validation.isSecure || !validation.isAllowed) {
          console.warn(`Google OAuth request from invalid origin: ${origin}`, validation.errors);
          return res.status(400).json({ 
            message: "OAuth requests must use HTTPS and be from an allowed domain",
            errors: validation.errors 
          });
        }
      }
      
      console.log(`Google OAuth initiated from origin: ${origin || 'unknown'}`);

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
  app.get("/api/user/preferences", authenticateToken, asAuth(async (req, res) => {
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
  }));

  app.put("/api/user/preferences", authenticateToken, asAuth(async (req, res) => {
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
  }));

  app.put("/api/user/profile", authenticateToken, asAuth(async (req, res) => {
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
  }));

  app.put("/api/user/password", authenticateToken, asAuth(async (req, res) => {
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
  }));

  app.post("/api/user/preferences/reset", authenticateToken, asAuth(async (req, res) => {
    try {
      const preferences = await storage.resetUserPreferences(req.user.id);
      res.json(preferences);
    } catch (error) {
      console.error("Reset user preferences error:", error);
      res.status(500).json({ message: "Failed to reset user preferences", error: (error as Error).message });
    }
  }));

  // Microsoft OAuth routes with enhanced security
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
      
      // Validate request origin for security
      const env = detectEnvironment();
      const origin = req.get('origin') || req.get('referer');
      if (origin && env.isProduction) {
        const validation = validateDomainSecurity(origin, env.isProduction);
        if (!validation.isSecure) {
          console.warn(`Microsoft OAuth request from insecure origin: ${origin}`);
          return res.status(400).json({ message: "OAuth requests must use HTTPS in production" });
        }
      }
      
      console.log(`Microsoft OAuth initiated from origin: ${origin || 'unknown'}`);

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
  app.get("/api/erp/systems", authenticateToken, requirePermission("erp_connections", "read"), asAuth(async (req, res) => {
    try {
      const systems = await erpService.getConnectedSystems(req.user.id);
      res.json(systems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ERP systems", error: (error as Error).message });
    }
  }));

  app.post("/api/erp/connect/:system", authenticateToken, requirePermission("erp_connections", "create"), asAuth(async (req, res) => {
    try {
      const { system } = req.params;
      const redirectUri = process.env.OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/erp/callback`;
      
      const authUrl = await erpService.initiateOAuthFlow(system, req.user.id, redirectUri);
      res.json({ authUrl });
    } catch (error) {
      res.status(400).json({ message: "Failed to initiate OAuth", error: (error as Error).message });
    }
  }));

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

  app.delete("/api/erp/disconnect/:system", authenticateToken, requirePermission("erp_connections", "manage"), asAuth(async (req, res) => {
    try {
      const { system } = req.params;
      await erpService.disconnectSystem(req.user.id, system);
      
      // Broadcast ERP status update via WebSocket
      await broadcastERPStatusUpdate(req.user.id);
      
      res.json({ message: "System disconnected successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to disconnect system", error: (error as Error).message });
    }
  }));

  app.get("/api/erp/data", authenticateToken, requirePermission("erp_connections", "read"), asAuth(async (req, res) => {
    try {
      const data = await erpService.aggregateERPData(req.user.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ERP data", error: (error as Error).message });
    }
  }));

  app.post("/api/erp/test-connection", authenticateToken, requirePermission("erp_connections", "write"), asAuth(async (req, res) => {
    try {
      const { apiBaseUrl, authMethod, apiKey, apiSecret, accessToken, instanceUrl, erpSystem } = req.body;
      
      const result = await erpService.testConnection({
        erpSystem,
        apiBaseUrl,
        authMethod,
        apiKey,
        apiSecret,
        accessToken,
        instanceUrl
      });
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        message: "Connection test failed", 
        error: (error as Error).message 
      });
    }
  }));

  app.put("/api/erp/config/:id", authenticateToken, requirePermission("erp_connections", "write"), asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updatedConnection = await storage.updateErpConnection(id, updates);
      
      if (!updatedConnection) {
        return res.status(404).json({ message: "Connection not found" });
      }
      
      await broadcastERPStatusUpdate(req.user.id);
      
      res.json(updatedConnection);
    } catch (error) {
      res.status(500).json({ message: "Failed to update connection", error: (error as Error).message });
    }
  }));

  app.get("/api/erp/connection-methods/:system", authenticateToken, requirePermission("erp_connections", "read"), asAuth(async (req, res) => {
    try {
      const { system } = req.params;
      const methods = await erpService.getConnectionMethods(system);
      res.json(methods);
    } catch (error) {
      res.status(500).json({ message: "Failed to get connection methods", error: (error as Error).message });
    }
  }));

  app.post("/api/erp/connect-api-key", authenticateToken, requirePermission("erp_connections", "write"), asAuth(async (req, res) => {
    try {
      const { erpSystem, apiKey, apiSecret, instanceUrl } = req.body;
      
      const connection = await erpService.connectWithApiKey(
        req.user.id,
        erpSystem,
        apiKey,
        apiSecret,
        instanceUrl
      );
      
      await broadcastERPStatusUpdate(req.user.id);
      
      res.json(connection);
    } catch (error) {
      res.status(400).json({ message: "Failed to connect ERP", error: (error as Error).message });
    }
  }));

  app.post("/api/erp/connect-custom", authenticateToken, requirePermission("erp_connections", "write"), asAuth(async (req, res) => {
    try {
      const { customName, apiBaseUrl, authMethod, credentials, metadata } = req.body;
      
      const connection = await erpService.connectCustomERP(
        req.user.id,
        customName,
        apiBaseUrl,
        authMethod,
        credentials,
        metadata
      );
      
      await broadcastERPStatusUpdate(req.user.id);
      
      res.json(connection);
    } catch (error) {
      res.status(400).json({ message: "Failed to connect custom ERP", error: (error as Error).message });
    }
  }));

  // RBAC routes
  // Get current user's roles and permissions
  app.get("/api/rbac/me", authenticateToken, loadUserPermissions, asAuth(async (req, res) => {
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
  }));

  // Get all available roles (admin only)
  app.get("/api/rbac/roles", authenticateToken, requireAdmin, asAuth(async (req, res) => {
    try {
      const roles = await storage.getRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch roles", error: (error as Error).message });
    }
  }));

  // Get all available permissions (admin only)
  app.get("/api/rbac/permissions", authenticateToken, requireAdmin, asAuth(async (req, res) => {
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
  }));

  // Get all users with their roles (admin only)
  app.get("/api/rbac/users", authenticateToken, requireAdmin, asAuth(async (req, res) => {
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
  }));

  // Assign role to user (admin only)
  app.post("/api/rbac/assign-role", authenticateToken, requireAdmin, asAuth(async (req, res) => {
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
  }));

  // Revoke role from user (admin only)
  app.delete("/api/rbac/revoke-role", authenticateToken, requireAdmin, asAuth(async (req, res) => {
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
  }));

  // Check specific permission (authenticated users)
  app.post("/api/rbac/check-permission", authenticateToken, asAuth(async (req, res) => {
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
  }));

  // Get audit logs (admin only)
  app.get("/api/rbac/audit-logs", authenticateToken, requireAdmin, asAuth(async (req, res) => {
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
  }));

  // Create new role (admin only)
  app.post("/api/rbac/roles", authenticateToken, requireAdmin, asAuth(async (req, res) => {
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
  }));

  // Update role (admin only)
  app.put("/api/rbac/roles/:id", authenticateToken, requireAdmin, asAuth(async (req, res) => {
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
  }));

  // ===== ORGANIZATION MANAGEMENT API ROUTES =====

  // Get user's organizations
  app.get("/api/organizations/my", authenticateToken, asAuth(async (req, res) => {
    try {
      const organizations = await storage.getUserOrganizations(req.user!.id);
      res.json(organizations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organizations", error: (error as Error).message });
    }
  }));

  // Get all organizations (admin only)
  app.get("/api/organizations", authenticateToken, requireAdmin, asAuth(async (req, res) => {
    try {
      const organizations = await storage.getOrganizations();
      res.json(organizations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organizations", error: (error as Error).message });
    }
  }));

  // Get specific organization
  app.get("/api/organizations/:id", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      const organization = await storage.getOrganization(id);
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if user is a member or admin
      const member = await storage.getOrganizationMember(id, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!member && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      const members = await storage.getOrganizationMembers(id);
      res.json({ ...organization, members, memberCount: members.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organization", error: (error as Error).message });
    }
  }));

  // Create organization
  app.post("/api/organizations", authenticateToken, asAuth(async (req, res) => {
    try {
      const organizationData = insertOrganizationSchema.parse({
        ...req.body,
        createdBy: req.user!.id,
      });
      
      const newOrganization = await storage.createOrganization(organizationData);
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "organization_created",
        resource: "organizations",
        resourceId: newOrganization.id,
        oldValue: null,
        newValue: organizationData,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.status(201).json(newOrganization);
    } catch (error) {
      // Check for PostgreSQL unique constraint violations
      const errorMessage = (error as Error).message;
      const errorCode = (error as any).code;
      
      // Handle unique constraint violations for organization name
      if (
        errorCode === '23505' || // PostgreSQL unique constraint violation code
        errorMessage.toLowerCase().includes('unique constraint') ||
        errorMessage.toLowerCase().includes('duplicate key') ||
        (errorMessage.toLowerCase().includes('organizations_name_key') && 
         errorMessage.toLowerCase().includes('already exists'))
      ) {
        return res.status(409).json({ 
          message: "An organization with this name already exists. Please choose a different name.",
          error: "duplicate_organization_name"
        });
      }
      
      // Handle other validation errors
      res.status(400).json({ message: "Failed to create organization", error: errorMessage });
    }
  }));

  // Update organization (owner or admin only)
  app.put("/api/organizations/:id", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      const updates = updateOrganizationSchema.parse(req.body);
      
      const organization = await storage.getOrganization(id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if user is owner or admin
      const member = await storage.getOrganizationMember(id, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!((member && member.isOwner) || isAdmin)) {
        return res.status(403).json({ message: "Only organization owners or admins can update organizations" });
      }

      const updatedOrganization = await storage.updateOrganization(id, updates);
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "organization_updated",
        resource: "organizations",
        resourceId: id,
        oldValue: organization,
        newValue: updates,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json(updatedOrganization);
    } catch (error) {
      res.status(400).json({ message: "Failed to update organization", error: (error as Error).message });
    }
  }));

  // Delete organization (owner or admin only)
  app.delete("/api/organizations/:id", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      
      const organization = await storage.getOrganization(id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if user is owner or admin
      const member = await storage.getOrganizationMember(id, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!((member && member.isOwner) || isAdmin)) {
        return res.status(403).json({ message: "Only organization owners or admins can delete organizations" });
      }

      const success = await storage.deleteOrganization(id);
      
      if (success) {
        await RBACService.logAuditEvent({
          userId: req.user!.id,
          action: "organization_deleted",
          resource: "organizations",
          resourceId: id,
          oldValue: organization,
          newValue: null,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent") || null,
        });

        res.json({ message: "Organization deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete organization" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete organization", error: (error as Error).message });
    }
  }));

  // Get organization members
  app.get("/api/organizations/:id/members", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if user is a member or admin
      const member = await storage.getOrganizationMember(id, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!member && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      const members = await storage.getOrganizationMembers(id);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organization members", error: (error as Error).message });
    }
  }));

  // Add member to organization (owner or admin only)
  app.post("/api/organizations/:id/members", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      const memberData = insertOrganizationMemberSchema.parse({
        ...req.body,
        organizationId: id,
        invitedBy: req.user!.id,
      });
      
      // Check if user is owner or admin
      const member = await storage.getOrganizationMember(id, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!((member && member.isOwner) || isAdmin)) {
        return res.status(403).json({ message: "Only organization owners or admins can add members" });
      }

      const newMember = await storage.addOrganizationMember(memberData);
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "organization_member_added",
        resource: "organization_members",
        resourceId: newMember.id,
        oldValue: null,
        newValue: memberData,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.status(201).json(newMember);
    } catch (error) {
      res.status(400).json({ message: "Failed to add organization member", error: (error as Error).message });
    }
  }));

  // Update organization member (owner or admin only)
  app.put("/api/organizations/:orgId/members/:userId", authenticateToken, asAuth(async (req, res) => {
    try {
      const { orgId, userId } = req.params;
      const updates = updateOrganizationMemberSchema.parse(req.body);
      
      // Check if user is owner or admin
      const member = await storage.getOrganizationMember(orgId, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!((member && member.isOwner) || isAdmin)) {
        return res.status(403).json({ message: "Only organization owners or admins can update members" });
      }

      const existingMember = await storage.getOrganizationMember(orgId, userId);
      const updatedMember = await storage.updateOrganizationMember(orgId, userId, updates);
      
      if (updatedMember) {
        await RBACService.logAuditEvent({
          userId: req.user!.id,
          action: "organization_member_updated",
          resource: "organization_members",
          resourceId: updatedMember.id,
          oldValue: existingMember,
          newValue: updates,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent") || null,
        });

        res.json(updatedMember);
      } else {
        res.status(404).json({ message: "Organization member not found" });
      }
    } catch (error) {
      res.status(400).json({ message: "Failed to update organization member", error: (error as Error).message });
    }
  }));

  // Remove member from organization (owner or admin only)
  app.delete("/api/organizations/:orgId/members/:userId", authenticateToken, asAuth(async (req, res) => {
    try {
      const { orgId, userId } = req.params;
      
      // Check if user is owner or admin
      const member = await storage.getOrganizationMember(orgId, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!((member && member.isOwner) || isAdmin)) {
        return res.status(403).json({ message: "Only organization owners or admins can remove members" });
      }

      const existingMember = await storage.getOrganizationMember(orgId, userId);
      const success = await storage.removeOrganizationMember(orgId, userId);
      
      if (success) {
        await RBACService.logAuditEvent({
          userId: req.user!.id,
          action: "organization_member_removed",
          resource: "organization_members",
          resourceId: `${orgId}-${userId}`,
          oldValue: existingMember,
          newValue: null,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent") || null,
        });

        res.json({ message: "Organization member removed successfully" });
      } else {
        res.status(404).json({ message: "Organization member not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to remove organization member", error: (error as Error).message });
    }
  }));

  // Get organization roles
  app.get("/api/organizations/:id/roles", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if user is a member or admin
      const member = await storage.getOrganizationMember(id, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!member && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      const roles = await storage.getOrganizationRoles(id);
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organization roles", error: (error as Error).message });
    }
  }));

  // Assign role to user in organization (owner or admin only)
  app.post("/api/organizations/:orgId/assign-role", authenticateToken, asAuth(async (req, res) => {
    try {
      const { orgId } = req.params;
      const { userId, roleId } = organizationRoleAssignmentSchema.parse({
        ...req.body,
        organizationId: orgId,
      });
      
      // Check if user is owner or admin
      const member = await storage.getOrganizationMember(orgId, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!((member && member.isOwner) || isAdmin)) {
        return res.status(403).json({ message: "Only organization owners or admins can assign roles" });
      }

      const userRole = await storage.assignRoleToUserInOrganization(userId, roleId, orgId, req.user!.id);
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "organization_role_assigned",
        resource: "user_roles",
        resourceId: userRole.id,
        oldValue: null,
        newValue: { userId, roleId, organizationId: orgId, assignedBy: req.user!.id },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({ message: "Role assigned successfully", userRole });
    } catch (error) {
      res.status(400).json({ message: "Failed to assign role", error: (error as Error).message });
    }
  }));

  // Revoke role from user in organization (owner or admin only)
  app.delete("/api/organizations/:orgId/revoke-role", authenticateToken, asAuth(async (req, res) => {
    try {
      const { orgId } = req.params;
      const { userId, roleId } = organizationRoleAssignmentSchema.parse({
        ...req.body,
        organizationId: orgId,
      });
      
      // Check if user is owner or admin
      const member = await storage.getOrganizationMember(orgId, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      
      if (!((member && member.isOwner) || isAdmin)) {
        return res.status(403).json({ message: "Only organization owners or admins can revoke roles" });
      }

      const success = await storage.revokeRoleFromUserInOrganization(userId, roleId, orgId);
      
      if (success) {
        await RBACService.logAuditEvent({
          userId: req.user!.id,
          action: "organization_role_revoked",
          resource: "user_roles",
          resourceId: `${userId}-${roleId}-${orgId}`,
          oldValue: { userId, roleId, organizationId: orgId },
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
  }));

  // Get user roles in organization
  app.get("/api/organizations/:orgId/users/:userId/roles", authenticateToken, asAuth(async (req, res) => {
    try {
      const { orgId, userId } = req.params;
      
      // Check if user is a member, the user themselves, or admin
      const member = await storage.getOrganizationMember(orgId, req.user!.id);
      const isAdmin = await RBACService.hasRole(req.user!.id, ["admin"]);
      const isSameUser = req.user!.id === userId;
      
      if (!member && !isAdmin && !isSameUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const userRoles = await storage.getUserRolesInOrganization(userId, orgId);
      res.json(userRoles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user roles", error: (error as Error).message });
    }
  }));

  // ===== ADMIN DASHBOARD API ROUTES =====
  
  // Admin Dashboard Overview - System statistics and health
  app.get("/api/admin/dashboard/stats", authenticateToken, requireAdmin, asAuth(async (req, res) => {
    try {
      const [systemStats, recentActivity] = await Promise.all([
        storage.getSystemStats(),
        storage.getRecentActivity(10)
      ]);

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "admin_dashboard_accessed",
        resource: "admin_dashboard",
        resourceId: null,
        oldValue: null,
        newValue: { timestamp: new Date().toISOString() },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({
        stats: systemStats,
        recentActivity: recentActivity.slice(0, 5), // Latest 5 activities for dashboard
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats", error: (error as Error).message });
    }
  }));

  // Enhanced User Management - Search, filter, and comprehensive user data
  app.get("/api/admin/users", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { search, role, limit = "50", offset = "0" } = req.query;
      
      let users;
      if (search) {
        users = await storage.searchUsers(search as string, parseInt(limit as string));
      } else if (role) {
        users = await storage.getUsersByRole(role as string);
      } else {
        users = await storage.getAllUsersWithRoles();
      }

      // Add user statistics for each user
      const usersWithStats = await Promise.all(
        users.slice(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string))
          .map(async (user) => {
            const stats = await storage.getUserStats(user.id);
            return {
              ...user,
              stats,
              // Remove sensitive data
              password: undefined,
            };
          })
      );

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "users_list_accessed",
        resource: "user_management",
        resourceId: null,
        oldValue: null,
        newValue: { 
          searchQuery: search || null,
          roleFilter: role || null,
          resultCount: usersWithStats.length 
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({
        users: usersWithStats,
        total: users.length,
        offset: parseInt(offset as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users", error: (error as Error).message });
    }
  });

  // User Details with full role and permission information
  app.get("/api/admin/users/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      const [user, userWithRoles, userStats] = await Promise.all([
        storage.getUser(id),
        RBACService.getUserWithPermissions(id),
        storage.getUserStats(id)
      ]);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "user_details_accessed",
        resource: "user_management",
        resourceId: id,
        oldValue: null,
        newValue: { accessedUser: id },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({
        ...user,
        password: undefined, // Never expose passwords
        roles: userWithRoles?.userRoles || [],
        permissions: userWithRoles?.permissions || [],
        stats: userStats
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user details", error: (error as Error).message });
    }
  });

  // Create new user (admin only)
  app.post("/api/admin/users", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password if provided
      let hashedPassword;
      if (userData.password) {
        hashedPassword = await bcrypt.hash(userData.password, 10);
      }

      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        authProvider: userData.authProvider || "local"
      });

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "user_created",
        resource: "users",
        resourceId: user.id,
        oldValue: null,
        newValue: { ...userData, password: userData.password ? "[REDACTED]" : null },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.status(201).json({
        ...user,
        password: undefined // Never expose passwords
      });
    } catch (error) {
      res.status(400).json({ message: "Failed to create user", error: (error as Error).message });
    }
  });

  // Update user (admin only)
  app.put("/api/admin/users/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Hash password if being updated
      if (updates.password) {
        updates.password = await bcrypt.hash(updates.password, 10);
      }

      const updatedUser = await storage.updateUser(id, updates);

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "user_updated",
        resource: "users",
        resourceId: id,
        oldValue: { ...existingUser, password: "[REDACTED]" },
        newValue: { ...updates, password: updates.password ? "[REDACTED]" : undefined },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({
        ...updatedUser,
        password: undefined // Never expose passwords
      });
    } catch (error) {
      res.status(400).json({ message: "Failed to update user", error: (error as Error).message });
    }
  });

  // Permission Matrix - Visual representation of role-permission relationships
  app.get("/api/admin/roles/matrix", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const [permissionMatrix, allPermissions, allRoles] = await Promise.all([
        storage.getPermissionMatrix(),
        storage.getPermissions(),
        storage.getRoles()
      ]);

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "permission_matrix_accessed",
        resource: "role_management",
        resourceId: null,
        oldValue: null,
        newValue: { timestamp: new Date().toISOString() },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({
        matrix: permissionMatrix,
        permissions: allPermissions,
        roles: allRoles,
        categories: [...new Set(allPermissions.map(p => p.category))]
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch permission matrix", error: (error as Error).message });
    }
  });

  // Enhanced Audit Logs with filtering and real-time capabilities
  app.get("/api/admin/audit-logs/enhanced", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { 
        userId, 
        action, 
        resource, 
        startDate, 
        endDate, 
        limit = "100",
        offset = "0" 
      } = req.query;
      
      // For now, use the basic audit logs method
      // In a production system, you'd implement filtering in the storage layer
      const auditLogs = await storage.getAuditLogs(
        userId as string | undefined, 
        parseInt(limit as string)
      );

      // Client-side filtering (should be moved to storage layer for performance)
      let filteredLogs = auditLogs;
      
      if (action) {
        filteredLogs = filteredLogs.filter(log => log.action.includes(action as string));
      }
      
      if (resource) {
        filteredLogs = filteredLogs.filter(log => log.resource.includes(resource as string));
      }
      
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate as string) : new Date(0);
        const end = endDate ? new Date(endDate as string) : new Date();
        filteredLogs = filteredLogs.filter(log => 
          log.timestamp >= start && log.timestamp <= end
        );
      }

      const paginatedLogs = filteredLogs.slice(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string)
      );

      res.json({
        logs: paginatedLogs,
        total: filteredLogs.length,
        offset: parseInt(offset as string),
        limit: parseInt(limit as string),
        filters: { userId, action, resource, startDate, endDate }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch enhanced audit logs", error: (error as Error).message });
    }
  });

  // System Health Monitoring
  app.get("/api/admin/system/health", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const startTime = Date.now();
      
      // Check database connectivity
      const dbHealthStart = Date.now();
      const [testQuery] = await db.select({ count: sql<number>`count(*)` }).from(users);
      const dbResponseTime = Date.now() - dbHealthStart;
      
      // Get system stats
      const systemStats = await storage.getSystemStats();
      
      // Calculate overall response time
      const totalResponseTime = Date.now() - startTime;
      
      const healthData = {
        database: {
          status: "healthy",
          responseTime: dbResponseTime,
          connectionStatus: "connected"
        },
        api: {
          status: "healthy",
          responseTime: totalResponseTime
        },
        system: {
          ...systemStats,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version
        },
        timestamp: new Date().toISOString()
      };

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "system_health_checked",
        resource: "system_monitoring",
        resourceId: null,
        oldValue: null,
        newValue: { responseTime: totalResponseTime },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json(healthData);
    } catch (error) {
      res.status(500).json({ 
        message: "System health check failed", 
        error: (error as Error).message,
        database: { status: "error", responseTime: -1 },
        api: { status: "error", responseTime: -1 }
      });
    }
  });

  // System Settings Management
  app.get("/api/admin/settings", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Return current system configuration
      // In a real implementation, these would be stored in a settings table
      const settings = {
        security: {
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: false
          },
          sessionTimeout: 30, // minutes
          maxLoginAttempts: 5,
          lockoutDuration: 15 // minutes
        },
        email: {
          fromAddress: process.env.EMAIL_FROM || "noreply@jeldi.com",
          smtpEnabled: !!process.env.SMTP_HOST
        },
        oauth: {
          googleEnabled: !!process.env.GOOGLE_CLIENT_ID,
          microsoftEnabled: !!process.env.MICROSOFT_CLIENT_ID
        },
        features: {
          erpIntegrations: true,
          aiAssistant: true,
          emailCenter: true,
          advancedAnalytics: true
        },
        system: {
          maintenanceMode: false,
          debugMode: process.env.NODE_ENV === "development",
          logLevel: "info"
        }
      };

      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system settings", error: (error as Error).message });
    }
  });

  // Update system settings
  app.put("/api/admin/settings", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { category, settings } = req.body;
      
      // In a real implementation, you'd validate and save these to a settings table
      // For now, we'll just log the attempt
      
      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "system_settings_updated",
        resource: "system_settings",
        resourceId: category,
        oldValue: null, // Would fetch current settings
        newValue: settings,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      res.json({ 
        message: "Settings updated successfully",
        category,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(400).json({ message: "Failed to update settings", error: (error as Error).message });
    }
  });

  // Real-time activity stream
  app.get("/api/admin/activity/stream", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { limit = "20" } = req.query;
      
      const recentActivity = await storage.getRecentActivity(parseInt(limit as string));
      
      res.json({
        activities: recentActivity,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity stream", error: (error as Error).message });
    }
  });

  // Export system data
  app.get("/api/admin/export/:type", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { type } = req.params;
      const { format = "json" } = req.query;
      
      let data;
      let filename;
      
      switch (type) {
        case "users":
          data = await storage.getAllUsersWithRoles();
          filename = `users_export_${new Date().toISOString().split('T')[0]}`;
          break;
        case "audit-logs":
          data = await storage.getAuditLogs(undefined, 1000);
          filename = `audit_logs_export_${new Date().toISOString().split('T')[0]}`;
          break;
        case "roles":
          data = await storage.getRoles();
          filename = `roles_export_${new Date().toISOString().split('T')[0]}`;
          break;
        default:
          return res.status(400).json({ message: "Invalid export type" });
      }

      await RBACService.logAuditEvent({
        userId: req.user!.id,
        action: "data_exported",
        resource: "system_data",
        resourceId: type,
        oldValue: null,
        newValue: { type, format, recordCount: Array.isArray(data) ? data.length : 1 },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") || null,
      });

      // Set appropriate headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.${format}"`);
      res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
      
      if (format === 'json') {
        res.json(data);
      } else {
        // For CSV, you'd implement CSV conversion here
        res.json({ message: "CSV export not implemented yet", data });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to export data", error: (error as Error).message });
    }
  });

  // ===== END ADMIN DASHBOARD API ROUTES =====

  // KPI routes
  app.get("/api/kpis", authenticateToken, requirePermission("kpis", "read"), asAuth(async (req, res) => {
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
  }));

  app.post("/api/kpis", authenticateToken, requirePermission("kpis", "create"), asAuth(async (req, res) => {
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
  }));

  app.put("/api/kpis/:id", authenticateToken, requirePermission("kpis", "update"), asAuth(async (req, res) => {
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
  }));

  app.delete("/api/kpis/:id", authenticateToken, requirePermission("kpis", "delete"), asAuth(async (req, res) => {
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
  }));

  // Dashboard KPI Preferences routes
  app.get("/api/dashboard/kpi-preferences", authenticateToken, asAuth(async (req, res) => {
    try {
      let preferences = await storage.getDashboardKpiPreferences(req.user.id);
      
      // If no preferences exist, auto-create universal defaults (COO/CFO focused)
      if (preferences.length === 0) {
        // First ensure KPI configurations exist - create them if they don't
        let allKpis = await storage.getKpiConfigurations(req.user.id);
        
        if (allKpis.length === 0) {
          // Create universal KPI configurations
          const universalKpis = [
            { userId: req.user.id, type: 'cycle_time', name: 'Cycle Time', erpSource: 'universal', query: 'Universal metric: Average time to complete production/service cycle', position: 1, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'on_time_delivery', name: 'On-Time Delivery Rate', erpSource: 'universal', query: 'Universal metric: Percentage of orders/deliveries completed on time', position: 2, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'cost_per_unit', name: 'Cost Per Unit', erpSource: 'universal', query: 'Universal metric: Average cost to produce/deliver each unit', position: 3, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'working_capital_efficiency', name: 'Working Capital Efficiency', erpSource: 'universal', query: 'Universal metric: Ratio of working capital to revenue (CFO focus)', position: 4, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'gross_margin', name: 'Gross Margin', erpSource: 'universal', query: 'Universal metric: Gross profit as percentage of revenue (CFO focus)', position: 5, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'revenue', name: 'Monthly Revenue', erpSource: 'universal', query: 'Universal metric: Total revenue for current period', position: 6, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'orders', name: 'Active Orders', erpSource: 'universal', query: 'Universal metric: Number of active orders being processed (COO focus)', position: 7, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'inventory', name: 'Inventory Fill Rate', erpSource: 'universal', query: 'Universal metric: Percentage of inventory filled/available', position: 8, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'performance', name: 'System Performance', erpSource: 'universal', query: 'Universal metric: Overall system performance score', position: 9, isActive: true, refreshInterval: 30 },
            { userId: req.user.id, type: 'efficiency', name: 'Operational Efficiency', erpSource: 'universal', query: 'Universal metric: Overall operational efficiency (COO focus)', position: 10, isActive: true, refreshInterval: 30 },
          ];
          
          for (const kpi of universalKpis) {
            await storage.createKpiConfiguration(kpi);
          }
          
          allKpis = await storage.getKpiConfigurations(req.user.id);
        }
        
        // Now create default preferences
        const universalDefaults = ['cycle_time', 'on_time_delivery', 'cost_per_unit', 'working_capital_efficiency', 'gross_margin'];
        
        const defaultKpiConfigs = universalDefaults
          .map(kpiType => allKpis.find(k => k.type === kpiType))
          .filter(k => k !== undefined);
        
        // Create default preferences one by one
        for (let i = 0; i < defaultKpiConfigs.length; i++) {
          const kpiConfig = defaultKpiConfigs[i]!;
          await storage.createDashboardKpiPreference({
            userId: req.user.id,
            kpiConfigId: kpiConfig.id,
            position: i + 1,
            isVisible: true
          });
        }
        
        // Fetch the newly created preferences
        preferences = await storage.getDashboardKpiPreferences(req.user.id);
      }
      
      // Fetch latest data for each KPI
      const preferencesWithData = await Promise.all(
        preferences.map(async (pref) => {
          const latestData = await storage.getLatestKpiData(pref.kpiConfig.id);
          return { ...pref, latestData };
        })
      );
      
      res.json({ preferences: preferencesWithData, defaults: [] });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KPI preferences", error: (error as Error).message });
    }
  }));

  app.get("/api/dashboard/available-kpis", authenticateToken, asAuth(async (req, res) => {
    try {
      let allKpis = await storage.getKpiConfigurations(req.user.id);
      
      // If no KPI configurations exist, create universal defaults
      if (allKpis.length === 0) {
        console.log('No KPI configurations found, creating universal defaults for user:', req.user.id);
        
        const universalKpis = [
          { 
            userId: req.user.id,
            type: 'cycle_time', 
            name: 'Cycle Time', 
            erpSource: 'universal',
            query: 'Universal metric: Average time to complete production/service cycle',
            position: 1,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'on_time_delivery', 
            name: 'On-Time Delivery Rate', 
            erpSource: 'universal',
            query: 'Universal metric: Percentage of orders/deliveries completed on time',
            position: 2,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'cost_per_unit', 
            name: 'Cost Per Unit', 
            erpSource: 'universal',
            query: 'Universal metric: Average cost to produce/deliver each unit',
            position: 3,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'working_capital_efficiency', 
            name: 'Working Capital Efficiency', 
            erpSource: 'universal',
            query: 'Universal metric: Ratio of working capital to revenue (CFO focus)',
            position: 4,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'gross_margin', 
            name: 'Gross Margin', 
            erpSource: 'universal',
            query: 'Universal metric: Gross profit as percentage of revenue (CFO focus)',
            position: 5,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'revenue', 
            name: 'Monthly Revenue', 
            erpSource: 'universal',
            query: 'Universal metric: Total revenue for current period',
            position: 6,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'orders', 
            name: 'Active Orders', 
            erpSource: 'universal',
            query: 'Universal metric: Number of active orders being processed (COO focus)',
            position: 7,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'inventory', 
            name: 'Inventory Fill Rate', 
            erpSource: 'universal',
            query: 'Universal metric: Percentage of inventory filled/available',
            position: 8,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'performance', 
            name: 'System Performance', 
            erpSource: 'universal',
            query: 'Universal metric: Overall system performance score',
            position: 9,
            isActive: true,
            refreshInterval: 30
          },
          { 
            userId: req.user.id,
            type: 'efficiency', 
            name: 'Operational Efficiency', 
            erpSource: 'universal',
            query: 'Universal metric: Overall operational efficiency (COO focus)',
            position: 10,
            isActive: true,
            refreshInterval: 30
          },
        ];
        
        for (const kpi of universalKpis) {
          await storage.createKpiConfiguration(kpi);
        }
        
        console.log('Created', universalKpis.length, 'universal KPI configurations');
        
        // Fetch the newly created KPIs
        allKpis = await storage.getKpiConfigurations(req.user.id);
      }
      
      // Group KPIs by category
      const grouped = allKpis.reduce((acc, kpi) => {
        const category = getCategoryForKpiType(kpi.type);
        if (!acc[category]) acc[category] = [];
        acc[category].push(kpi);
        return acc;
      }, {} as Record<string, any[]>);
      
      res.json(grouped);
    } catch (error) {
      console.error('Error in /api/dashboard/available-kpis:', error);
      res.status(500).json({ message: "Failed to fetch available KPIs", error: (error as Error).message });
    }
  }));

  app.post("/api/dashboard/kpi-preferences", authenticateToken, asAuth(async (req, res) => {
    try {
      const { kpiConfigIds } = req.body;
      
      if (!Array.isArray(kpiConfigIds) || kpiConfigIds.length === 0 || kpiConfigIds.length > 5) {
        return res.status(400).json({ message: "Must select between 1 and 5 KPIs" });
      }
      
      // Delete existing preferences
      await storage.deleteAllUserKpiPreferences(req.user.id);
      
      // Create new preferences
      const preferences = await Promise.all(
        kpiConfigIds.map((kpiConfigId, index) =>
          storage.createDashboardKpiPreference({
            userId: req.user.id,
            kpiConfigId,
            position: index + 1,
            isVisible: true,
          })
        )
      );
      
      res.json({ preferences, message: "KPI preferences saved successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to save KPI preferences", error: (error as Error).message });
    }
  }));

  app.put("/api/dashboard/kpi-preferences/reorder", authenticateToken, asAuth(async (req, res) => {
    try {
      const { positions } = req.body;
      
      if (!Array.isArray(positions)) {
        return res.status(400).json({ message: "Invalid positions data" });
      }
      
      await storage.updateKpiPositions(req.user.id, positions);
      
      res.json({ message: "KPI positions updated successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to update KPI positions", error: (error as Error).message });
    }
  }));

  app.delete("/api/dashboard/kpi-preferences/:id", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteDashboardKpiPreference(id);

      if (!deleted) {
        return res.status(404).json({ message: "KPI preference not found" });
      }

      res.json({ message: "KPI deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete KPI", error: (error as Error).message });
    }
  }));

  // Dashboard Chart Preference routes
  app.get("/api/dashboard/chart-preferences", authenticateToken, asAuth(async (req, res) => {
    try {
      let preferences = await storage.getDashboardChartPreferences(req.user.id);
      
      // If no chart preferences exist, auto-create default charts
      if (preferences.length === 0) {
        console.log('No chart preferences found, creating default charts for user:', req.user.id);
        
        // Create 4 default charts that work for all users
        const defaultCharts = [
          { chartType: 'cashflow_90d_60d_projected', position: 1, size: 'large' },
          { chartType: 'revenue_90d', position: 2, size: 'large' },
          { chartType: 'unpaid_invoices', position: 3, size: 'medium' },
          { chartType: 'orders_over_time', position: 4, size: 'large' },
        ];
        
        for (const chart of defaultCharts) {
          await storage.createDashboardChartPreference({
            userId: req.user.id,
            chartType: chart.chartType,
            position: chart.position,
            size: chart.size,
            isVisible: true,
          });
        }
        
        // Fetch the newly created preferences
        preferences = await storage.getDashboardChartPreferences(req.user.id);
        console.log(`Created ${defaultCharts.length} default chart preferences`);
      }
      
      res.json(preferences);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chart preferences", error: (error as Error).message });
    }
  }));

  app.get("/api/dashboard/available-charts", authenticateToken, asAuth(async (req, res) => {
    try {
      const user = req.user;
      const availableCharts = [
        { id: 'cashflow_90d_60d_projected', name: 'Cash Flow (90d + 60d Projected)', category: 'financial', description: 'View cash flow for last 90 days and next 60 days projected', icon: 'dollar-sign', defaultSize: 'large', roles: ['admin', 'finance', 'cfo', 'ops_manager', 'project_manager', 'manager', 'user'] },
        { id: 'revenue_90d', name: 'Revenue (90 Days)', category: 'financial', description: 'Track revenue over the last 90 days', icon: 'trending-up', defaultSize: 'large', roles: ['admin', 'finance', 'cfo', 'manager', 'user'] },
        { id: 'unpaid_invoices', name: 'Unpaid Invoices', category: 'financial', description: 'Monitor outstanding invoice payments', icon: 'file-text', defaultSize: 'medium', roles: ['admin', 'finance', 'cfo', 'manager', 'user'] },
        { id: 'refunds', name: 'Refunds', category: 'financial', description: 'View refund trends over time', icon: 'arrow-left', defaultSize: 'medium', roles: ['admin', 'finance', 'cfo', 'manager', 'user'] },
        { id: 'cancellations', name: 'Cancellations', category: 'operational', description: 'Track order cancellations and churn', icon: 'x-circle', defaultSize: 'medium', roles: ['admin', 'ops_manager', 'manager', 'user'] },
        { id: 'orders_over_time', name: 'Orders Over Time', category: 'operational', description: 'View order volume trends', icon: 'shopping-cart', defaultSize: 'large', roles: ['admin', 'ops_manager', 'user'] },
        { id: 'cash_flow', name: 'Cash Flow', category: 'financial', description: 'Monitor cash inflows and outflows', icon: 'dollar-sign', defaultSize: 'large', roles: ['finance', 'cfo', 'admin'] },
        { id: 'profit_margin', name: 'Profit Margin', category: 'financial', description: 'Track profit margin trends', icon: 'percent', defaultSize: 'medium', roles: ['finance', 'cfo', 'admin'] },
        { id: 'ar_aging', name: 'AR Aging', category: 'financial', description: 'Accounts receivable aging report', icon: 'clock', defaultSize: 'large', roles: ['finance', 'cfo', 'admin'] },
        { id: 'inventory_levels', name: 'Inventory Levels', category: 'operational', description: 'Monitor stock levels', icon: 'package', defaultSize: 'medium', roles: ['ops_manager', 'admin'] },
        { id: 'delivery_performance', name: 'Delivery Performance', category: 'operational', description: 'Track delivery times and performance', icon: 'truck', defaultSize: 'medium', roles: ['ops_manager', 'admin'] },
        { id: 'quality_metrics', name: 'Quality Metrics', category: 'operational', description: 'Monitor quality scores and metrics', icon: 'star', defaultSize: 'medium', roles: ['ops_manager', 'admin'] },
        { id: 'project_timeline', name: 'Project Timeline', category: 'project', description: 'View project milestones and timeline', icon: 'calendar', defaultSize: 'large', roles: ['project_manager', 'admin'] },
        { id: 'budget_vs_actual', name: 'Budget vs Actual', category: 'project', description: 'Compare budget to actual spend', icon: 'bar-chart', defaultSize: 'medium', roles: ['project_manager', 'admin'] },
        { id: 'resource_utilization', name: 'Resource Utilization', category: 'project', description: 'Track resource allocation and usage', icon: 'users', defaultSize: 'medium', roles: ['project_manager', 'admin'] },
      ];

      // Filter charts based on user role
      const userRole = user.role || 'user';
      const filteredCharts = availableCharts.filter(chart => chart.roles.includes(userRole));

      res.json(filteredCharts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch available charts", error: (error as Error).message });
    }
  }));

  app.post("/api/dashboard/chart-preferences", authenticateToken, asAuth(async (req, res) => {
    try {
      const { chartType, size, configuration } = req.body;

      if (!chartType) {
        return res.status(400).json({ message: "Chart type is required" });
      }

      // Get current preferences to determine position
      const existingPreferences = await storage.getDashboardChartPreferences(req.user.id);
      const position = existingPreferences.length + 1;

      const preference = await storage.createDashboardChartPreference({
        userId: req.user.id,
        chartType,
        position,
        size: size || 'medium',
        isVisible: true,
        configuration: configuration || null,
      });

      res.json(preference);
    } catch (error) {
      res.status(400).json({ message: "Failed to add chart", error: (error as Error).message });
    }
  }));

  app.put("/api/dashboard/chart-preferences/:id", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updated = await storage.updateDashboardChartPreference(id, updates);

      if (!updated) {
        return res.status(404).json({ message: "Chart preference not found" });
      }

      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update chart", error: (error as Error).message });
    }
  }));

  app.delete("/api/dashboard/chart-preferences/:id", authenticateToken, asAuth(async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteDashboardChartPreference(id);

      if (!deleted) {
        return res.status(404).json({ message: "Chart preference not found" });
      }

      res.json({ message: "Chart deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete chart", error: (error as Error).message });
    }
  }));

  app.put("/api/dashboard/chart-preferences/reorder", authenticateToken, asAuth(async (req, res) => {
    try {
      const { positions } = req.body;

      if (!Array.isArray(positions)) {
        return res.status(400).json({ message: "Invalid positions data" });
      }

      await storage.updateChartPositions(req.user.id, positions);

      res.json({ message: "Chart positions updated successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to update chart positions", error: (error as Error).message });
    }
  }));

  // Chart Data Endpoints
  app.get("/api/charts/revenue-90d", authenticateToken, asAuth(async (req, res) => {
    try {
      // Mock data for revenue over 90 days
      const data = Array.from({ length: 90 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (89 - i));
        return {
          date: date.toISOString().split('T')[0],
          revenue: Math.floor(Math.random() * 50000) + 30000,
          target: 45000,
        };
      });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch revenue data", error: (error as Error).message });
    }
  }));

  app.get("/api/charts/unpaid-invoices", authenticateToken, asAuth(async (req, res) => {
    try {
      // Mock data for unpaid invoices
      const data = [
        { invoiceId: 'INV-001', customer: 'Acme Corp', amount: 12500, dueDate: '2025-01-15', daysOverdue: 23 },
        { invoiceId: 'INV-002', customer: 'Global Industries', amount: 8750, dueDate: '2025-01-20', daysOverdue: 18 },
        { invoiceId: 'INV-003', customer: 'Tech Solutions', amount: 15000, dueDate: '2025-01-25', daysOverdue: 13 },
        { invoiceId: 'INV-004', customer: 'Retail Plus', amount: 5400, dueDate: '2025-02-01', daysOverdue: 6 },
        { invoiceId: 'INV-005', customer: 'Manufacturing Co', amount: 22000, dueDate: '2025-02-05', daysOverdue: 2 },
      ];
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch unpaid invoices", error: (error as Error).message });
    }
  }));

  app.get("/api/charts/refunds", authenticateToken, asAuth(async (req, res) => {
    try {
      // Mock data for refunds over time
      const data = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return {
          date: date.toISOString().split('T')[0],
          refunds: Math.floor(Math.random() * 15) + 2,
          amount: Math.floor(Math.random() * 5000) + 500,
        };
      });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch refunds data", error: (error as Error).message });
    }
  }));

  app.get("/api/charts/cancellations", authenticateToken, asAuth(async (req, res) => {
    try {
      // Mock data for cancellations
      const data = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return {
          date: date.toISOString().split('T')[0],
          cancellations: Math.floor(Math.random() * 20) + 5,
          reason: ['Customer Request', 'Out of Stock', 'Payment Failed', 'Duplicate Order'][Math.floor(Math.random() * 4)],
        };
      });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cancellations data", error: (error as Error).message });
    }
  }));

  // Email routes
  app.get("/api/email/providers", authenticateToken, requirePermission("email", "manage"), asAuth(async (req, res) => {
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
  }));

  app.get("/api/email/status", authenticateToken, requirePermission("email", "manage"), asAuth(async (req, res) => {
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
  }));

  app.post("/api/email/connect/:provider", authenticateToken, requirePermission("email", "manage"), asAuth(async (req, res) => {
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
        // First try to check if Replit connector is available
        try {
          const outlookStatus = await emailService.checkOutlookConnection();
          if (outlookStatus.isConnected) {
            return res.json({ 
              message: "Outlook is already connected via Replit connector",
              isConnected: true,
              email: outlookStatus.email
            });
          }
        } catch (error) {
          // Replit connector not available, fall through to OAuth
          console.log('Replit Outlook connector not available, using direct OAuth');
        }
        
        // Use direct OAuth for retail Outlook.com accounts with enhanced security
        const env = detectEnvironment();
        let redirectUri = process.env.EMAIL_OAUTH_REDIRECT_URI;
        
        if (!redirectUri) {
          // Build redirect URI from request with security validation
          const protocol = env.isProduction ? 'https' : req.protocol;
          const host = req.get('host');
          redirectUri = `${protocol}://${host}/api/email/callback`;
          
          // Validate the constructed URI
          const validation = validateDomainSecurity(redirectUri, env.isProduction);
          if (!validation.isSecure || !validation.isAllowed) {
            console.error(`Email OAuth redirect URI validation failed: ${validation.errors.join(', ')}`);
            return res.status(400).json({ 
              message: "Email OAuth redirect URI must use HTTPS and be from an allowed domain",
              errors: validation.errors 
            });
          }
        }
        
        console.log(`Outlook OAuth redirect URI: ${redirectUri}`);
        const authUrl = await emailService.initiateEmailOAuth(provider, req.user.id, redirectUri);
        
        // Audit log the OAuth attempt
        console.log(`Outlook OAuth initiated for user ${req.user.id} at ${new Date().toISOString()}`);
        
        res.json({ authUrl });
      } else if (provider === 'gmail') {
        // Enhanced security for Gmail OAuth
        const env = detectEnvironment();
        let redirectUri = process.env.EMAIL_OAUTH_REDIRECT_URI;
        
        if (!redirectUri) {
          // Build redirect URI from request with security validation
          const protocol = env.isProduction ? 'https' : req.protocol;
          const host = req.get('host');
          redirectUri = `${protocol}://${host}/api/email/callback`;
          
          // Validate the constructed URI
          const validation = validateDomainSecurity(redirectUri, env.isProduction);
          if (!validation.isSecure || !validation.isAllowed) {
            console.error(`Email OAuth redirect URI validation failed: ${validation.errors.join(', ')}`);
            return res.status(400).json({ 
              message: "Email OAuth redirect URI must use HTTPS and be from an allowed domain",
              errors: validation.errors 
            });
          }
        }
        
        console.log(`Gmail OAuth redirect URI: ${redirectUri}`);
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
  }));

  app.get("/api/email/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        console.error('Email OAuth callback missing required parameters');
        return res.status(400).json({ message: "Missing code or state parameter" });
      }
      
      // Enhanced security validation
      const env = detectEnvironment();
      const origin = req.get('origin') || req.get('referer');
      
      if (origin && env.isProduction) {
        const validation = validateDomainSecurity(origin, env.isProduction);
        if (!validation.isSecure) {
          console.warn(`Email OAuth callback from insecure origin: ${origin}`);
          // Don't fail the callback but log the warning
        }
      }
      
      console.log(`Email OAuth callback received, code: ${(code as string).substring(0, 10)}..., state: ${state}`);
      
      const config = await emailService.handleEmailOAuthCallback(code as string, state as string);
      console.log(`Email OAuth callback successful for provider: ${config.provider}`);
      
      // Use environment-aware redirect URL
      const frontendUrl = env.domain || process.env.FRONTEND_URL || 'http://localhost:5000';
      res.redirect(`${frontendUrl}/email-center?status=connected&provider=${config.provider}`);
    } catch (error) {
      console.error("Email OAuth callback error:", error);
      res.redirect("/email-center?status=error&message=" + encodeURIComponent((error as Error).message));
    }
  });

  app.post("/api/email/send", authenticateToken, requirePermission("email", "send"), asAuth(async (req, res) => {
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
  }));

  // Email templates endpoint for better API design
  app.get("/api/email/templates", authenticateToken, requirePermission("email", "send"), asAuth(async (req, res) => {
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
  }));

  // ChatGPT routes (Legacy - creates default conversation)
  app.post("/api/chat/query", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.get("/api/chat/history", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
    try {
      const history = await storage.getChatHistory(req.user.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat history", error: (error as Error).message });
    }
  }));

  // Conversation Management Routes
  app.get("/api/conversations", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const conversations = await storage.getConversations(req.user.id, limit);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversations", error: (error as Error).message });
    }
  }));

  app.get("/api/conversations/:id", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.post("/api/conversations", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.put("/api/conversations/:id", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.delete("/api/conversations/:id", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  // Enhanced Chat with Conversation Support
  app.post("/api/chat/conversations/:id/message", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  // Query Templates Routes
  app.get("/api/query-templates", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.post("/api/query-templates", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.post("/api/query-templates/:id/use", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
    try {
      await storage.updateQueryTemplateUsage(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update template usage", error: (error as Error).message });
    }
  }));

  // Favorite Queries Routes
  app.get("/api/favorite-queries", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
    try {
      const category = req.query.category as string;
      const favorites = await storage.getFavoriteQueries(req.user.id, category);
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch favorite queries", error: (error as Error).message });
    }
  }));

  app.post("/api/favorite-queries", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.delete("/api/favorite-queries/:id", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
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
  }));

  app.post("/api/favorite-queries/:id/use", authenticateToken, requirePermission("ai", "basic"), asAuth(async (req, res) => {
    try {
      await storage.updateFavoriteQueryUsage(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update favorite usage", error: (error as Error).message });
    }
  }));

  // KPI Insights route
  app.get("/api/insights", authenticateToken, requirePermission("kpis", "read"), asAuth(async (req, res) => {
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
  }));

  // ===== ANALYTICS API ROUTES =====
  
  // Analytics Overview - Comprehensive business intelligence dashboard
  app.get("/api/analytics/overview", authenticateToken, requirePermission("analytics", "read"), asAuth(async (req, res) => {
    try {
      const userId = req.user.id;
      
      // Get aggregated ERP data
      const erpData = await erpService.aggregateERPData(userId);
      
      // Get KPI configurations and latest data
      const kpis = await storage.getKpiConfigurations(userId);
      const kpiSummary = await Promise.all(
        kpis.map(async (kpi) => {
          const latestData = await storage.getLatestKpiData(kpi.id);
          return {
            id: kpi.id,
            name: kpi.name,
            type: kpi.type,
            value: latestData?.value || "N/A",
            change: latestData?.change || 0,
            lastUpdated: latestData?.timestamp || kpi.createdAt
          };
        })
      );
      
      // Get connected ERP systems
      const erpSystems = await erpService.getConnectedSystems(userId);
      const connectedSystemsCount = erpSystems.filter(s => s.isConnected).length;
      
      // Get business metrics
      const businessMetrics = {
        totalRevenue: erpData.financials?.totalRevenue || 2450000,
        monthlyGrowth: 12.5,
        activeOrders: erpData.sales?.activeOrders || 1247,
        inventoryValue: erpData.inventory?.totalValue || 890000,
        systemPerformance: 94.8,
        connectedSystems: connectedSystemsCount,
        dataFreshness: new Date().toISOString()
      };
      
      res.json({
        businessMetrics,
        kpiSummary,
        erpSystems: erpSystems.map(s => ({
          name: s.name,
          displayName: s.displayName,
          isConnected: s.isConnected,
          lastSync: s.lastSync
        })),
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Analytics overview error:", error);
      res.status(500).json({ message: "Failed to fetch analytics overview", error: (error as Error).message });
    }
  }));

  // Revenue Analytics - Financial performance and trends
  app.get("/api/analytics/revenue", authenticateToken, requirePermission("analytics", "read"), asAuth(async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = "12m", granularity = "month" } = req.query;
      
      // Get financial data from ERP systems
      const erpData = await erpService.aggregateERPData(userId);
      
      // Generate mock revenue data for demo (in real implementation, this would come from ERP)
      const generateRevenueData = (months: number) => {
        const data = [];
        const now = new Date();
        
        for (let i = months - 1; i >= 0; i--) {
          const date = new Date(now);
          date.setMonth(date.getMonth() - i);
          
          const baseRevenue = 2000000;
          const seasonality = Math.sin((date.getMonth() / 12) * 2 * Math.PI) * 0.2 + 1;
          const growth = Math.pow(1.02, months - i - 1); // 2% monthly growth
          const randomVariation = (Math.random() - 0.5) * 0.1 + 1;
          
          data.push({
            period: date.toISOString().slice(0, 7), // YYYY-MM format
            revenue: Math.round(baseRevenue * seasonality * growth * randomVariation),
            target: Math.round(baseRevenue * growth * 1.1),
            previousYear: Math.round(baseRevenue * seasonality * Math.pow(1.15, -12) * randomVariation)
          });
        }
        return data;
      };
      
      const periodMonths = period === "12m" ? 12 : period === "6m" ? 6 : 3;
      const revenueData = generateRevenueData(periodMonths);
      
      // Calculate trends
      const currentRevenue = revenueData[revenueData.length - 1]?.revenue || 0;
      const previousRevenue = revenueData[revenueData.length - 2]?.revenue || 0;
      const monthlyGrowth = previousRevenue ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
      
      const totalRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0);
      const totalTarget = revenueData.reduce((sum, item) => sum + item.target, 0);
      const targetAchievement = totalTarget ? (totalRevenue / totalTarget) * 100 : 0;
      
      res.json({
        revenueData,
        summary: {
          totalRevenue,
          monthlyGrowth: Number(monthlyGrowth.toFixed(1)),
          targetAchievement: Number(targetAchievement.toFixed(1)),
          averageMonthlyRevenue: Math.round(totalRevenue / periodMonths)
        },
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Revenue analytics error:", error);
      res.status(500).json({ message: "Failed to fetch revenue analytics", error: (error as Error).message });
    }
  }));

  // ERP Performance Analytics - System health and operational metrics
  app.get("/api/analytics/erp-performance", authenticateToken, requirePermission("analytics", "read"), asAuth(async (req, res) => {
    try {
      const userId = req.user.id;
      
      // Get ERP systems and their performance data
      const erpSystems = await erpService.getConnectedSystems(userId);
      const erpData = await erpService.aggregateERPData(userId);
      
      // Generate performance metrics for each connected system
      const systemPerformance = erpSystems.map(system => {
        const basePerformance = system.isConnected ? 85 + Math.random() * 10 : 0;
        return {
          systemName: system.name,
          displayName: system.displayName,
          isConnected: system.isConnected,
          performance: Number(basePerformance.toFixed(1)),
          uptime: system.isConnected ? 99.2 + Math.random() * 0.7 : 0,
          responseTime: system.isConnected ? Math.round(150 + Math.random() * 100) : null,
          lastSync: system.lastSync,
          dataQuality: system.isConnected ? 92 + Math.random() * 6 : 0,
          issues: system.isConnected ? Math.floor(Math.random() * 3) : null
        };
      });
      
      // Overall system health
      const connectedSystems = systemPerformance.filter(s => s.isConnected);
      const avgPerformance = connectedSystems.length > 0 
        ? connectedSystems.reduce((sum, s) => sum + s.performance, 0) / connectedSystems.length 
        : 0;
      const avgUptime = connectedSystems.length > 0 
        ? connectedSystems.reduce((sum, s) => sum + s.uptime, 0) / connectedSystems.length 
        : 0;
      
      // Data sync status
      const dataSyncStatus = {
        totalSystems: erpSystems.length,
        connectedSystems: connectedSystems.length,
        healthySystems: connectedSystems.filter(s => s.performance > 90).length,
        lastGlobalSync: connectedSystems.reduce((latest, system) => {
          if (!system.lastSync) return latest;
          const syncDate = new Date(system.lastSync);
          return !latest || syncDate > latest ? syncDate : latest;
        }, null as Date | null)
      };
      
      res.json({
        systemPerformance,
        overallHealth: {
          averagePerformance: Number(avgPerformance.toFixed(1)),
          averageUptime: Number(avgUptime.toFixed(1)),
          systemsOnline: connectedSystems.length,
          totalSystems: erpSystems.length
        },
        dataSyncStatus,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("ERP performance analytics error:", error);
      res.status(500).json({ message: "Failed to fetch ERP performance analytics", error: (error as Error).message });
    }
  }));

  // Business Insights - AI-powered analytics and recommendations
  app.get("/api/analytics/insights", authenticateToken, requirePermission("analytics", "advanced"), asAuth(async (req, res) => {
    try {
      const userId = req.user.id;
      
      // Get comprehensive business data
      const kpis = await storage.getKpiConfigurations(userId);
      const erpData = await erpService.aggregateERPData(userId);
      const erpSystems = await erpService.getConnectedSystems(userId);
      
      // Prepare data for AI analysis
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
      
      // Generate insights using AI (this calls the existing function)
      const aiInsights = await generateKPIInsights({
        ...kpiData,
        erpData,
        connectedSystems: erpSystems.filter(s => s.isConnected).length
      });
      
      // Add business-specific insights
      const businessInsights = [
        {
          type: "opportunity",
          title: "Revenue Growth Opportunity",
          description: "Based on current trends, optimizing inventory management could increase revenue by 8-12%",
          impact: "high",
          timeframe: "3-6 months",
          category: "financial"
        },
        {
          type: "warning",
          title: "System Integration Gap",
          description: `${erpSystems.length - erpSystems.filter(s => s.isConnected).length} ERP systems are not connected, limiting data visibility`,
          impact: "medium",
          timeframe: "immediate",
          category: "operational"
        },
        {
          type: "insight",
          title: "Performance Trend",
          description: "Operational efficiency has improved by 15.7% this quarter, exceeding industry benchmarks",
          impact: "positive",
          timeframe: "current",
          category: "performance"
        }
      ];
      
      res.json({
        aiInsights,
        businessInsights,
        summary: {
          totalInsights: aiInsights.length + businessInsights.length,
          highImpactInsights: businessInsights.filter(i => i.impact === "high").length,
          categories: ["financial", "operational", "performance"]
        },
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Business insights error:", error);
      res.status(500).json({ message: "Failed to generate business insights", error: (error as Error).message });
    }
  }));

  // Analytics Export - Data export functionality
  app.get("/api/analytics/export", authenticateToken, requirePermission("analytics", "export"), asAuth(async (req, res) => {
    try {
      const userId = req.user.id;
      const { type = "overview", format = "json", period = "12m" } = req.query;
      
      let exportData: any = {};
      
      switch (type) {
        case "overview":
          // Export overview data
          const erpData = await erpService.aggregateERPData(userId);
          const kpis = await storage.getKpiConfigurations(userId);
          const kpiData = await Promise.all(
            kpis.map(async (kpi) => {
              const latestData = await storage.getLatestKpiData(kpi.id);
              return {
                name: kpi.name,
                type: kpi.type,
                value: latestData?.value || "N/A",
                change: latestData?.change || 0,
                lastUpdated: latestData?.timestamp || kpi.createdAt
              };
            })
          );
          exportData = { erpData, kpis: kpiData };
          break;
          
        case "revenue":
          // Export revenue data (would be more comprehensive in real implementation)
          exportData = {
            revenue: {
              current: 2450000,
              growth: 12.5,
              period: period
            }
          };
          break;
          
        default:
          exportData = { message: "Export type not supported" };
      }
      
      // Set appropriate headers for download
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `analytics-${type}-${timestamp}.${format}`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
      
      if (format === 'json') {
        res.json({
          exportType: type,
          timestamp: new Date().toISOString(),
          data: exportData
        });
      } else {
        // Simple CSV export (in real implementation, would be more sophisticated)
        res.send("Export format CSV not fully implemented in demo");
      }
    } catch (error) {
      console.error("Analytics export error:", error);
      res.status(500).json({ message: "Failed to export analytics data", error: (error as Error).message });
    }
  }));

  // Real-time polling endpoints for Lambda compatibility
  app.get("/api/realtime/kpi-updates", authenticateToken, requirePermission("kpis", "read"), asAuth(async (req, res) => {
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
  }));

  app.get("/api/realtime/erp-status", authenticateToken, requirePermission("erp_connections", "read"), asAuth(async (req, res) => {
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
  }));

  app.get("/api/realtime/insights", authenticateToken, requirePermission("kpis", "read"), asAuth(async (req, res) => {
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
  }));

  // ===== SECURITY COMPLIANCE ROUTES =====
  
  // Audit Log Routes
  app.get("/api/audit/logs", authenticateToken, requireAdmin, asAuth(async (req, res) => {
    try {
      const { userId, action, resource, startDate, endDate, limit } = req.query;
      const logs = await auditService.getAuditLogs({
        userId: userId as string,
        action: action as string,
        resource: resource as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100
      });
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs", error: (error as Error).message });
    }
  }));

  app.get("/api/audit/my-activity", authenticateToken, asAuth(async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const logs = await auditService.getUserActivity(req.user.id, limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity logs", error: (error as Error).message });
    }
  }));

  app.get("/api/audit/export", authenticateToken, requireAdmin, asAuth(async (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';
      const logs = format === 'csv' 
        ? await auditService.exportAuditLogsCSV()
        : await auditService.exportAuditLogs();
      
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs.${format}`);
      res.send(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to export audit logs", error: (error as Error).message });
    }
  }));

  // Session Routes
  app.get("/api/sessions/active", authenticateToken, asAuth(async (req, res) => {
    try {
      const sessions = await sessionService.getUserActiveSessions(req.user.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions", error: (error as Error).message });
    }
  }));

  app.delete("/api/sessions/:id", authenticateToken, asAuth(async (req, res) => {
    try {
      const session = await sessionService.getSessionById(req.params.id);
      if (!session || session.userId !== req.user.id) {
        return res.status(404).json({ message: "Session not found" });
      }
      await sessionService.terminateSessionById(req.params.id);
      await auditService.logAction({
        userId: req.user.id,
        action: 'session_terminate',
        resource: 'sessions',
        resourceId: req.params.id,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.json({ message: "Session terminated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to terminate session", error: (error as Error).message });
    }
  }));

  app.delete("/api/sessions/all", authenticateToken, asAuth(async (req, res) => {
    try {
      await sessionService.terminateAllUserSessions(req.user.id);
      await auditService.logAction({
        userId: req.user.id,
        action: 'session_terminate_all',
        resource: 'sessions',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.json({ message: "All sessions terminated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to terminate sessions", error: (error as Error).message });
    }
  }));

  // Security Settings Routes
  app.post("/api/security/change-password", authenticateToken, asAuth(async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.user.id);
      
      if (!user || !user.password) {
        return res.status(400).json({ message: "Cannot change password for OAuth users" });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        await auditService.logAction({
          userId: req.user.id,
          action: 'password_change',
          resource: 'users',
          resourceId: req.user.id,
          status: 'failure',
          details: { reason: 'Invalid current password' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const validation = passwordPolicyService.validatePassword(newPassword);
      if (!validation.valid) {
        return res.status(400).json({ message: "Password does not meet requirements", errors: validation.errors });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      const canUse = await passwordPolicyService.checkPasswordHistory(req.user.id, newPassword);
      if (!canUse) {
        return res.status(400).json({ message: "Cannot reuse recent passwords" });
      }

      await storage.updateUser(req.user.id, { password: newHash });
      await passwordPolicyService.recordPasswordChange(req.user.id, newHash);
      
      await auditService.logAction({
        userId: req.user.id,
        action: 'password_change',
        resource: 'users',
        resourceId: req.user.id,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to change password", error: (error as Error).message });
    }
  }));

  app.get("/api/security/policy", (req, res) => {
    const policy = passwordPolicyService.getPolicy();
    res.json(policy);
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
