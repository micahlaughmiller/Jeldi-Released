import { storage } from "../storage";
import type { EmailConfiguration } from "@shared/schema";
import { getUncachableOutlookClient } from "./outlookClient";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { isDemoEnvironment } from "./demo-data";
import { getTokenEncryptionKey, getSecureCallbackURL, detectEnvironment, validateDomainSecurity, getAllowedOrigins } from "../env-validation";

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
    displayName: "Outlook / Microsoft 365",
    oauthConfig: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
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

/** OAuth client secret for an email provider (Outlook must never fall back to the Google secret) */
export function clientSecretFor(provider: string): string {
  if (provider === "gmail") return process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
  if (provider === "outlook") return process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || "";
  return process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] || "";
}

export interface OutboxMessage {
  id: string;
  provider: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  isHtml: boolean;
  sentAt: string;
}
// Demo outbox: captured messages per user, newest first, in memory only
const outbox = new Map<string, OutboxMessage[]>();

function getEmailOAuthRedirectUris(): string[] {
  // Use enhanced environment detection for better multi-domain support
  const env = detectEnvironment();
  const redirectUris: string[] = [];
  
  // Add explicit EMAIL_OAUTH_REDIRECT_URI if set and secure
  const explicitUri = process.env.EMAIL_OAUTH_REDIRECT_URI;
  if (explicitUri) {
    const validation = validateDomainSecurity(explicitUri, env.isProduction);
    if (validation.isSecure) {
      redirectUris.push(explicitUri);
    } else {
      console.warn(`EMAIL_OAUTH_REDIRECT_URI failed security validation: ${validation.errors.join(', ')}`);
    }
  }
  
  // Add environment-based allowed origins with email callback path
  const allowedOrigins = getAllowedOrigins(env);
  for (const origin of allowedOrigins) {
    if (!origin.includes('*')) { // Skip wildcard patterns for specific URIs
      const uri = `${origin.replace(/\/+$/, '')}/api/email/callback`;
      const validation = validateDomainSecurity(uri, env.isProduction);
      if (validation.isSecure || env.isDevelopment) {
        redirectUris.push(uri);
      }
    }
  }
  
  // Add secure callback URL from enhanced function
  const secureCallback = getSecureCallbackURL('email', '/api/email/callback');
  if (!redirectUris.includes(secureCallback)) {
    redirectUris.push(secureCallback);
  }
  
  // Remove duplicates and empty values
  const uniqueUris = [...new Set(redirectUris.filter(Boolean))];
  
  console.log(`Email OAuth redirect URIs (${env.platform}): ${uniqueUris.join(', ')}`);
  return uniqueUris;
}

