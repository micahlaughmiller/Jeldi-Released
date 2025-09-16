import { storage } from "../storage";
import type { EmailConfiguration } from "@shared/schema";
import { getUncachableOutlookClient } from "./outlookClient";
import crypto from "crypto";
import { promisify } from "util";
import { getTokenEncryptionKey } from "../env-validation";

export interface EmailProvider {
  name: string;
  displayName: string;
  oauthConfig: {
    authUrl: string;
    tokenUrl: string;
    clientId: string;
    scopes: string[];
  };
  sendEndpoint: string;
}

export const EMAIL_PROVIDERS: Record<string, EmailProvider> = {
  gmail: {
    name: "gmail",
    displayName: "Gmail",
    oauthConfig: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || "",
      scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"]
    },
    sendEndpoint: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
  },
  outlook: {
    name: "outlook",
    displayName: "Outlook.com",
    oauthConfig: {
      authUrl: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      scopes: ["https://graph.microsoft.com/Mail.Send", "https://graph.microsoft.com/Mail.Read", "offline_access"]
    },
    sendEndpoint: "https://graph.microsoft.com/v1.0/me/sendMail"
  }
};

export interface EmailMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: EmailAttachment[];
}

export interface SMTPConfiguration {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailAttachment {
  name: string;
  contentType: string;
  data: string; // base64 encoded
}

export interface EmailTemplate {
  name: string;
  subject: string;
  body: string;
  variables?: string[];
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  weekly_report: {
    name: "Weekly Report",
    subject: "ERP Dashboard Report - Week {{week}}",
    body: `Dear {{recipient}},

Please find attached your weekly ERP dashboard report containing:

{{#kpis}}
- {{name}}: {{value}} ({{change}})
{{/kpis}}

Key Insights:
{{#insights}}
- {{.}}
{{/insights}}

Best regards,
ERP Connect Pro`,
    variables: ["week", "recipient", "kpis", "insights"]
  },
  kpi_alert: {
    name: "KPI Alert",
    subject: "Alert: {{kpi_name}} Threshold Exceeded",
    body: `Alert: {{kpi_name}} has exceeded the configured threshold.

Current Value: {{current_value}}
Threshold: {{threshold}}
Change: {{change}}

Please review and take appropriate action.

ERP Connect Pro`,
    variables: ["kpi_name", "current_value", "threshold", "change"]
  },
  system_status: {
    name: "System Status Update",
    subject: "ERP System Status Update",
    body: `System Status Update:

{{#systems}}
- {{name}}: {{status}} (Last sync: {{last_sync}})
{{/systems}}

{{#if issues}}
Issues requiring attention:
{{#issues}}
- {{.}}
{{/issues}}
{{/if}}

ERP Connect Pro`,
    variables: ["systems", "issues"]
  }
};

export class EmailService {
  // Secure encryption key from environment - validated at startup
  private readonly encryptionKey = getTokenEncryptionKey();

  async getEmailConfigurations(userId: string): Promise<EmailConfiguration[]> {
    return await storage.getEmailConfigurations(userId);
  }

  // Security helper methods for OAuth
  generateSecureState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  async generateCodeChallenge(verifier: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }

  async encryptToken(token: string): Promise<string> {
    try {
      // Use AES-256-GCM for authenticated encryption
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(12); // GCM uses 12-byte IV
      
      // Derive 32-byte key from TOKEN_ENCRYPTION_KEY
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      
      let encrypted = cipher.update(token, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const authTag = cipher.getAuthTag();
      
      // Format: iv:ciphertext:authTag (all Base64 encoded)
      return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
    } catch (error) {
      console.error('Token encryption error:', error);
      throw new Error('Failed to encrypt token');
    }
  }

  async decryptToken(encryptedToken: string): Promise<string> {
    try {
      const parts = encryptedToken.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format - expected iv:ciphertext:authTag');
      }
      
      const [ivBase64, encrypted, authTagBase64] = parts;
      
      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');
      
      // Derive same 32-byte key
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      
      const algorithm = 'aes-256-gcm';
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Token decryption error:', error);
      throw new Error('Failed to decrypt token - authentication failed or data corrupted');
    }
  }

  // Email OAuth session management
  async createEmailOAuthSession(provider: string, state: string, userId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await storage.createOAuthSession({
      state,
      provider: `email_${provider}`, // Prefix to distinguish from user auth
      isCompleted: false,
      expiresAt,
      authResult: JSON.stringify({ userId })
    });
  }

