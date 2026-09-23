import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { storage } from "../storage";
import { InsertOAuthUser } from "@shared/schema";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getJwtSecret, getSecureCallbackURL, detectEnvironment, validateOAuthCallbacks } from "../env-validation";

// JWT_SECRET accessed at runtime, not import-time
const getJwtSecretAtRuntime = () => getJwtSecret();

export interface OAuthProvider {
  name: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  callbackURL: string;
  scope: string[];
}

function getCallbackURL(provider: string, defaultPath: string): string {
  // Use enhanced secure callback URL function with logging and validation
  return getSecureCallbackURL(provider, defaultPath);
}

// Initialize OAuth providers with enhanced callback URL handling
function initializeOAuthProviders(): Record<string, OAuthProvider> {
  // Validate OAuth callbacks before initializing providers
  const validation = validateOAuthCallbacks();
  if (!validation.isValid) {
    console.error('OAuth callback validation failed:', validation.errors.join(', '));
    // Continue but log warnings - don't fail startup
  }
  if (validation.warnings.length > 0) {
    console.warn('OAuth callback warnings:', validation.warnings.join(', '));
  }
  
  return {
    google: {
      name: "google",
      displayName: "Google",
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL: getCallbackURL("google", "/api/auth/google/callback"),
      scope: ["profile", "email"]
    },
    microsoft: {
      name: "microsoft",
      displayName: "Microsoft",
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
      callbackURL: getCallbackURL("microsoft", "/api/auth/microsoft/callback"),
      scope: ["openid", "profile", "email", "offline_access", "User.Read"]
    }
  };
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = initializeOAuthProviders();

export class OAuthService {
  static generateSecureState(): string {
    return crypto.randomBytes(32).toString('hex');
  }


  static async createOAuthSession(provider: string, state: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await storage.createOAuthSession({
      state,
      provider,
      isCompleted: false,
      expiresAt,
      authResult: null
    });
  }

  static async validateAndCompleteOAuthSession(state: string, authResult: any): Promise<boolean> {
    const session = await storage.getOAuthSessionByState(state);
    if (!session || session.isCompleted || new Date() > session.expiresAt) {
      return false;
    }
    
    await storage.updateOAuthSession(session.id, {
      isCompleted: true,
      authResult
    });
    
    return true;
  }

  static async getCompletedOAuthSession(state: string): Promise<any> {
    // The callback redirect carries the CSRF state, not the row id
    const session = await storage.getOAuthSessionByState(state);
    if (!session || !session.isCompleted) {
      return null;
    }
    
    // Clean up session after retrieval
    await storage.deleteOAuthSession(session.id);
    
    return session.authResult;
  }

  static setupStrategies() {
    const env = detectEnvironment();
    console.log(`Setting up OAuth strategies for ${env.platform} environment`);
    
    // Google OAuth Strategy
    if (OAUTH_PROVIDERS.google.clientId && OAUTH_PROVIDERS.google.clientSecret) {
      console.log(`Configuring Google OAuth with callback: ${OAUTH_PROVIDERS.google.callbackURL}`);
      passport.use(new GoogleStrategy({
        clientID: OAUTH_PROVIDERS.google.clientId,
        clientSecret: OAUTH_PROVIDERS.google.clientSecret,
        callbackURL: OAUTH_PROVIDERS.google.callbackURL,
        passReqToCallback: true
      },
      async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const state = req.query?.state;
          if (!state) {
            console.error('Google OAuth callback missing CSRF state parameter');
            return done(new Error("Missing CSRF state parameter"), null);
          }
          
          const result = await OAuthService.handleOAuthCallback("google", profile, accessToken, refreshToken, state);
          console.log(`Google OAuth callback successful for user: ${profile.emails?.[0]?.value}`);
          return done(null, result);
        } catch (error) {
          console.error('Google OAuth callback error:', error);
          return done(error, null);
        }
      }));
    } else {
      console.warn('Google OAuth not configured - missing client ID or secret');
    }

    // Microsoft OAuth Strategy
    if (OAUTH_PROVIDERS.microsoft.clientId && OAUTH_PROVIDERS.microsoft.clientSecret) {
      console.log(`Configuring Microsoft OAuth with callback: ${OAUTH_PROVIDERS.microsoft.callbackURL}`);
      passport.use(new MicrosoftStrategy({
        clientID: OAUTH_PROVIDERS.microsoft.clientId,
        clientSecret: OAUTH_PROVIDERS.microsoft.clientSecret,
        callbackURL: OAUTH_PROVIDERS.microsoft.callbackURL,
        scope: OAUTH_PROVIDERS.microsoft.scope,
        passReqToCallback: true
      },
      async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const state = req.query?.state;
          if (!state) {
            console.error('Microsoft OAuth callback missing CSRF state parameter');
            return done(new Error("Missing CSRF state parameter"), null);
          }
          
          const result = await OAuthService.handleOAuthCallback("microsoft", profile, accessToken, refreshToken, state);
          console.log(`Microsoft OAuth callback successful for user: ${profile.emails?.[0]?.value || profile.username}`);
          return done(null, result);
        } catch (error) {
          console.error('Microsoft OAuth callback error:', error);
          return done(error, null);
        }
      }));
    } else {
      console.warn('Microsoft OAuth not configured - missing client ID or secret');
    }

    // Passport serialization
    passport.serializeUser((user: any, done) => {
      done(null, user);
    });

    passport.deserializeUser((user: any, done) => {
      done(null, user);
    });
  }

  static async handleOAuthCallback(
    provider: string, 
    profile: any, 
    accessToken: string, 
    refreshToken: string | undefined,
    state: string
  ) {
    let email: string = "";
    let firstName: string = "";
    let lastName: string = "";
    let profileImage: string = "";
    let oauthId: string = "";

    if (provider === "google") {
      email = profile.emails?.[0]?.value || "";
      firstName = profile.name?.givenName || "";
      lastName = profile.name?.familyName || "";
      profileImage = profile.photos?.[0]?.value || "";
      oauthId = profile.id;
    } else if (provider === "microsoft") {
      email = profile.emails?.[0]?.value || profile.username || "";
      firstName = profile.name?.givenName || "";
      lastName = profile.name?.familyName || "";
      profileImage = profile.photos?.[0]?.value || "";
      oauthId = profile.id;
    }

    if (!email || !oauthId) {
      throw new Error("Invalid OAuth profile data");
    }

    // Prefer the provider's stable id. Only fall back to email when the provider vouches for it,
    // otherwise an unverified address could take over an existing local account.
    const emailVerified: boolean = provider === "google"
      ? Boolean(profile.emails?.[0]?.verified ?? profile._json?.email_verified)
      : true; // Microsoft identities are tenant-verified
    let user = await storage.getUserByOAuthId(provider, oauthId);
    if (!user) {
      const byEmail = await storage.getUserByEmail(email);
      if (byEmail && !emailVerified) {
        throw new Error("This email address is not verified by the identity provider");
      }
      user = byEmail;
    }

    if (user) {
      // Update existing user with OAuth info if needed
      if (user.authProvider === "local" || user.oauthId !== oauthId) {
        user = await storage.updateUser(user.id, {
          authProvider: provider as any,
          oauthId,
          profileImage: profileImage || user.profileImage,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
        });
      }
    } else {
      // Create new OAuth user
      const userData: InsertOAuthUser = {
        username: email.split("@")[0] + "_" + Date.now(), // Generate unique username
        email,
        authProvider: provider as any,
        oauthId,
        profileImage,
        firstName,
        lastName,
        role: "user"
      };

      user = await storage.createOAuthUser(userData);
      
      // Assign RBAC role for new OAuth user (always regular user role, not admin)
      try {
        const role = await storage.getRoleByName("user");
        if (role) {
          await storage.assignRoleToUser(user.id, role.id);
          console.log(`Assigned user role to OAuth user ${user.email}`);
        }
      } catch (roleError) {
        console.error("Error assigning role to OAuth user:", roleError);
      }
    }

    if (!user) {
      throw new Error("Failed to create or update user");
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, jti: crypto.randomUUID() }, getJwtSecretAtRuntime(), { expiresIn: '7d' });

    const authResult = {
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage
      }
    };

    // Store result securely in session and validate state
    const sessionValid = await OAuthService.validateAndCompleteOAuthSession(state, authResult);
    if (!sessionValid) {
      throw new Error("Invalid or expired OAuth session");
    }

    return { sessionState: state, authResult };
  }

  static getAvailableProviders(): OAuthProvider[] {
    const availableProviders = Object.values(OAUTH_PROVIDERS).filter(provider => 
      provider.clientId && provider.clientSecret
    );
    
    console.log(`Available OAuth providers: ${availableProviders.map(p => p.name).join(', ')}`);
    return availableProviders;
  }

  static isProviderConfigured(provider: string): boolean {
    const config = OAUTH_PROVIDERS[provider];
    const isConfigured = !!(config && config.clientId && config.clientSecret);
    
    if (!isConfigured) {
      console.warn(`OAuth provider '${provider}' is not properly configured`);
    }
    
    return isConfigured;
  }
  
  /**
   * Validate callback URL against environment allowlist
   */
  static validateCallbackURL(callbackURL: string): boolean {
    const env = detectEnvironment();
    
    // Check if callback URL is in allowed origins
    const isAllowed = env.allowedOrigins.some(origin => {
      if (origin.includes('*')) {
        // Handle wildcard patterns
        const pattern = origin.replace(/\*/g, '.*');
        return new RegExp(pattern).test(callbackURL);
      }
      return callbackURL.startsWith(origin);
    });
    
    if (!isAllowed) {
      console.warn(`Callback URL '${callbackURL}' is not in allowed origins: ${env.allowedOrigins.join(', ')}`);
    }
    
    return isAllowed;
  }
  
  /**
   * Get environment-specific OAuth configuration
   */
  static getEnvironmentConfig() {
    const env = detectEnvironment();
    const validation = validateOAuthCallbacks();
    
    return {
      environment: env,
      validation,
      providers: Object.values(OAUTH_PROVIDERS).map(provider => ({
        name: provider.name,
        configured: this.isProviderConfigured(provider.name),
        callbackURL: provider.callbackURL,
        callbackURLValid: this.validateCallbackURL(provider.callbackURL)
      }))
    };
  }
}