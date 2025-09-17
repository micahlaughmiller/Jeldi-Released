import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean, integer, decimal, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password"), // Optional for OAuth users
  role: text("role").notNull().default("user"),
  // OAuth authentication fields
  authProvider: text("auth_provider").default("local"), // local, google, microsoft
  oauthId: text("oauth_id"), // OAuth provider user ID
  profileImage: text("profile_image"), // OAuth profile image URL
  firstName: text("first_name"), // OAuth first name
  lastName: text("last_name"), // OAuth last name
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const erpConnections = pgTable("erp_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  erpSystem: text("erp_system").notNull(), // SAP, NetSuite, Dynamics365, etc.
  isConnected: boolean("is_connected").default(false).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  config: jsonb("config"), // OAuth config and endpoints
  lastSync: timestamp("last_sync"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kpiConfigurations = pgTable("kpi_configurations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // revenue, orders, inventory, performance, efficiency
  erpSource: text("erp_source").notNull(),
  query: text("query").notNull(), // SQL or API query for data
  position: integer("position").notNull(), // Dashboard position 1-5
  isActive: boolean("is_active").default(true).notNull(),
  refreshInterval: integer("refresh_interval").default(30).notNull(), // seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kpiData = pgTable("kpi_data", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kpiId: uuid("kpi_id").references(() => kpiConfigurations.id).notNull(),
  value: text("value").notNull(),
  change: decimal("change", { precision: 5, scale: 2 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const emailConfigurations = pgTable("email_configurations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  provider: text("provider").notNull(), // gmail, outlook, smtp
  email: text("email").notNull(),
  accessToken: text("access_token"), // encrypted
  refreshToken: text("refresh_token"), // encrypted
  tokenExpiry: timestamp("token_expiry"),
  scopes: text("scopes").array().default(sql`'{}'`), // OAuth scopes granted
  isActive: boolean("is_active").default(true).notNull(),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const oauthSessions = pgTable("oauth_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  state: text("state").notNull().unique(), // CSRF protection state
  provider: text("provider").notNull(), // google, microsoft
  isCompleted: boolean("is_completed").default(false).notNull(),
  authResult: jsonb("auth_result"), // Temporary storage for JWT and user data
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatHistory = pgTable("chat_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  query: text("query").notNull(),
  response: text("response").notNull(),
  insights: text("insights").array().default(sql`'{}'`),
  recommendations: text("recommendations").array().default(sql`'{}'`),
  dataUsed: text("data_used").array().default(sql`'{}'`),
  erpData: jsonb("erp_data"), // Context data used for the query
  responseTime: integer("response_time"), // milliseconds
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const queryTemplates = pgTable("query_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  query: text("query").notNull(),
  category: text("category").notNull(), // financial, operational, performance, inventory, etc.
  icon: text("icon").notNull(),
  isSystem: boolean("is_system").default(true).notNull(), // system templates vs user-created
  userId: uuid("user_id").references(() => users.id), // null for system templates
  usageCount: integer("usage_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const favoriteQueries = pgTable("favorite_queries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  query: text("query").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull().unique(),
  // Theme & Appearance
  theme: text("theme").default("light").notNull(), // light, dark, system
  sidebarCollapsed: boolean("sidebar_collapsed").default(false).notNull(),
  // Localization
  language: text("language").default("en").notNull(), // en, es, fr, de, etc.
  timezone: text("timezone").default("UTC").notNull(),
  dateFormat: text("date_format").default("MM/dd/yyyy").notNull(), // MM/dd/yyyy, dd/MM/yyyy, yyyy-MM-dd
  timeFormat: text("time_format").default("12h").notNull(), // 12h, 24h  
  currency: text("currency").default("USD").notNull(), // USD, EUR, GBP, etc.
  // Notifications
  emailNotifications: boolean("email_notifications").default(true).notNull(),
  pushNotifications: boolean("push_notifications").default(true).notNull(),
  weeklyReports: boolean("weekly_reports").default(true).notNull(),
  systemAlerts: boolean("system_alerts").default(true).notNull(),
  // Dashboard Preferences
  defaultDashboard: text("default_dashboard").default("overview").notNull(), // overview, analytics, custom
  refreshInterval: integer("refresh_interval").default(30).notNull(), // seconds
  showTutorials: boolean("show_tutorials").default(true).notNull(),
  // Privacy & Security
  sessionTimeout: integer("session_timeout").default(30).notNull(), // minutes
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  // Data & Export
  dataRetention: integer("data_retention").default(365).notNull(), // days
  exportFormat: text("export_format").default("csv").notNull(), // csv, json, xlsx
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Organization Tables
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  website: text("website"),
  logo: text("logo"), // URL to organization logo
  isActive: boolean("is_active").default(true).notNull(),
  settings: jsonb("settings"), // Organization-specific settings
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  status: text("status").default("active").notNull(), // active, pending, suspended
  invitedBy: uuid("invited_by").references(() => users.id),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
  invitedAt: timestamp("invited_at"),
  isOwner: boolean("is_owner").default(false).notNull(),
});

// RBAC Tables for Role-Based Access Control
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // admin, ops_manager, finance, cfo, project_manager, cost_manager, sales, marketing
  displayName: text("display_name").notNull(), // Human-readable name
  description: text("description"), // Role description
  color: text("color").default("#6366f1").notNull(), // UI color for role badges
  isSystem: boolean("is_system").default(true).notNull(), // System roles vs custom roles
  isActive: boolean("is_active").default(true).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id), // null for global roles
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // e.g., user.create, financial.view, erp.manage
  displayName: text("display_name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // user_management, financial_data, erp_access, ai_assistant, dashboard, settings
  resource: text("resource").notNull(), // users, kpis, erp_connections, email_configs, etc.
  action: text("action").notNull(), // create, read, update, delete, manage
  isSystem: boolean("is_system").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  roleId: uuid("role_id").references(() => roles.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id), // null for global roles
  assignedBy: uuid("assigned_by").references(() => users.id), // Who assigned this role
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Optional role expiration
  isActive: boolean("is_active").default(true).notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: uuid("role_id").references(() => roles.id).notNull(),
  permissionId: uuid("permission_id").references(() => permissions.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(), // role.assigned, role.revoked, permission.granted, etc.
  resource: text("resource").notNull(), // Table or entity affected
  resourceId: text("resource_id"), // ID of the affected resource
  oldValue: jsonb("old_value"), // Previous state
  newValue: jsonb("new_value"), // New state
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Relations
export const userRelations = relations(users, ({ many, one }) => ({
  erpConnections: many(erpConnections),
  kpiConfigurations: many(kpiConfigurations),
  emailConfigurations: many(emailConfigurations),
  conversations: many(conversations),
  chatHistory: many(chatHistory),
  queryTemplates: many(queryTemplates),
  favoriteQueries: many(favoriteQueries),
  preferences: one(userPreferences),
  // Organization relations
  createdOrganizations: many(organizations),
  organizationMembers: many(organizationMembers),
  // RBAC relations
  userRoles: many(userRoles),
  assignedRoles: many(userRoles, { relationName: "assigned_roles" }),
  auditLogs: many(auditLog),
}));

// Organization Relations
export const organizationRelations = relations(organizations, ({ one, many }) => ({
  creator: one(users, {
    fields: [organizations.createdBy],
    references: [users.id],
  }),
  members: many(organizationMembers),
  roles: many(roles),
  userRoles: many(userRoles),
}));

export const organizationMemberRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
  invitedByUser: one(users, {
    fields: [organizationMembers.invitedBy],
    references: [users.id],
  }),
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(chatHistory),
}));

export const queryTemplateRelations = relations(queryTemplates, ({ one }) => ({
  user: one(users, {
    fields: [queryTemplates.userId],
    references: [users.id],
  }),
}));

export const favoriteQueryRelations = relations(favoriteQueries, ({ one }) => ({
  user: one(users, {
    fields: [favoriteQueries.userId],
    references: [users.id],
  }),
}));

export const erpConnectionRelations = relations(erpConnections, ({ one }) => ({
  user: one(users, {
    fields: [erpConnections.userId],
    references: [users.id],
  }),
}));

export const kpiConfigurationRelations = relations(kpiConfigurations, ({ one, many }) => ({
  user: one(users, {
    fields: [kpiConfigurations.userId],
    references: [users.id],
  }),
  data: many(kpiData),
}));

export const kpiDataRelations = relations(kpiData, ({ one }) => ({
  kpi: one(kpiConfigurations, {
    fields: [kpiData.kpiId],
    references: [kpiConfigurations.id],
  }),
}));

export const emailConfigurationRelations = relations(emailConfigurations, ({ one }) => ({
  user: one(users, {
    fields: [emailConfigurations.userId],
    references: [users.id],
  }),
}));

export const chatHistoryRelations = relations(chatHistory, ({ one }) => ({
  user: one(users, {
    fields: [chatHistory.userId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [chatHistory.conversationId],
    references: [conversations.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

// RBAC Relations
export const roleRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roles.organizationId],
    references: [organizations.id],
  }),
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const permissionRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const userRoleRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  organization: one(organizations, {
    fields: [userRoles.organizationId],
    references: [organizations.id],
  }),
  assignedByUser: one(users, {
    fields: [userRoles.assignedBy],
    references: [users.id],
    relationName: "assigned_roles",
  }),
}));

export const rolePermissionRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  password: z.string().min(8).optional(), // Make password optional for OAuth
});

export const insertOAuthUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  password: true, // OAuth users don't need passwords
});

export const insertErpConnectionSchema = createInsertSchema(erpConnections).omit({
  id: true,
  createdAt: true,
});

export const insertKpiConfigurationSchema = createInsertSchema(kpiConfigurations).omit({
  id: true,
  createdAt: true,
});

export const insertKpiDataSchema = createInsertSchema(kpiData).omit({
  id: true,
  timestamp: true,
});

export const insertEmailConfigurationSchema = createInsertSchema(emailConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
});

export const insertOAuthSessionSchema = createInsertSchema(oauthSessions).omit({
  id: true,
  createdAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  messageCount: true,
});

export const insertChatHistorySchema = createInsertSchema(chatHistory).omit({
  id: true,
  timestamp: true,
});

export const insertQueryTemplateSchema = createInsertSchema(queryTemplates).omit({
  id: true,
  createdAt: true,
  usageCount: true,
});

export const insertFavoriteQuerySchema = createInsertSchema(favoriteQueries).omit({
  id: true,
  createdAt: true,
  usageCount: true,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserPreferencesSchema = insertUserPreferencesSchema.omit({
  userId: true,
}).partial();

// Organization Insert Schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateOrganizationSchema = insertOrganizationSchema.omit({
  createdBy: true,
}).partial();

export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({
  id: true,
  joinedAt: true,
  invitedAt: true,
});

export const updateOrganizationMemberSchema = insertOrganizationMemberSchema.omit({
  organizationId: true,
  userId: true,
}).partial();

// RBAC Insert Schemas
export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  assignedAt: true,
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  createdAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  timestamp: true,
});