  async getEmailOAuthSessionByState(state: string): Promise<any> {
    const session = await storage.getOAuthSessionByState(state);
    if (!session || !session.provider.startsWith('email_')) {
      return null;
    }
    
    // Return structured session data
    const authResult = session.authResult ? JSON.parse(session.authResult as string) : {};
    return {
      id: session.id,
      provider: session.provider.replace('email_', ''),
      userId: authResult.userId,
      isCompleted: session.isCompleted,
      expiresAt: session.expiresAt,
      authResult
    };
  }

  async updateEmailOAuthSession(state: string, updates: any): Promise<void> {
    const session = await storage.getOAuthSessionByState(state);
    if (!session) {
      throw new Error('OAuth session not found');
    }
    
    const currentResult = session.authResult ? JSON.parse(session.authResult as string) : {};
    await storage.updateOAuthSession(session.id, {
      authResult: JSON.stringify({ ...currentResult, ...updates })
    });
  }

  async completeEmailOAuthSession(state: string): Promise<void> {
    const session = await storage.getOAuthSessionByState(state);
    if (session) {
      await storage.updateOAuthSession(session.id, { isCompleted: true });
    }
  }

  async checkOutlookConnection(): Promise<{ isConnected: boolean; email?: string }> {
    try {
      const client = await getUncachableOutlookClient();
      const user = await client.api('/me').get();
      return {
        isConnected: true,
        email: user.mail || user.userPrincipalName
      };
    } catch (error) {
      console.error('Outlook connection check failed:', error);
      return { isConnected: false };
    }
  }

  async initiateEmailOAuth(provider: string, userId: string, redirectUri: string): Promise<string> {
    const emailProvider = EMAIL_PROVIDERS[provider];
    if (!emailProvider) {
      throw new Error(`Email provider ${provider} not supported`);
    }

    // Validate redirect URI against allowlist
    const allowedRedirectUris = [
      process.env.EMAIL_OAUTH_REDIRECT_URI,
      `${process.env.FRONTEND_URL || 'http://localhost:5000'}/api/email/callback`,
      'http://localhost:5000/api/email/callback'
    ].filter(Boolean);
    
    if (!allowedRedirectUris.includes(redirectUri)) {
      throw new Error(`Invalid redirect URI: ${redirectUri}. Allowed URIs: ${allowedRedirectUris.join(', ')}. Please configure this URI in your OAuth provider settings.`);
    }

    // Create or update email configuration
    const existingConfig = await storage.getEmailConfigurations(userId);
    const existing = existingConfig.find(config => config.provider === provider);
    
    if (!existing) {
      await storage.createEmailConfiguration({
        userId,
        provider,
        email: "", // Will be updated after OAuth
        isActive: false
      });
    }

    // Generate secure state using OAuthService and create session
    const state = this.generateSecureState();
    await this.createEmailOAuthSession(provider, state, userId);

    // Generate OAuth URL with PKCE
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    // Store code verifier in session for later use
    await this.updateEmailOAuthSession(state, { codeVerifier });

    const params = new URLSearchParams({
      client_id: emailProvider.oauthConfig.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: emailProvider.oauthConfig.scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${emailProvider.oauthConfig.authUrl}?${params.toString()}`;
  }

  async handleEmailOAuthCallback(code: string, state: string): Promise<EmailConfiguration> {
    // Validate and get OAuth session
    const session = await this.getEmailOAuthSessionByState(state);
    if (!session || session.isCompleted || new Date() > session.expiresAt) {
      throw new Error('Invalid or expired OAuth session');
    }

    const provider = session.provider;
    const userId = session.userId;
    const codeVerifier = session.authResult?.codeVerifier;
    const emailProvider = EMAIL_PROVIDERS[provider];
    
    if (!emailProvider) {
      throw new Error(`Invalid email provider: ${provider}`);
    }

    // Build token request with PKCE
    const tokenParams: any = {
      grant_type: "authorization_code",
      client_id: emailProvider.oauthConfig.clientId,
      code,
      redirect_uri: process.env.EMAIL_OAUTH_REDIRECT_URI || "",
      code_verifier: codeVerifier
    };

    // Only add client_secret if not using PKCE (for backward compatibility)
    if (!codeVerifier) {
      tokenParams.client_secret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] || process.env.GOOGLE_CLIENT_SECRET || "";
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(emailProvider.oauthConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(tokenParams),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to exchange code for tokens: ${tokenResponse.statusText} - ${errorText}`);
    }

    const tokens = await tokenResponse.json();
    
    // Get user email address
    let userEmail = "";
    if (provider === "gmail") {
      const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { "Authorization": `Bearer ${tokens.access_token}` }
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        userEmail = profile.emailAddress;
      }
    } else if (provider === "outlook") {
      const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { "Authorization": `Bearer ${tokens.access_token}` }
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        userEmail = profile.mail || profile.userPrincipalName;
      }
    }

