import { db } from "../db";
import { sessions, type InsertSession, type Session } from "@shared/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import type { Request } from "express";

class SessionService {
  readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  readonly MAX_CONCURRENT_SESSIONS = 3;

  /**
   * Create a new session for a user
   */
  async createSession(userId: string, token: string, req: Request): Promise<Session> {
    // Check concurrent session limit
    const activeSessions = await this.getUserActiveSessions(userId);
    
    if (activeSessions.length >= this.MAX_CONCURRENT_SESSIONS) {
      // Remove oldest session
      const oldestSession = activeSessions[activeSessions.length - 1];
      await this.terminateSession(oldestSession.token);
    }

    const expiresAt = new Date(Date.now() + this.SESSION_TIMEOUT);
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const newSession: InsertSession = {
      userId,
      token,
      ipAddress,
      userAgent,
      isActive: true,
      expiresAt,
    };

    const [session] = await db.insert(sessions).values(newSession).returning();
    return session;
  }

  /**
   * Validate a session by token
   */
  async validateSession(token: string): Promise<Session | null> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.token, token),
        eq(sessions.isActive, true)
      ))
      .limit(1);

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (new Date() > new Date(session.expiresAt)) {
      await this.terminateSession(token);
      return null;
    }

    return session;
  }

  /**
   * Update last activity timestamp for a session
   */
  async updateActivity(token: string): Promise<void> {
    const newExpiresAt = new Date(Date.now() + this.SESSION_TIMEOUT);
    
    await db
      .update(sessions)
      .set({
        lastActivity: new Date(),
        expiresAt: newExpiresAt,
      })
      .where(eq(sessions.token, token));
  }

  /**
   * Terminate a session
   */
  async terminateSession(token: string): Promise<void> {
    await db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.token, token));
  }

  /**
   * Terminate all sessions for a user
   */
  async terminateAllUserSessions(userId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.userId, userId));
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<Session[]> {
    return await db
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.userId, userId),
        eq(sessions.isActive, true)
      ))
      .orderBy(desc(sessions.lastActivity));
  }

  /**
   * Cleanup expired sessions (should be run periodically)
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    
    await db
      .update(sessions)
      .set({ isActive: false })
      .where(and(
        eq(sessions.isActive, true),
        lt(sessions.expiresAt, now)
      ));
  }

  /**
   * Get session info by token
   */
  async getSessionInfo(token: string): Promise<Session | null> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);

    return session || null;
  }

  /**
   * Get session info by ID
   */
  async getSessionById(sessionId: string): Promise<Session | null> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    return session || null;
  }

  /**
   * Terminate session by ID
   */
  async terminateSessionById(sessionId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));
  }

  /**
   * Extend session expiry
   */
  async extendSession(token: string): Promise<void> {
    const newExpiresAt = new Date(Date.now() + this.SESSION_TIMEOUT);
    
    await db
      .update(sessions)
      .set({
        expiresAt: newExpiresAt,
        lastActivity: new Date(),
      })
      .where(and(
        eq(sessions.token, token),
        eq(sessions.isActive, true)
      ));
  }
}

export const sessionService = new SessionService();