// Update schemas for RBAC
export const updateRoleSchema = insertRoleSchema.omit({
  name: true,
}).partial();

export const updateUserRoleSchema = insertUserRoleSchema.omit({
  userId: true,
  roleId: true,
}).partial();

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertOAuthUser = z.infer<typeof insertOAuthUserSchema>;
export type User = typeof users.$inferSelect;
export type AuthUser = Pick<User, 'id' | 'username' | 'email' | 'role' | 'authProvider'>;
export type InsertErpConnection = z.infer<typeof insertErpConnectionSchema>;
export type ErpConnection = typeof erpConnections.$inferSelect;
export type InsertKpiConfiguration = z.infer<typeof insertKpiConfigurationSchema>;
export type KpiConfiguration = typeof kpiConfigurations.$inferSelect;
export type InsertKpiData = z.infer<typeof insertKpiDataSchema>;
export type KpiData = typeof kpiData.$inferSelect;
export type InsertEmailConfiguration = z.infer<typeof insertEmailConfigurationSchema>;
export type EmailConfiguration = typeof emailConfigurations.$inferSelect;
export type InsertOAuthSession = z.infer<typeof insertOAuthSessionSchema>;
export type OAuthSession = typeof oauthSessions.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertChatHistory = z.infer<typeof insertChatHistorySchema>;
export type ChatHistory = typeof chatHistory.$inferSelect;
export type InsertQueryTemplate = z.infer<typeof insertQueryTemplateSchema>;
export type QueryTemplate = typeof queryTemplates.$inferSelect;
export type InsertFavoriteQuery = z.infer<typeof insertFavoriteQuerySchema>;
export type FavoriteQuery = typeof favoriteQueries.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UpdateUserPreferences = z.infer<typeof updateUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

