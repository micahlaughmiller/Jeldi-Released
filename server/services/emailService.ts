import { storage } from "../storage";
import type { EmailConfiguration } from "@shared/schema";
import { getUncachableOutlookClient } from "./outlookClient";

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
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      clientId: process.env.OUTLOOK_CLIENT_ID || "",
      scopes: ["https://graph.microsoft.com/Mail.Send", "https://graph.microsoft.com/Mail.Read"]
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
  async getEmailConfigurations(userId: string): Promise<EmailConfiguration[]> {
    return await storage.getEmailConfigurations(userId);
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

    // Generate OAuth URL
    const params = new URLSearchParams({
      client_id: emailProvider.oauthConfig.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: emailProvider.oauthConfig.scopes.join(" "),
      state: `${userId}-${provider}-${Date.now()}`
    });

    return `${emailProvider.oauthConfig.authUrl}?${params.toString()}`;
  }

  async handleEmailOAuthCallback(code: string, state: string): Promise<EmailConfiguration> {
    const [userId, provider] = state.split("-");
    const emailProvider = EMAIL_PROVIDERS[provider];
    
    if (!emailProvider) {
      throw new Error(`Invalid email provider: ${provider}`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(emailProvider.oauthConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: emailProvider.oauthConfig.clientId,
        client_secret: process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] || process.env.GOOGLE_CLIENT_SECRET || "",
        code,
        redirect_uri: process.env.EMAIL_OAUTH_REDIRECT_URI || ""
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to exchange code for tokens: ${tokenResponse.statusText}`);
    }

    const tokens = await tokenResponse.json();
    
    // Get user email address
    let userEmail = "";
    if (provider === "gmail") {
      const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { "Authorization": `Bearer ${tokens.access_token}` }
      });
      const profile = await profileResponse.json();
      userEmail = profile.emailAddress;
    } else if (provider === "outlook") {
      const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { "Authorization": `Bearer ${tokens.access_token}` }
      });
      const profile = await profileResponse.json();
      userEmail = profile.mail || profile.userPrincipalName;
    }

    // Update email configuration
    const configurations = await storage.getEmailConfigurations(userId);
    const config = configurations.find(c => c.provider === provider);
    
    if (!config) {
      throw new Error("Email configuration not found");
    }

    const updatedConfig = await storage.updateEmailConfiguration(config.id, {
      email: userEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + (tokens.expires_in * 1000)),
      isActive: true
    });

    if (!updatedConfig) {
      throw new Error("Failed to update email configuration");
    }

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
        
        return await this.sendGmailMessage(config.accessToken, finalMessage);
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

      // For now, we'll use a basic implementation
      // In a production environment, you'd want to use a proper SMTP library
      const emailContent = this.buildRFC2822Message(message);
      
      // This is a simplified implementation - in production you'd use nodemailer or similar
      console.log('SMTP Email would be sent with config:', smtpConfig.host);
      console.log('Email content:', emailContent);
      
      return true; // Simplified for now
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

    // Simple template variable replacement
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, String(variables[key]));
      body = body.replace(regex, String(variables[key]));
    });

    return { subject, body };
  }
}

export const emailService = new EmailService();
