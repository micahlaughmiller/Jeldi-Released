import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean, integer, decimal, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
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
  provider: text("provider").notNull(), // gmail, outlook
  email: text("email").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  isActive: boolean("is_active").default(true).notNull(),
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

// Relations
export const userRelations = relations(users, ({ many }) => ({
  erpConnections: many(erpConnections),
  kpiConfigurations: many(kpiConfigurations),
  emailConfigurations: many(emailConfigurations),
  chatHistory: many(chatHistory),
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
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
});

export const insertChatHistorySchema = createInsertSchema(chatHistory).omit({
  id: true,
  timestamp: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertErpConnection = z.infer<typeof insertErpConnectionSchema>;
export type ErpConnection = typeof erpConnections.$inferSelect;
export type InsertKpiConfiguration = z.infer<typeof insertKpiConfigurationSchema>;
export type KpiConfiguration = typeof kpiConfigurations.$inferSelect;
export type InsertKpiData = z.infer<typeof insertKpiDataSchema>;
export type KpiData = typeof kpiData.$inferSelect;
export type InsertEmailConfiguration = z.infer<typeof insertEmailConfigurationSchema>;
export type EmailConfiguration = typeof emailConfigurations.$inferSelect;
export type InsertChatHistory = z.infer<typeof insertChatHistorySchema>;
export type ChatHistory = typeof chatHistory.$inferSelect;