function getEmailOAuthRedirectUri(): string {
  // Use enhanced secure callback URL function with environment detection and logging
  const callbackUrl = getSecureCallbackURL('email', '/api/email/callback');
  
  // Additional validation for email OAuth
  const env = detectEnvironment();
  const validation = validateDomainSecurity(callbackUrl, env.isProduction);
  
  if (!validation.isSecure && env.isProduction) {
    console.error(`Email OAuth redirect URI security violation: ${validation.errors.join(', ')}`);
    throw new Error('Email OAuth redirect URI must use HTTPS in production');
  }
  
  console.log(`Primary email OAuth redirect URI: ${callbackUrl}`);
  return callbackUrl;
}

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

  async checkOutlookConnection(userId?: string): Promise<{ isConnected: boolean; email?: string }> {
    if (userId) {
      const configs = await storage.getEmailConfigurations(userId);
      const outlook = configs.find(c => c.provider === "outlook" && c.isActive && c.accessToken);
      if (outlook) return { isConnected: true, email: outlook.email || undefined };
    }
    // Replit-hosted deployments may have the platform connector instead of a direct OAuth grant
    if (!process.env.CONNECTORS_HOSTNAME) return { isConnected: false };
    try {
      const client = await getUncachableOutlookClient();
      const user = await client.api('/me').get();
      return { isConnected: true, email: user.mail || user.userPrincipalName };
    } catch (error) {
      console.error('Outlook connector check failed:', (error as Error).message);
      return { isConnected: false };
    }
  }

  /** Demo outbox is available on the demo deployment and anywhere that is not production */
  isDemoOutboxEnabled(): boolean {
    return isDemoEnvironment() || process.env.NODE_ENV !== "production";
  }

  getOutbox(userId: string): OutboxMessage[] {
    return outbox.get(userId) ?? [];
  }

  /** Verify SMTP settings by logging in, without sending anything */
  async verifySmtp(config: SMTPConfiguration): Promise<void> {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.auth.user, pass: config.auth.pass },
      connectionTimeout: 10_000,
    });
    await transport.verify();
    transport.close();
  }

  async initiateEmailOAuth(provider: string, userId: string, redirectUri: string): Promise<string> {
    const emailProvider = EMAIL_PROVIDERS[provider];
    if (!emailProvider) {
      throw new Error(`Email provider ${provider} not supported`);
    }

    console.log(`Initiating email OAuth for provider: ${provider}, user: ${userId}`);
    
    // Enhanced security validation for redirect URI
    const env = detectEnvironment();
    const domainValidation = validateDomainSecurity(redirectUri, env.isProduction);
    
    if (!domainValidation.isSecure) {
      console.error(`Email OAuth redirect URI security validation failed: ${domainValidation.errors.join(', ')}`);
      throw new Error(`Redirect URI security validation failed: ${domainValidation.errors.join(', ')}`);
    }
    
    // Validate redirect URI against enhanced allowlist
    const allowedRedirectUris = getEmailOAuthRedirectUris();
    const isAllowed = allowedRedirectUris.some(allowedUri => {
      // Support both exact match and origin-based matching
      return redirectUri === allowedUri || redirectUri.startsWith(allowedUri.split('/api/')[0]);
    });
    
    if (!isAllowed) {
      console.error(`Email OAuth redirect URI not in allowlist: ${redirectUri}`);
      console.error(`Allowed URIs: ${allowedRedirectUris.join(', ')}`);
      throw new Error(`Invalid redirect URI: ${redirectUri}. Allowed URIs: ${allowedRedirectUris.join(', ')}. Please configure this URI in your OAuth provider settings.`);
    }
    
    console.log(`Email OAuth redirect URI validated: ${redirectUri}`);

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
    await this.updateEmailOAuthSession(state, { codeVerifier, redirectUri });

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
    const redirectUri: string | undefined = session.authResult?.redirectUri || process.env.EMAIL_OAUTH_REDIRECT_URI;
    if (!redirectUri) {
      throw new Error('Email OAuth session is missing its redirect URI');
    }
    const emailProvider = EMAIL_PROVIDERS[provider];
    
    if (!emailProvider) {
      throw new Error(`Invalid email provider: ${provider}`);
    }

    // Build token request with PKCE
    const tokenParams: any = {
      grant_type: "authorization_code",
      client_id: emailProvider.oauthConfig.clientId,
      code,
      redirect_uri: redirectUri, // Use validated redirect URI instead of default
      code_verifier: codeVerifier
    };
    
    // Validate redirect URI before token exchange
    const env = detectEnvironment();
    const validation = validateDomainSecurity(tokenParams.redirect_uri, env.isProduction);
    if (!validation.isSecure) {
      console.error(`Token exchange redirect URI validation failed: ${validation.errors.join(', ')}`);
      throw new Error('Invalid redirect URI for token exchange');
    }
    
    console.log(`Exchanging email OAuth code for tokens, provider: ${provider}, redirect: ${tokenParams.redirect_uri}`);

    // Web-application registrations at Google and Microsoft require the client secret even with PKCE
    const secret = clientSecretFor(provider);
    if (secret) {
      tokenParams.client_secret = secret;
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

      if (provider === "demo") {
        if (!this.isDemoOutboxEnabled()) {
          throw new Error("The demo outbox is not available in production");
        }
        const list = outbox.get(userId) ?? [];
        list.unshift({
          id: crypto.randomUUID(),
          provider,
          to: finalMessage.to,
          cc: finalMessage.cc ?? [],
          subject: finalMessage.subject,
          body: finalMessage.body,
          isHtml: Boolean(finalMessage.isHtml),
          sentAt: new Date().toISOString(),
        });
        outbox.set(userId, list.slice(0, 50));
        console.log(`[demo outbox] ${userId} -> ${finalMessage.to.join(", ")}: ${finalMessage.subject}`);
        return true;
      }

      if (provider === "gmail" || provider === "outlook") {
        const configurations = await storage.getEmailConfigurations(userId);
        const config = configurations.find(c => c.provider === provider && c.isActive);

        if (!config || !config.accessToken) {
          if (provider === "outlook" && process.env.CONNECTORS_HOSTNAME) {
            return await this.sendOutlookViaConnector(finalMessage);
          }
          throw new Error(`${EMAIL_PROVIDERS[provider].displayName} is not connected`);
        }

        // Refresh a minute early so a token that expires mid-request is not used
        if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 60_000) {
          if (!config.refreshToken) {
            throw new Error(`${EMAIL_PROVIDERS[provider].displayName} access token expired and no refresh token is stored; reconnect the account`);
          }
          await this.refreshAccessToken(userId, provider, config.id);
          const refreshed = (await storage.getEmailConfigurations(userId)).find(c => c.id === config.id);
          if (!refreshed?.accessToken) {
            throw new Error(`Failed to refresh ${EMAIL_PROVIDERS[provider].displayName} access token`);
          }
          config.accessToken = refreshed.accessToken;
        }

        const token = await this.decryptToken(config.accessToken);
        const ok = provider === "gmail"
          ? await this.sendGmailMessage(token, finalMessage)
          : await this.sendOutlookMessage(token, finalMessage);
        if (ok) await storage.updateEmailConfiguration(config.id, { lastUsed: new Date() }).catch(() => undefined);
        return ok;
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

  private async sendSMTPMessage(config: EmailConfiguration, message: EmailMessage): Promise<boolean> {
    const smtpConfig = JSON.parse(config.accessToken || '{}') as SMTPConfiguration;
    if (!smtpConfig.host || !smtpConfig.auth) {
      throw new Error('Invalid SMTP configuration');
    }
    const password = await this.decryptToken(smtpConfig.auth.pass);
    const transport = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: { user: smtpConfig.auth.user, pass: password },
      connectionTimeout: 15_000,
    });
    try {
      await transport.sendMail({
        from: config.email || smtpConfig.auth.user,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        ...(message.isHtml ? { html: message.body } : { text: message.body }),
        attachments: message.attachments?.map(a => ({ filename: a.name, content: a.data, encoding: "base64", contentType: a.contentType })),
      });
      await storage.updateEmailConfiguration(config.id, { lastUsed: new Date() }).catch(() => undefined);
      return true;
    } finally {
      transport.close();
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

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 401) throw new Error("Gmail authentication failed - reconnect the account");
      throw new Error(`Gmail send failed: HTTP ${response.status} ${text.slice(0, 200)}`);
    }
    return true;
  }

  /** Send through Microsoft Graph with the user's own OAuth token (work or personal account) */
  private async sendOutlookMessage(accessToken: string, message: EmailMessage): Promise<boolean> {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: message.isHtml ? "HTML" : "Text", content: message.body },
          toRecipients: message.to.map(email => ({ emailAddress: { address: email } })),
          ccRecipients: (message.cc ?? []).map(email => ({ emailAddress: { address: email } })),
          bccRecipients: (message.bcc ?? []).map(email => ({ emailAddress: { address: email } })),
          attachments: (message.attachments ?? []).map(a => ({
            "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType, contentBytes: a.data,
          })),
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 401) throw new Error("Outlook authentication failed - reconnect the account");
      throw new Error(`Outlook send failed: HTTP ${response.status} ${text.slice(0, 200)}`);
    }
    return true;
  }

  /** Replit-hosted deployments only: send through the platform's Outlook connector */
  private async sendOutlookViaConnector(message: EmailMessage): Promise<boolean> {
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
    // Only whitelisted top-level variables are visible to the template
    const allowed = new Set(template.variables || []);
    const scope: Record<string, any> = {};
    for (const [k, v] of Object.entries(variables)) {
      if (allowed.has(k)) scope[k] = v;
      else console.warn(`Template variable '${k}' not in allowed list for template`);
    }
    return { subject: renderMustache(template.subject, scope), body: renderMustache(template.body, scope) };
  }

  /**
   * Validate email provider configuration and security
   */
  validateEmailProviderConfig(provider: string): { isValid: boolean; errors: string[] } {
    const emailProvider = EMAIL_PROVIDERS[provider];
    const errors: string[] = [];
    
    if (!emailProvider) {
      errors.push(`Email provider '${provider}' not supported`);
      return { isValid: false, errors };
    }
    
    if (!emailProvider.oauthConfig.clientId) {
      errors.push(`Missing client ID for email provider '${provider}'`);
    }
    
    const env = detectEnvironment();
    
    // Validate OAuth URLs are secure in production
    if (env.isProduction) {
      if (!emailProvider.oauthConfig.authUrl.startsWith('https://')) {
        errors.push(`Auth URL must use HTTPS in production: ${emailProvider.oauthConfig.authUrl}`);
      }
      if (!emailProvider.oauthConfig.tokenUrl.startsWith('https://')) {
        errors.push(`Token URL must use HTTPS in production: ${emailProvider.oauthConfig.tokenUrl}`);
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }
  
  /**
   * Get environment-specific email configuration
   */
  getEnvironmentConfig() {
    const env = detectEnvironment();
    const allowedUris = getEmailOAuthRedirectUris();
    
    return {
      environment: env,
      allowedRedirectUris: allowedUris,
      providers: Object.values(EMAIL_PROVIDERS).map(provider => {
        const validation = this.validateEmailProviderConfig(provider.name);
        return {
          name: provider.name,
          configured: validation.isValid,
          errors: validation.errors,
          clientId: provider.oauthConfig.clientId ? '[CONFIGURED]' : '[MISSING]'
        };
      })
    };
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
          client_secret: clientSecretFor(provider),
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

}

export const emailService = new EmailService();

/**
 * Minimal Mustache subset for the built-in templates: {{var}}, {{.}}, {{#list}}...{{/list}} over
 * arrays (or a truthy value), {{#if flag}}...{{/if}}. Values are HTML-escaped.
 */
export function renderMustache(tpl: string, scope: Record<string, any>): string {
  const esc = (v: unknown) => String(v ?? "").replace(/[<>&"']/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#x27;" }[ch] as string));
  const lookup = (key: string, ctx: unknown[]): unknown => {
    if (key === ".") return ctx[ctx.length - 1];
    for (let i = ctx.length - 1; i >= 0; i--) {
      const c = ctx[i];
      if (c && typeof c === "object" && key in (c as object)) return (c as any)[key];
    }
    return undefined;
  };
  const render = (src: string, ctx: unknown[]): string => {
    // sections: {{#name}} ... {{/name}} and {{#if name}} ... {{/if}}
    src = src.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (_, name, inner) => {
      const v = lookup(name, ctx);
      return (Array.isArray(v) ? v.length > 0 : Boolean(v)) ? render(inner, ctx) : "";
    });
    src = src.replace(/{{#(\w+)}}([\s\S]*?){{\/\1}}/g, (_, name, inner) => {
      const v = lookup(name, ctx);
      if (Array.isArray(v)) return v.map(item => render(inner, [...ctx, item])).join("");
      return v ? render(inner, ctx) : "";
    });
    return src.replace(/{{\s*([\w.]+)\s*}}/g, (_, name) => {
      const v = lookup(name, ctx);
      return esc(typeof v === "object" && v !== null && !Array.isArray(v) ? JSON.stringify(v) : Array.isArray(v) ? v.join(", ") : v);
    });
  };
  return render(tpl, [scope]);
}
