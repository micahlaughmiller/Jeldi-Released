import { 
  users, erpConnections, kpiConfigurations, kpiData, emailConfigurations, chatHistory, oauthSessions, userPreferences,
  type User, type InsertUser, type InsertOAuthUser, type ErpConnection, type InsertErpConnection,
  type KpiConfiguration, type InsertKpiConfiguration, type KpiData, type InsertKpiData,
  type EmailConfiguration, type InsertEmailConfiguration, type ChatHistory, type InsertChatHistory,
  type OAuthSession, type InsertOAuthSession, type UserPreferences, type InsertUserPreferences, type UpdateUserPreferences
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOAuthId(provider: string, oauthId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createOAuthUser(user: InsertOAuthUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // OAuth Session operations
  createOAuthSession(session: InsertOAuthSession): Promise<OAuthSession>;
  getOAuthSession(id: string): Promise<OAuthSession | undefined>;
  getOAuthSessionByState(state: string): Promise<OAuthSession | undefined>;
  updateOAuthSession(id: string, updates: Partial<OAuthSession>): Promise<OAuthSession | undefined>;
  deleteOAuthSession(id: string): Promise<boolean>;
  cleanupExpiredOAuthSessions(): Promise<void>;

  // ERP Connection operations
  getErpConnections(userId: string): Promise<ErpConnection[]>;
  getErpConnection(userId: string, erpSystem: string): Promise<ErpConnection | undefined>;
  createErpConnection(connection: InsertErpConnection): Promise<ErpConnection>;
  updateErpConnection(id: string, updates: Partial<ErpConnection>): Promise<ErpConnection | undefined>;

  // KPI operations
  getKpiConfigurations(userId: string): Promise<KpiConfiguration[]>;
  createKpiConfiguration(config: InsertKpiConfiguration): Promise<KpiConfiguration>;
  updateKpiConfiguration(id: string, updates: Partial<KpiConfiguration>): Promise<KpiConfiguration | undefined>;
  deleteKpiConfiguration(id: string): Promise<boolean>;
  
  // KPI Data operations
  getLatestKpiData(kpiId: string): Promise<KpiData | undefined>;
  createKpiData(data: InsertKpiData): Promise<KpiData>;
  getKpiDataHistory(kpiId: string, limit?: number): Promise<KpiData[]>;

  // Email Configuration operations
  getEmailConfigurations(userId: string): Promise<EmailConfiguration[]>;
  createEmailConfiguration(config: InsertEmailConfiguration): Promise<EmailConfiguration>;
  updateEmailConfiguration(id: string, updates: Partial<EmailConfiguration>): Promise<EmailConfiguration | undefined>;

  // Chat History operations
  getChatHistory(userId: string, limit?: number): Promise<ChatHistory[]>;
  createChatHistory(chat: InsertChatHistory): Promise<ChatHistory>;

  // User Preferences operations
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
  updateUserPreferences(userId: string, updates: UpdateUserPreferences): Promise<UserPreferences | undefined>;
  resetUserPreferences(userId: string): Promise<UserPreferences | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUserByOAuthId(provider: string, oauthId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(and(eq(users.authProvider, provider), eq(users.oauthId, oauthId)));
    return user || undefined;
  }

  async createOAuthUser(insertOAuthUser: InsertOAuthUser): Promise<User> {
    const [user] = await db.insert(users).values(insertOAuthUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getErpConnections(userId: string): Promise<ErpConnection[]> {
    return await db.select().from(erpConnections).where(eq(erpConnections.userId, userId));
  }

  async getErpConnection(userId: string, erpSystem: string): Promise<ErpConnection | undefined> {
    const [connection] = await db.select().from(erpConnections)
      .where(and(eq(erpConnections.userId, userId), eq(erpConnections.erpSystem, erpSystem)));
    return connection || undefined;
  }

  async createErpConnection(connection: InsertErpConnection): Promise<ErpConnection> {
    const [newConnection] = await db.insert(erpConnections).values(connection).returning();
    return newConnection;
  }

  async updateErpConnection(id: string, updates: Partial<ErpConnection>): Promise<ErpConnection | undefined> {
    const [updated] = await db.update(erpConnections)
      .set(updates)
      .where(eq(erpConnections.id, id))
      .returning();
    return updated || undefined;
  }

  async getKpiConfigurations(userId: string): Promise<KpiConfiguration[]> {
    return await db.select().from(kpiConfigurations)
      .where(eq(kpiConfigurations.userId, userId))
      .orderBy(kpiConfigurations.position);
  }

  async createKpiConfiguration(config: InsertKpiConfiguration): Promise<KpiConfiguration> {
    const [newConfig] = await db.insert(kpiConfigurations).values(config).returning();
    return newConfig;
  }

  async updateKpiConfiguration(id: string, updates: Partial<KpiConfiguration>): Promise<KpiConfiguration | undefined> {
    const [updated] = await db.update(kpiConfigurations)
      .set(updates)
      .where(eq(kpiConfigurations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteKpiConfiguration(id: string): Promise<boolean> {
    const result = await db.delete(kpiConfigurations).where(eq(kpiConfigurations.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getLatestKpiData(kpiId: string): Promise<KpiData | undefined> {
    const [data] = await db.select().from(kpiData)
      .where(eq(kpiData.kpiId, kpiId))
      .orderBy(desc(kpiData.timestamp))
      .limit(1);
    return data || undefined;
  }

  async createKpiData(data: InsertKpiData): Promise<KpiData> {
    const [newData] = await db.insert(kpiData).values(data).returning();
    return newData;
  }

  async getKpiDataHistory(kpiId: string, limit = 50): Promise<KpiData[]> {
    return await db.select().from(kpiData)
      .where(eq(kpiData.kpiId, kpiId))
      .orderBy(desc(kpiData.timestamp))
      .limit(limit);
  }

  async getEmailConfigurations(userId: string): Promise<EmailConfiguration[]> {
    return await db.select().from(emailConfigurations)
      .where(eq(emailConfigurations.userId, userId));
  }

  async createEmailConfiguration(config: InsertEmailConfiguration): Promise<EmailConfiguration> {
    const [newConfig] = await db.insert(emailConfigurations).values(config).returning();
    return newConfig;
  }

  async updateEmailConfiguration(id: string, updates: Partial<EmailConfiguration>): Promise<EmailConfiguration | undefined> {
    const [updated] = await db.update(emailConfigurations)
      .set(updates)
      .where(eq(emailConfigurations.id, id))
      .returning();
    return updated || undefined;
  }

  async getChatHistory(userId: string, limit = 50): Promise<ChatHistory[]> {
    return await db.select().from(chatHistory)
      .where(eq(chatHistory.userId, userId))
      .orderBy(desc(chatHistory.timestamp))
      .limit(limit);
  }

  async createChatHistory(chat: InsertChatHistory): Promise<ChatHistory> {
    const [newChat] = await db.insert(chatHistory).values(chat).returning();
    return newChat;
  }

  async createOAuthSession(session: InsertOAuthSession): Promise<OAuthSession> {
    const [newSession] = await db.insert(oauthSessions).values(session).returning();
    return newSession;
  }

  async getOAuthSession(id: string): Promise<OAuthSession | undefined> {
    const [session] = await db.select().from(oauthSessions).where(eq(oauthSessions.id, id));
    return session || undefined;
  }

  async getOAuthSessionByState(state: string): Promise<OAuthSession | undefined> {
    const [session] = await db.select().from(oauthSessions).where(eq(oauthSessions.state, state));
    return session || undefined;
  }

  async updateOAuthSession(id: string, updates: Partial<OAuthSession>): Promise<OAuthSession | undefined> {
    const [updated] = await db.update(oauthSessions)
      .set(updates)
      .where(eq(oauthSessions.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteOAuthSession(id: string): Promise<boolean> {
    const result = await db.delete(oauthSessions).where(eq(oauthSessions.id, id));
    return (result.rowCount || 0) > 0;
  }

  async cleanupExpiredOAuthSessions(): Promise<void> {
    await db.delete(oauthSessions).where(sql`${oauthSessions.expiresAt} < NOW()`);
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [preferences] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return preferences || undefined;
  }

  async createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    const [newPreferences] = await db.insert(userPreferences).values(preferences).returning();
    return newPreferences;
  }

  async updateUserPreferences(userId: string, updates: UpdateUserPreferences): Promise<UserPreferences | undefined> {
    const [updated] = await db.update(userPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userPreferences.userId, userId))
      .returning();
    return updated || undefined;
  }

  async resetUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    // Delete existing preferences and create default ones
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
    return await this.createUserPreferences({ userId });
  }
}

export const storage = new DatabaseStorage();