// Organization Types
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type UpdateOrganizationMember = z.infer<typeof updateOrganizationMemberSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;

// RBAC Types
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type UpdateRole = z.infer<typeof updateRoleSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;

// Extended User Type with Roles and Permissions
export interface UserWithRoles extends User {
  userRoles: (UserRole & { role: Role })[];
  permissions: Permission[];
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

// Extended Organization Types
export interface OrganizationWithMembers extends Organization {
  members: (OrganizationMember & { user: User })[];
  memberCount: number;
}

export interface UserWithOrganizations extends User {
  organizationMembers: (OrganizationMember & { organization: Organization })[];
}

export interface OrganizationMemberWithUser extends OrganizationMember {
  user: User;
  invitedByUser?: User;
}

// Permission validation schemas
export const roleAssignmentSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  expiresAt: z.date().optional(),
});

export const roleRevocationSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const permissionCheckSchema = z.object({
  resource: z.string(),
  action: z.string(),
});

// Organization management validation schemas
export const organizationInviteSchema = z.object({
  email: z.string().email(),
  organizationId: z.string().uuid(),
});

export const organizationRoleAssignmentSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export const organizationMemberUpdateSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: z.enum(["active", "pending", "suspended"]).optional(),
  isOwner: z.boolean().optional(),
});

