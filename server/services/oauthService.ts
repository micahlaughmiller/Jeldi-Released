import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { storage } from "../storage";
import { InsertOAuthUser } from "@shared/schema";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getJwtSecret } from "../env-validation";

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

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    name: "google",
    displayName: "Google",
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
    scope: ["profile", "email"]
  },
  microsoft: {
    name: "microsoft",
    displayName: "Microsoft",
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || "/api/auth/microsoft/callback",
    scope: ["openid", "profile", "email", "offline_access", "User.Read"]
  }
};

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

  static async getCompletedOAuthSession(sessionId: string): Promise<any> {
    const session = await storage.getOAuthSession(sessionId);
    if (!session || !session.isCompleted) {
      return null;
    }
    
    // Clean up session after retrieval
    await storage.deleteOAuthSession(session.id);
    
    return session.authResult;
  }

  static setupStrategies() {
    // Google OAuth Strategy
    if (OAUTH_PROVIDERS.google.clientId && OAUTH_PROVIDERS.google.clientSecret) {
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
            return done(new Error("Missing CSRF state parameter"), null);
          }
          
          const result = await OAuthService.handleOAuthCallback("google", profile, accessToken, refreshToken, state);
          return done(null, result);
        } catch (error) {
          return done(error, null);
        }
      }));
    }

    // Microsoft OAuth Strategy
    if (OAUTH_PROVIDERS.microsoft.clientId && OAUTH_PROVIDERS.microsoft.clientSecret) {
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
            return done(new Error("Missing CSRF state parameter"), null);
          }
          
          const result = await OAuthService.handleOAuthCallback("microsoft", profile, accessToken, refreshToken, state);
          return done(null, result);
        } catch (error) {
          return done(error, null);
        }
      }));
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

    // Check if user exists by email or OAuth ID
    let user = await storage.getUserByEmail(email);
    if (!user) {
      user = await storage.getUserByOAuthId(provider, oauthId);
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
    }

    if (!user) {
      throw new Error("Failed to create or update user");
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, getJwtSecretAtRuntime(), { expiresIn: '7d' });

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
    return Object.values(OAUTH_PROVIDERS).filter(provider => 
      provider.clientId && provider.clientSecret
    );
  }

  static isProviderConfigured(provider: string): boolean {
    const config = OAUTH_PROVIDERS[provider];
    return !!(config && config.clientId && config.clientSecret);
  }
}