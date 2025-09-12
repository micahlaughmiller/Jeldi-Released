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

export const chatHistory = pgTable("chat_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  query: text("query").notNull(),
  response: text("response").notNull(),
  erpData: jsonb("erp_data"), // Context data used for the query
  timestamp: timestamp("timestamp").defaultNow().notNull(),
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

// Relations
export const userRelations = relations(users, ({ many, one }) => ({
  erpConnections: many(erpConnections),
  kpiConfigurations: many(kpiConfigurations),
  emailConfigurations: many(emailConfigurations),
  chatHistory: many(chatHistory),
  preferences: one(userPreferences),
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
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
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

export const insertChatHistorySchema = createInsertSchema(chatHistory).omit({
  id: true,
  timestamp: true,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserPreferencesSchema = insertUserPreferencesSchema.omit({
  userId: true,
}).partial();

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertOAuthUser = z.infer<typeof insertOAuthUserSchema>;
export type User = typeof users.$inferSelect;
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
export type InsertChatHistory = z.infer<typeof insertChatHistorySchema>;
export type ChatHistory = typeof chatHistory.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UpdateUserPreferences = z.infer<typeof updateUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

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