export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type RoleRevocation = z.infer<typeof roleRevocationSchema>;
export type PermissionCheck = z.infer<typeof permissionCheckSchema>;
export type OrganizationInvite = z.infer<typeof organizationInviteSchema>;
export type OrganizationRoleAssignment = z.infer<typeof organizationRoleAssignmentSchema>;
export type OrganizationMemberUpdate = z.infer<typeof organizationMemberUpdateSchema>;

// Email API Response Types
export interface EmailProviderStatus {
  isConnected: boolean;
  email?: string;
}

export interface EmailStatusResponse {
  gmail?: EmailProviderStatus;
  outlook?: EmailProviderStatus;
}

export interface EmailConnectResponse {
  authUrl?: string;
  isConnected?: boolean;
  message?: string;
}

export interface EmailSendRequest {
  provider: 'gmail' | 'outlook';
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  template?: string;
  templateVariables?: {
    recipient: string;
    week: string;
    kpis: any[];
    insights: string[];
  };
}

export interface EmailSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Email API validation schemas for secure input handling
const emailSchema = z.string().email({ message: "Invalid email address" });
const emailArraySchema = z.array(emailSchema).min(1, { message: "At least one email address required" });
const providerSchema = z.enum(["gmail", "outlook", "smtp"], { message: "Invalid email provider" });

// Email send request schema with comprehensive validation
export const emailSendRequestSchema = z.object({
  provider: providerSchema,
  to: z.union([emailSchema, emailArraySchema]).transform(val => Array.isArray(val) ? val : [val]),
  cc: z.union([emailSchema, emailArraySchema]).transform(val => Array.isArray(val) ? val : [val]).optional(),
  bcc: z.union([emailSchema, emailArraySchema]).transform(val => Array.isArray(val) ? val : [val]).optional(),
  subject: z.string().min(1, { message: "Subject is required" }).max(500, { message: "Subject too long" }).optional(),
  body: z.string().max(50000, { message: "Email body too long" }).optional(),
  template: z.string().optional(),
  templateVariables: z.record(z.any()).optional(),
  isHtml: z.boolean().default(false)
}).refine(data => data.subject || data.template, {
  message: "Either subject or template must be provided",
  path: ["subject"]
});

// SMTP configuration schema with secure Boolean parsing
export const smtpConfigRequestSchema = z.object({
  host: z.string().min(1, { message: "SMTP host is required" }),
  port: z.coerce.number().int().min(1).max(65535, { message: "Invalid port number" }),
  secure: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val === "true" || val === "1") return true;
      if (val === "false" || val === "0") return false;
      throw new Error("Invalid secure value - must be true, false, 1, or 0");
    })
  ]).default(false),
  username: z.string().min(1, { message: "Username is required" }),
  password: z.string().min(1, { message: "Password is required" })
});

// Email provider connection schema
export const emailProviderParamsSchema = z.object({
  provider: providerSchema
});

export type EmailSendRequestValidated = z.infer<typeof emailSendRequestSchema>;
export type SMTPConfigRequest = z.infer<typeof smtpConfigRequestSchema>;
export type EmailProviderParams = z.infer<typeof emailProviderParamsSchema>;