    // Encrypt tokens before storage
    const encryptedAccessToken = await this.encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? await this.encryptToken(tokens.refresh_token) : null;

    // Update email configuration
    const configurations = await storage.getEmailConfigurations(userId);
    const config = configurations.find(c => c.provider === provider);
    
    if (!config) {
      throw new Error("Email configuration not found");
    }

    const updatedConfig = await storage.updateEmailConfiguration(config.id, {
      email: userEmail,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiry: new Date(Date.now() + (tokens.expires_in * 1000)),
      isActive: true
    });

    if (!updatedConfig) {
      throw new Error("Failed to update email configuration");
    }

    // Mark OAuth session as completed and clean up
    await this.completeEmailOAuthSession(state);

    return updatedConfig;
  }

  async sendEmail(userId: string, provider: string, message: EmailMessage, templateName?: string, templateVars?: Record<string, any>): Promise<boolean> {
    try {
      let finalMessage = message;
      
      // Apply template if specified
      if (templateName && EMAIL_TEMPLATES[templateName] && templateVars) {
        const template = EMAIL_TEMPLATES[templateName];
        const rendered = this.renderTemplate(template, templateVars);
        finalMessage = {
          ...message,
          subject: rendered.subject,
          body: rendered.body
        };
      }

      if (provider === "gmail") {
        const configurations = await storage.getEmailConfigurations(userId);
        const config = configurations.find(c => c.provider === provider && c.isActive);
        
        if (!config || !config.accessToken) {
          throw new Error(`Gmail not configured or not active`);
        }

        // Check if token is expired and refresh if needed
        if (config.tokenExpiry && config.tokenExpiry < new Date()) {
          if (!config.refreshToken) {
            throw new Error('Gmail access token expired and no refresh token available');
          }
          await this.refreshAccessToken(userId, provider, config.id);
          // Re-fetch updated configuration
          const updatedConfigs = await storage.getEmailConfigurations(userId);
          const updatedConfig = updatedConfigs.find(c => c.id === config.id);
          if (!updatedConfig?.accessToken) {
            throw new Error('Failed to refresh Gmail access token');
          }
          config.accessToken = updatedConfig.accessToken;
        }
        
        // Decrypt token before use
        const decryptedToken = await this.decryptToken(config.accessToken);
        return await this.sendGmailMessage(decryptedToken, finalMessage);
      } else if (provider === "outlook") {
        // Use Replit connector for Outlook
        return await this.sendOutlookMessage("", finalMessage); // Access token not needed with connector
      } else if (provider === "smtp") {
        // Enterprise SMTP
        const configurations = await storage.getEmailConfigurations(userId);
        const config = configurations.find(c => c.provider === provider && c.isActive);
        
        if (!config) {
          throw new Error(`SMTP not configured`);
        }
        
        return await this.sendSMTPMessage(config, finalMessage);
      }
      
      throw new Error(`Unsupported provider: ${provider}`);
    } catch (error) {
      console.error(`Failed to send email via ${provider}:`, error);
      throw error;
    }
  }

  private async sendSMTPMessage(config: any, message: EmailMessage): Promise<boolean> {
    try {
      // Simple SMTP implementation using built-in Node.js modules
      const smtpConfig = JSON.parse(config.accessToken || '{}') as SMTPConfiguration;
      
      if (!smtpConfig.host || !smtpConfig.auth) {
        throw new Error('Invalid SMTP configuration');
      }

      // Decrypt SMTP password
      const decryptedPassword = await this.decryptToken(smtpConfig.auth.pass);
      const emailContent = this.buildRFC2822Message(message);
      
      // Use Node.js built-in net module for SMTP
      return await this.sendViaSMTP({
        ...smtpConfig,
        auth: {
          ...smtpConfig.auth,
          pass: decryptedPassword
        }
      }, emailContent);
    } catch (error) {
      console.error('Failed to send SMTP email:', error);
      return false;
    }
  }

  private async sendGmailMessage(accessToken: string, message: EmailMessage): Promise<boolean> {
    const email = this.buildRFC2822Message(message);
    const base64Email = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ raw: base64Email })
    });

    return response.ok;
  }

  private async sendOutlookMessage(accessToken: string, message: EmailMessage): Promise<boolean> {
    try {
      const client = await getUncachableOutlookClient();
      
      const outlookMessage = {
        subject: message.subject,
        body: {
          contentType: message.isHtml ? "HTML" : "Text",
          content: message.body
        },
        toRecipients: message.to.map(email => ({ emailAddress: { address: email } })),
        ccRecipients: message.cc?.map(email => ({ emailAddress: { address: email } })) || [],
        bccRecipients: message.bcc?.map(email => ({ emailAddress: { address: email } })) || []
      };

      await client.api('/me/sendMail').post({
        message: outlookMessage
      });

      return true;
    } catch (error) {
      console.error('Failed to send Outlook email:', error);
      return false;
    }
  }

  private buildRFC2822Message(message: EmailMessage): string {
    const lines = [
      `To: ${message.to.join(", ")}`,
      `Subject: ${message.subject}`,
      `Content-Type: ${message.isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
      "",
      message.body
    ];

    if (message.cc && message.cc.length > 0) {
      lines.splice(1, 0, `Cc: ${message.cc.join(", ")}`);
    }

    if (message.bcc && message.bcc.length > 0) {
      lines.splice(1, 0, `Bcc: ${message.bcc.join(", ")}`);
    }

    return lines.join("\r\n");
  }

  getEmailTemplates(): Record<string, EmailTemplate> {
    return EMAIL_TEMPLATES;
  }

  renderTemplate(template: EmailTemplate, variables: Record<string, any>): { subject: string; body: string } {
    let subject = template.subject;
    let body = template.body;

    // Secure template variable replacement with sanitization
    const allowedVariables = template.variables || [];
    
    Object.keys(variables).forEach(key => {
      // Only allow whitelisted variables
      if (!allowedVariables.includes(key)) {
        console.warn(`Template variable '${key}' not in allowed list for template`);
        return;
      }
      
      // Sanitize variable value to prevent injection
      let sanitizedValue = String(variables[key])
        .replace(/[<>&"']/g, (match) => {
          const escapeMap: Record<string, string> = {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#x27;'
          };
          return escapeMap[match] || match;
        });
      
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, sanitizedValue);
      body = body.replace(regex, sanitizedValue);
    });

    return { subject, body };
  }

  // Token refresh implementation
  async refreshAccessToken(userId: string, provider: string, configId: string): Promise<void> {
    const configurations = await storage.getEmailConfigurations(userId);
    const config = configurations.find(c => c.id === configId);
    
    if (!config || !config.refreshToken) {
      throw new Error('No refresh token available');
    }

    const emailProvider = EMAIL_PROVIDERS[provider];
    if (!emailProvider) {
      throw new Error(`Email provider ${provider} not supported`);
    }

    try {
      const decryptedRefreshToken = await this.decryptToken(config.refreshToken);
      
      const tokenResponse = await fetch(emailProvider.oauthConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: emailProvider.oauthConfig.clientId,
          client_secret: process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] || process.env.GOOGLE_CLIENT_SECRET || "",
          refresh_token: decryptedRefreshToken,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token refresh failed: ${tokenResponse.statusText}`);
      }

      const tokens = await tokenResponse.json();
      
      // Encrypt new tokens
      const encryptedAccessToken = await this.encryptToken(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token ? await this.encryptToken(tokens.refresh_token) : config.refreshToken;

      await storage.updateEmailConfiguration(configId, {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: new Date(Date.now() + (tokens.expires_in * 1000))
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  // SMTP implementation using Node.js net module
  private async sendViaSMTP(config: SMTPConfiguration, emailContent: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const tls = require('tls');
      
      const client = config.secure 
        ? tls.connect(config.port, config.host)
        : net.createConnection(config.port, config.host);

      let step = 0;
      const commands = [
        `HELO ${config.host}`,
        'AUTH LOGIN',
        Buffer.from(config.auth.user).toString('base64'),
        Buffer.from(config.auth.pass).toString('base64'),
        `MAIL FROM: <${config.auth.user}>`,
        emailContent.match(/^To: (.+)$/m)?.[1]?.split(',').map((to: string) => `RCPT TO: <${to.trim()}>`),
        'DATA',
        emailContent,
        '.',
        'QUIT'
      ].flat().filter(Boolean);

      client.on('data', (data: Buffer) => {
        const response = data.toString();
        console.log('SMTP Response:', response);

        if (response.startsWith('2') || response.startsWith('3')) {
          if (step < commands.length) {
            client.write(commands[step] + '\r\n');
            step++;
          } else {
            client.end();
            resolve(true);
          }
        } else {
          client.end();
          reject(new Error(`SMTP Error: ${response}`));
        }
      });

      client.on('connect', () => {
        console.log('Connected to SMTP server');
      });

      client.on('error', (err: Error) => {
        reject(err);
      });

      client.on('end', () => {
        resolve(step >= commands.length);
      });
    });
  }
}

export const emailService = new EmailService();
