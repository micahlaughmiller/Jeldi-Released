import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { erpService } from "./services/erpService";
import { emailService } from "./services/emailService";
import { analyzeERPData, generateKPIInsights } from "./services/openai";
import { insertUserSchema, insertKpiConfigurationSchema, insertChatHistorySchema } from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import passport from "passport";
import { OAuthService } from "./services/oauthService";
import { getJwtSecret } from "./env-validation";

// JWT_SECRET accessed at runtime, not import-time
const getJwtSecretAtRuntime = () => getJwtSecret();

// WebSocket clients tracking
const wsClients = new Map<string, WebSocket>();

// Helper function to broadcast ERP status updates
async function broadcastERPStatusUpdate(userId: string) {
  const wsClient = wsClients.get(userId);
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    try {
      const systems = await erpService.getConnectedSystems(userId);
      wsClient.send(JSON.stringify({
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup OAuth strategies
  OAuthService.setupStrategies();
  
  // Initialize passport middleware
  app.use(passport.initialize());
  
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
  app.get("/api/erp/systems", authenticateToken, async (req: any, res) => {
    try {
      const systems = await erpService.getConnectedSystems(req.user.id);
      res.json(systems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ERP systems", error: (error as Error).message });
    }
  });

  app.post("/api/erp/connect/:system", authenticateToken, async (req: any, res) => {
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

  app.delete("/api/erp/disconnect/:system", authenticateToken, async (req: any, res) => {
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

  app.get("/api/erp/data", authenticateToken, async (req: any, res) => {
    try {
      const data = await erpService.aggregateERPData(req.user.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ERP data", error: (error as Error).message });
    }
  });

  // KPI routes
  app.get("/api/kpis", authenticateToken, async (req: any, res) => {
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

  app.post("/api/kpis", authenticateToken, async (req: any, res) => {
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

  app.put("/api/kpis/:id", authenticateToken, async (req: any, res) => {
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

  app.delete("/api/kpis/:id", authenticateToken, async (req: any, res) => {
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
  app.get("/api/email/providers", authenticateToken, async (req: any, res) => {
    try {
      const configurations = await emailService.getEmailConfigurations(req.user.id);
      res.json({ configurations, providers: Object.values(emailService.getEmailTemplates()) });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email providers", error: (error as Error).message });
    }
  });

  app.post("/api/email/connect/:provider", authenticateToken, async (req: any, res) => {
    try {
      const { provider } = req.params;
      const redirectUri = process.env.EMAIL_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/email/callback`;
      
      const authUrl = await emailService.initiateEmailOAuth(provider, req.user.id, redirectUri);
      res.json({ authUrl });
    } catch (error) {
      res.status(400).json({ message: "Failed to initiate email OAuth", error: (error as Error).message });
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

  app.post("/api/email/send", authenticateToken, async (req: any, res) => {
    try {
      const { provider, to, subject, body, template, templateVariables } = req.body;
      
      let emailMessage = { to: Array.isArray(to) ? to : [to], subject, body };
      
      // Use template if specified
      if (template) {
        const templates = emailService.getEmailTemplates();
        const emailTemplate = templates[template];
        if (emailTemplate) {
          const rendered = emailService.renderTemplate(emailTemplate, templateVariables || {});
          emailMessage.subject = rendered.subject;
          emailMessage.body = rendered.body;
        }
      }
      
      const success = await emailService.sendEmail(req.user.id, provider, emailMessage);
      
      if (success) {
        res.json({ message: "Email sent successfully" });
      } else {
        res.status(500).json({ message: "Failed to send email" });
      }
    } catch (error) {
      res.status(400).json({ message: "Failed to send email", error: (error as Error).message });
    }
  });

  // ChatGPT routes
  app.post("/api/chat/query", authenticateToken, async (req: any, res) => {
    try {
      const { query } = req.body;
      
      // Get aggregated ERP data
      const erpData = await erpService.aggregateERPData(req.user.id);
      
      // Send to ChatGPT for analysis
      const response = await analyzeERPData({
        query,
        erpData,
        userId: req.user.id
      });
      
      // Save chat history
      await storage.createChatHistory({
        userId: req.user.id,
        query,
        response: response.response,
        erpData
      });
      
      // Broadcast to WebSocket clients
      const wsClient = wsClients.get(req.user.id);
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
          type: 'chat_response',
          data: response
        }));
      }
      
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: "Failed to process query", error: (error as Error).message });
    }
  });

  app.get("/api/chat/history", authenticateToken, async (req: any, res) => {
    try {
      const history = await storage.getChatHistory(req.user.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat history", error: (error as Error).message });
    }
  });

  // KPI Insights route
  app.get("/api/insights", authenticateToken, async (req: any, res) => {
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

  const httpServer = createServer(app);

  // WebSocket server setup
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
              wsClients.set(user.id, ws);
              ws.send(JSON.stringify({ type: 'auth_success', userId: user.id }));
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
        if (client === ws) {
          wsClients.delete(userId);
          break;
        }
      }
    });
  });

  // Real-time KPI updates (simulate with interval)
  setInterval(async () => {
    for (const [userId, ws] of Array.from(wsClients.entries())) {
      if (ws.readyState === WebSocket.OPEN) {
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
            ws.send(JSON.stringify({
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

  return httpServer;
}
