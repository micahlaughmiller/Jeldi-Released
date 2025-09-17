import { 
  users, erpConnections, kpiConfigurations, kpiData, emailConfigurations, chatHistory, oauthSessions, userPreferences,
  conversations, queryTemplates, favoriteQueries, roles, permissions, userRoles, rolePermissions, auditLog,
  organizations, organizationMembers,
  type User, type InsertUser, type InsertOAuthUser, type ErpConnection, type InsertErpConnection,
  type KpiConfiguration, type InsertKpiConfiguration, type KpiData, type InsertKpiData,
  type EmailConfiguration, type InsertEmailConfiguration, type ChatHistory, type InsertChatHistory,
  type OAuthSession, type InsertOAuthSession, type UserPreferences, type InsertUserPreferences, type UpdateUserPreferences,
  type Conversation, type InsertConversation, type QueryTemplate, type InsertQueryTemplate,
  type FavoriteQuery, type InsertFavoriteQuery,
  type Role, type InsertRole, type UpdateRole, type Permission, type InsertPermission,
  type UserRole, type InsertUserRole, type UpdateUserRole, type RolePermission, type InsertRolePermission,
  type AuditLog, type InsertAuditLog, type UserWithRoles, type RoleWithPermissions,
  type Organization, type InsertOrganization, type UpdateOrganization,
  type OrganizationMember, type InsertOrganizationMember, type UpdateOrganizationMember,
  type OrganizationWithMembers, type UserWithOrganizations, type OrganizationMemberWithUser
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOAuthId(provider: string, oauthId: string): Promise<User | undefined>;
  getUserCount(): Promise<number>;
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

  // Conversation operations
  getConversations(userId: string, limit?: number): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<boolean>;

  // Enhanced Chat History operations
  getChatHistory(userId: string, limit?: number): Promise<ChatHistory[]>;
  getChatHistoryByConversation(conversationId: string, limit?: number): Promise<ChatHistory[]>;
  createChatHistory(chat: InsertChatHistory): Promise<ChatHistory>;
  deleteChatHistory(id: string): Promise<boolean>;

  // Query Template operations
  getQueryTemplates(category?: string): Promise<QueryTemplate[]>;
  getUserQueryTemplates(userId: string): Promise<QueryTemplate[]>;
  createQueryTemplate(template: InsertQueryTemplate): Promise<QueryTemplate>;
  updateQueryTemplateUsage(id: string): Promise<void>;

  // Favorite Query operations
  getFavoriteQueries(userId: string, category?: string): Promise<FavoriteQuery[]>;
  createFavoriteQuery(favorite: InsertFavoriteQuery): Promise<FavoriteQuery>;
  deleteFavoriteQuery(id: string): Promise<boolean>;
  updateFavoriteQueryUsage(id: string): Promise<void>;

  // User Preferences operations
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
  updateUserPreferences(userId: string, updates: UpdateUserPreferences): Promise<UserPreferences | undefined>;
  resetUserPreferences(userId: string): Promise<UserPreferences | undefined>;

  // Organization operations
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationByName(name: string): Promise<Organization | undefined>;
  getUserOrganizations(userId: string): Promise<OrganizationWithMembers[]>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization | undefined>;
  deleteOrganization(id: string): Promise<boolean>;

  // Organization Member operations
  getOrganizationMembers(organizationId: string): Promise<OrganizationMemberWithUser[]>;
  getOrganizationMember(organizationId: string, userId: string): Promise<OrganizationMember | undefined>;
  addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  updateOrganizationMember(organizationId: string, userId: string, updates: UpdateOrganizationMember): Promise<OrganizationMember | undefined>;
  removeOrganizationMember(organizationId: string, userId: string): Promise<boolean>;
  getUserOrganizationMemberships(userId: string): Promise<(OrganizationMember & { organization: Organization })[]>;

  // Organization Role operations
  assignRoleToUserInOrganization(userId: string, roleId: string, organizationId: string, assignedBy?: string): Promise<UserRole>;
  revokeRoleFromUserInOrganization(userId: string, roleId: string, organizationId: string): Promise<boolean>;
  getUserRolesInOrganization(userId: string, organizationId: string): Promise<(UserRole & { role: Role })[]>;
  getOrganizationRoles(organizationId: string): Promise<Role[]>;

  // RBAC operations
  // Role operations
  getRoles(): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  getRoleByName(name: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  createRoleIfNotExists(role: InsertRole): Promise<Role>;
  updateRole(id: string, updates: UpdateRole): Promise<Role | undefined>;
  deleteRole(id: string): Promise<boolean>;

  // Permission operations  
  getPermissions(): Promise<Permission[]>;
  getPermission(id: string): Promise<Permission | undefined>;
  getPermissionByName(name: string): Promise<Permission | undefined>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  createPermissionIfNotExists(permission: InsertPermission): Promise<Permission>;
  deletePermission(id: string): Promise<boolean>;

  // User Role operations
  getUserRoles(userId: string): Promise<(UserRole & { role: Role })[]>;
  assignRoleToUser(userId: string, roleId: string, assignedBy?: string): Promise<UserRole>;
  revokeRoleFromUser(userId: string, roleId: string): Promise<boolean>;
  getUserPermissions(userId: string): Promise<Permission[]>;

  // Role Permission operations
  getRolePermissions(roleId: string): Promise<Permission[]>;
  assignPermissionToRole(roleId: string, permissionId: string): Promise<RolePermission>;
  assignPermissionsToRole(roleName: string, permissionNames: string[]): Promise<void>;
  revokePermissionFromRole(roleId: string, permissionId: string): Promise<boolean>;

  // Audit Log operations
  createAuditLog(auditData: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(userId?: string, limit?: number): Promise<AuditLog[]>;

  // Admin Dashboard operations
  getAllUsersWithRoles(): Promise<(User & { userRoles: (UserRole & { role: Role })[] })[]>;
  getSystemStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalRoles: number;
    totalPermissions: number;
    recentLogins: number;
  }>;
  getRecentActivity(limit?: number): Promise<AuditLog[]>;
  getUserStats(userId: string): Promise<{
    loginCount: number;
    lastLogin?: Date;
    sessionDuration?: number;
    actionsCount: number;
  }>;
  getPermissionMatrix(): Promise<Array<{
    roleId: string;
    roleName: string;
    permissions: Permission[];
  }>>;
  searchUsers(query: string, limit?: number): Promise<User[]>;
  getUsersByRole(roleId: string): Promise<User[]>;
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

  async getUserCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(users);
    return result.count;
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

  // Conversation operations
  async getConversations(userId: string, limit = 50): Promise<Conversation[]> {
    return await db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit);
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation || undefined;
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [newConversation] = await db.insert(conversations).values(conversation).returning();
    return newConversation;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const [updated] = await db.update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteConversation(id: string): Promise<boolean> {
    // Delete related chat history first
    await db.delete(chatHistory).where(eq(chatHistory.conversationId, id));
    // Then delete the conversation
    const result = await db.delete(conversations).where(eq(conversations.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Enhanced Chat History operations
  async getChatHistoryByConversation(conversationId: string, limit = 100): Promise<ChatHistory[]> {
    return await db.select().from(chatHistory)
      .where(eq(chatHistory.conversationId, conversationId))
      .orderBy(chatHistory.timestamp)
      .limit(limit);
  }

  async deleteChatHistory(id: string): Promise<boolean> {
    const result = await db.delete(chatHistory).where(eq(chatHistory.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Query Template operations
  async getQueryTemplates(category?: string): Promise<QueryTemplate[]> {
    if (category) {
      return await db.select().from(queryTemplates)
        .where(and(eq(queryTemplates.isSystem, true), eq(queryTemplates.category, category)))
        .orderBy(desc(queryTemplates.usageCount));
    }
    
    return await db.select().from(queryTemplates)
      .where(eq(queryTemplates.isSystem, true))
      .orderBy(desc(queryTemplates.usageCount));
  }

  async getUserQueryTemplates(userId: string): Promise<QueryTemplate[]> {
    return await db.select().from(queryTemplates)
      .where(eq(queryTemplates.userId, userId))
      .orderBy(desc(queryTemplates.usageCount));
  }

  async createQueryTemplate(template: InsertQueryTemplate): Promise<QueryTemplate> {
    const [newTemplate] = await db.insert(queryTemplates).values(template).returning();
    return newTemplate;
  }

  async updateQueryTemplateUsage(id: string): Promise<void> {
    await db.update(queryTemplates)
      .set({ usageCount: sql`${queryTemplates.usageCount} + 1` })
      .where(eq(queryTemplates.id, id));
  }

  // Favorite Query operations
  async getFavoriteQueries(userId: string, category?: string): Promise<FavoriteQuery[]> {
    if (category) {
      return await db.select().from(favoriteQueries)
        .where(and(eq(favoriteQueries.userId, userId), eq(favoriteQueries.category, category)))
        .orderBy(desc(favoriteQueries.usageCount));
    }
    
    return await db.select().from(favoriteQueries)
      .where(eq(favoriteQueries.userId, userId))
      .orderBy(desc(favoriteQueries.usageCount));
  }

  async createFavoriteQuery(favorite: InsertFavoriteQuery): Promise<FavoriteQuery> {
    const [newFavorite] = await db.insert(favoriteQueries).values(favorite).returning();
    return newFavorite;
  }

  async deleteFavoriteQuery(id: string): Promise<boolean> {
    const result = await db.delete(favoriteQueries).where(eq(favoriteQueries.id, id));
    return (result.rowCount || 0) > 0;
  }

  async updateFavoriteQueryUsage(id: string): Promise<void> {
    await db.update(favoriteQueries)
      .set({ usageCount: sql`${favoriteQueries.usageCount} + 1` })
      .where(eq(favoriteQueries.id, id));
  }

  // User Preferences operations
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
    const [updatedPreferences] = await db.update(userPreferences)
      .set(updates)
      .where(eq(userPreferences.userId, userId))
      .returning();
    return updatedPreferences || undefined;
  }

  async resetUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [resetPreferences] = await db.update(userPreferences)
      .set({
        theme: "light",
        sidebarCollapsed: false,
        language: "en",
        timezone: "UTC",
        dateFormat: "MM/dd/yyyy",
        timeFormat: "12h",
        currency: "USD",
        emailNotifications: true,
        pushNotifications: true,
        weeklyReports: true,
        systemAlerts: true,
        defaultDashboard: "overview",
        refreshInterval: 30,
        showTutorials: true,
        sessionTimeout: 30,
        twoFactorEnabled: false,
        dataRetention: 365,
        exportFormat: "csv",
      })
      .where(eq(userPreferences.userId, userId))
      .returning();
    return resetPreferences || undefined;
  }

  // Organization operations
  async getOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations)
      .where(eq(organizations.isActive, true))
      .orderBy(desc(organizations.createdAt));
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations)
      .where(and(eq(organizations.id, id), eq(organizations.isActive, true)));
    return organization || undefined;
  }

  async getOrganizationByName(name: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations)
      .where(and(eq(organizations.name, name), eq(organizations.isActive, true)));
    return organization || undefined;
  }

  async getUserOrganizations(userId: string): Promise<OrganizationWithMembers[]> {
    const userOrgMemberships = await db.select({
      organization: organizations,
      member: organizationMembers,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
      eq(organizations.isActive, true)
    ));

    const orgsWithMembers: OrganizationWithMembers[] = [];
    
    for (const { organization } of userOrgMemberships) {
      const members = await this.getOrganizationMembers(organization.id);
      orgsWithMembers.push({
        ...organization,
        members,
        memberCount: members.length,
      });
    }
    
    return orgsWithMembers;
  }

  async createOrganization(organization: InsertOrganization): Promise<Organization> {
    const [newOrganization] = await db.insert(organizations).values(organization).returning();
    
    // Add the creator as an owner of the organization
    await this.addOrganizationMember({
      organizationId: newOrganization.id,
      userId: organization.createdBy,
      status: "active",
      isOwner: true,
    });
    
    return newOrganization;
  }

  async updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization | undefined> {
    const [updated] = await db.update(organizations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteOrganization(id: string): Promise<boolean> {
    // Soft delete by setting isActive to false
    const [updated] = await db.update(organizations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return !!updated;
  }

  // Organization Member operations
  async getOrganizationMembers(organizationId: string): Promise<OrganizationMemberWithUser[]> {
    return await db.select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      status: organizationMembers.status,
      invitedBy: organizationMembers.invitedBy,
      joinedAt: organizationMembers.joinedAt,
      leftAt: organizationMembers.leftAt,
      invitedAt: organizationMembers.invitedAt,
      isOwner: organizationMembers.isOwner,
      user: users,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId));
  }

  async getOrganizationMember(organizationId: string, userId: string): Promise<OrganizationMember | undefined> {
    const [member] = await db.select().from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      ));
    return member || undefined;
  }

  async addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember> {
    const [newMember] = await db.insert(organizationMembers).values(member).returning();
    return newMember;
  }

  async updateOrganizationMember(organizationId: string, userId: string, updates: UpdateOrganizationMember): Promise<OrganizationMember | undefined> {
    const [updated] = await db.update(organizationMembers)
      .set(updates)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      ))
      .returning();
    return updated || undefined;
  }

  async removeOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
    // Set status to "suspended" and leftAt timestamp instead of hard delete
    const [updated] = await db.update(organizationMembers)
      .set({ 
        status: "suspended",
        leftAt: new Date()
      })
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      ))
      .returning();
    return !!updated;
  }

  async getUserOrganizationMemberships(userId: string): Promise<(OrganizationMember & { organization: Organization })[]> {
    return await db.select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      status: organizationMembers.status,
      invitedBy: organizationMembers.invitedBy,
      joinedAt: organizationMembers.joinedAt,
      leftAt: organizationMembers.leftAt,
      invitedAt: organizationMembers.invitedAt,
      isOwner: organizationMembers.isOwner,
      organization: organizations,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
      eq(organizations.isActive, true)
    ));
  }

  // Organization Role operations
  async assignRoleToUserInOrganization(userId: string, roleId: string, organizationId: string, assignedBy?: string): Promise<UserRole> {
    const [newUserRole] = await db.insert(userRoles).values({
      userId,
      roleId,
      organizationId,
      assignedBy,
      isActive: true,
    }).returning();
    return newUserRole;
  }

  async revokeRoleFromUserInOrganization(userId: string, roleId: string, organizationId: string): Promise<boolean> {
    const [updated] = await db.update(userRoles)
      .set({ isActive: false })
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, roleId),
        eq(userRoles.organizationId, organizationId)
      ))
      .returning();
    return !!updated;
  }

  async getUserRolesInOrganization(userId: string, organizationId: string): Promise<(UserRole & { role: Role })[]> {
    return await db.select({
      id: userRoles.id,
      userId: userRoles.userId,
      roleId: userRoles.roleId,
      organizationId: userRoles.organizationId,
      assignedBy: userRoles.assignedBy,
      assignedAt: userRoles.assignedAt,
      expiresAt: userRoles.expiresAt,
      isActive: userRoles.isActive,
      role: roles,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(
      eq(userRoles.userId, userId),
      eq(userRoles.organizationId, organizationId),
      eq(userRoles.isActive, true)
    ));
  }

  async getOrganizationRoles(organizationId: string): Promise<Role[]> {
    return await db.select().from(roles)
      .where(and(
        eq(roles.organizationId, organizationId),
        eq(roles.isActive, true)
      ))
      .orderBy(roles.displayName);
  }

  // RBAC operations
  // Role operations
  async getRoles(): Promise<Role[]> {
    return await db.select().from(roles)
      .where(eq(roles.isActive, true))
      .orderBy(roles.displayName);
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || undefined;
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name));
    return role || undefined;
  }

  async createRole(role: InsertRole): Promise<Role> {
    const [newRole] = await db.insert(roles).values(role).returning();
    return newRole;
  }

  async createRoleIfNotExists(role: InsertRole): Promise<Role> {
    const existingRole = await this.getRoleByName(role.name);
    if (existingRole) {
      return existingRole;
    }
    return await this.createRole(role);
  }

  async updateRole(id: string, updates: UpdateRole): Promise<Role | undefined> {
    const [updatedRole] = await db.update(roles)
      .set(updates)
      .where(eq(roles.id, id))
      .returning();
    return updatedRole || undefined;
  }

  async deleteRole(id: string): Promise<boolean> {
    const result = await db.delete(roles).where(eq(roles.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Permission operations
  async getPermissions(): Promise<Permission[]> {
    return await db.select().from(permissions)
      .orderBy(permissions.category, permissions.displayName);
  }

  async getPermission(id: string): Promise<Permission | undefined> {
    const [permission] = await db.select().from(permissions).where(eq(permissions.id, id));
    return permission || undefined;
  }

  async getPermissionByName(name: string): Promise<Permission | undefined> {
    const [permission] = await db.select().from(permissions).where(eq(permissions.name, name));
    return permission || undefined;
  }

  async createPermission(permission: InsertPermission): Promise<Permission> {
    const [newPermission] = await db.insert(permissions).values(permission).returning();
    return newPermission;
  }

  async createPermissionIfNotExists(permission: InsertPermission): Promise<Permission> {
    const existingPermission = await this.getPermissionByName(permission.name);
    if (existingPermission) {
      return existingPermission;
    }
    return await this.createPermission(permission);
  }

  async deletePermission(id: string): Promise<boolean> {
    const result = await db.delete(permissions).where(eq(permissions.id, id));
    return (result.rowCount || 0) > 0;
  }

  // User Role operations
  async getUserRoles(userId: string): Promise<(UserRole & { role: Role })[]> {
    return await db.select({
      id: userRoles.id,
      userId: userRoles.userId,
      roleId: userRoles.roleId,
      assignedBy: userRoles.assignedBy,
      assignedAt: userRoles.assignedAt,
      expiresAt: userRoles.expiresAt,
      isActive: userRoles.isActive,
      organizationId: userRoles.organizationId,
      role: roles,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(
      eq(userRoles.userId, userId),
      eq(userRoles.isActive, true)
    ));
  }

  async assignRoleToUser(userId: string, roleId: string, assignedBy?: string): Promise<UserRole> {
    const [newUserRole] = await db.insert(userRoles).values({
      userId,
      roleId,
      assignedBy,
      isActive: true,
    }).returning();
    return newUserRole;
  }

  async revokeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
    const result = await db.update(userRoles)
      .set({ isActive: false })
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, roleId)
      ));
    return (result.rowCount || 0) > 0;
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    return await db.select({
      id: permissions.id,
      name: permissions.name,
      displayName: permissions.displayName,
      description: permissions.description,
      category: permissions.category,
      resource: permissions.resource,
      action: permissions.action,
      isSystem: permissions.isSystem,
      createdAt: permissions.createdAt,
    })
    .from(permissions)
    .innerJoin(rolePermissions, eq(permissions.id, rolePermissions.permissionId))
    .innerJoin(userRoles, eq(rolePermissions.roleId, userRoles.roleId))
    .where(and(
      eq(userRoles.userId, userId),
      eq(userRoles.isActive, true)
    ));
  }

  // Role Permission operations
  async getRolePermissions(roleId: string): Promise<Permission[]> {
    return await db.select({
      id: permissions.id,
      name: permissions.name,
      displayName: permissions.displayName,
      description: permissions.description,
      category: permissions.category,
      resource: permissions.resource,
      action: permissions.action,
      isSystem: permissions.isSystem,
      createdAt: permissions.createdAt,
    })
    .from(permissions)
    .innerJoin(rolePermissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  }

  async assignPermissionToRole(roleId: string, permissionId: string): Promise<RolePermission> {
    const [newRolePermission] = await db.insert(rolePermissions).values({
      roleId,
      permissionId,
    }).returning();
    return newRolePermission;
  }

  async assignPermissionsToRole(roleName: string, permissionNames: string[]): Promise<void> {
    const role = await this.getRoleByName(roleName);
    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    for (const permissionName of permissionNames) {
      const permission = await this.getPermissionByName(permissionName);
      if (permission) {
        // Check if the role-permission relationship already exists
        const existingRolePermissions = await db.select()
          .from(rolePermissions)
          .where(and(
            eq(rolePermissions.roleId, role.id),
            eq(rolePermissions.permissionId, permission.id)
          ));

        if (existingRolePermissions.length === 0) {
          await this.assignPermissionToRole(role.id, permission.id);
        }
      }
    }
  }

  async revokePermissionFromRole(roleId: string, permissionId: string): Promise<boolean> {
    const result = await db.delete(rolePermissions)
      .where(and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.permissionId, permissionId)
      ));
    return (result.rowCount || 0) > 0;
  }

  // Audit Log operations
  async createAuditLog(auditData: InsertAuditLog): Promise<AuditLog> {
    const [newAuditLog] = await db.insert(auditLog).values(auditData).returning();
    return newAuditLog;
  }

  async getAuditLogs(userId?: string, limit: number = 100): Promise<AuditLog[]> {
    if (userId) {
      return await db.select().from(auditLog)
        .where(eq(auditLog.userId, userId))
        .orderBy(desc(auditLog.timestamp))
        .limit(limit);
    }
    
    return await db.select().from(auditLog)
      .orderBy(desc(auditLog.timestamp))
      .limit(limit);
  }

  // Admin Dashboard operations
  async getAllUsersWithRoles(): Promise<(User & { userRoles: (UserRole & { role: Role })[] })[]> {
    const allUsers = await db.select().from(users);
    
    const usersWithRoles = await Promise.all(
      allUsers.map(async (user) => {
        const userRoles = await this.getUserRoles(user.id);
        return {
          ...user,
          userRoles,
        };
      })
    );
    
    return usersWithRoles;
  }

  async getSystemStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalRoles: number;
    totalPermissions: number;
    recentLogins: number;
  }> {
    const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [totalRolesResult] = await db.select({ count: sql<number>`count(*)` }).from(roles);
    const [totalPermissionsResult] = await db.select({ count: sql<number>`count(*)` }).from(permissions);
    
    // Active users (users who have logged in within the last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recentLoginsResult] = await db.select({ count: sql<number>`count(*)` })
      .from(auditLog)
      .where(and(
        eq(auditLog.action, 'user_login'),
        sql`${auditLog.timestamp} > ${thirtyDaysAgo}`
      ));

    // For active users, let's count unique users who have any activity in the last 30 days
    const [activeUsersResult] = await db.select({ count: sql<number>`count(distinct ${auditLog.userId})` })
      .from(auditLog)
      .where(sql`${auditLog.timestamp} > ${thirtyDaysAgo}`);

    return {
      totalUsers: totalUsersResult.count,
      activeUsers: activeUsersResult.count || 0,
      totalRoles: totalRolesResult.count,
      totalPermissions: totalPermissionsResult.count,
      recentLogins: recentLoginsResult.count || 0,
    };
  }

  async getRecentActivity(limit: number = 50): Promise<AuditLog[]> {
    return await db.select().from(auditLog)
      .orderBy(desc(auditLog.timestamp))
      .limit(limit);
  }

  async getUserStats(userId: string): Promise<{
    loginCount: number;
    lastLogin?: Date;
    sessionDuration?: number;
    actionsCount: number;
  }> {
    const [loginCountResult] = await db.select({ count: sql<number>`count(*)` })
      .from(auditLog)
      .where(and(
        eq(auditLog.userId, userId),
        eq(auditLog.action, 'user_login')
      ));

    const [lastLoginResult] = await db.select({ timestamp: auditLog.timestamp })
      .from(auditLog)
      .where(and(
        eq(auditLog.userId, userId),
        eq(auditLog.action, 'user_login')
      ))
      .orderBy(desc(auditLog.timestamp))
      .limit(1);

    const [actionsCountResult] = await db.select({ count: sql<number>`count(*)` })
      .from(auditLog)
      .where(eq(auditLog.userId, userId));

    return {
      loginCount: loginCountResult.count || 0,
      lastLogin: lastLoginResult?.timestamp || undefined,
      sessionDuration: undefined, // Could be calculated if we track session end times
      actionsCount: actionsCountResult.count || 0,
    };
  }

  async getPermissionMatrix(): Promise<Array<{
    roleId: string;
    roleName: string;
    permissions: Permission[];
  }>> {
    const allRoles = await this.getRoles();
    
    const matrix = await Promise.all(
      allRoles.map(async (role) => {
        const permissions = await this.getRolePermissions(role.id);
        return {
          roleId: role.id,
          roleName: role.name,
          permissions,
        };
      })
    );
    
    return matrix;
  }

  async searchUsers(query: string, limit: number = 50): Promise<User[]> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    
    return await db.select().from(users)
      .where(sql`
        lower(${users.username}) like ${lowerQuery} OR 
        lower(${users.email}) like ${lowerQuery} OR
        lower(${users.firstName}) like ${lowerQuery} OR
        lower(${users.lastName}) like ${lowerQuery}
      `)
      .limit(limit);
  }

  async getUsersByRole(roleId: string): Promise<User[]> {
    return await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      password: users.password,
      role: users.role,
      authProvider: users.authProvider,
      oauthId: users.oauthId,
      profileImage: users.profileImage,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(userRoles, eq(users.id, userRoles.userId))
    .where(and(
      eq(userRoles.roleId, roleId),
      eq(userRoles.isActive, true)
    ));
  }
}

export const storage = new DatabaseStorage();
