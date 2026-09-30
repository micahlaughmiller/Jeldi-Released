/**
 * Data sources: the tools a company already runs on (GitHub, GitLab, Microsoft 365 Teams and
 * SharePoint, QuickBooks, ...) pulled into one organization-scoped store.
 *
 * `source_records` is the single shape everything lands in: what kind of thing it is, who did
 * it, when, a title, a link, searchable text and the raw payload. Dashboards, the activity feed,
 * search and the AI assistant all read from here.
 */
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./schema";

export const dataSources = pgTable("data_sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  provider: text("provider").notNull(), // github | gitlab | microsoft | quickbooks
  displayName: text("display_name").notNull(),
  authType: text("auth_type").notNull(), // token | oauth
  accessToken: text("access_token"), // encrypted
  refreshToken: text("refresh_token"), // encrypted
  tokenExpiry: timestamp("token_expiry"),
  /** Provider-specific settings: GitHub owners/repos, GitLab base URL, QuickBooks realm, tenant ids... */
  config: jsonb("config"),
  status: text("status").default("connected").notNull(), // connected | error | disconnected
  lastSync: timestamp("last_sync"),
  lastError: text("last_error"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sourceRecords = pgTable("source_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  sourceId: uuid("source_id").references(() => dataSources.id).notNull(),
  provider: text("provider").notNull(),
  /** repo | pull_request | issue | commit | team | channel | message | file | site | customer | invoice | payment | item | account */
  kind: text("kind").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title"),
  url: text("url"),
  author: text("author"),
  /** Grouping key: repository full name, team/channel name, site name, company */
  container: text("container"),
  /** State the provider reports: open, merged, closed, paid, overdue ... */
  state: text("state"),
  occurredAt: timestamp("occurred_at"),
  /** Body / excerpt used for search and AI context */
  text: text("text"),
  data: jsonb("data"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("source_records_source_kind_ext").on(t.sourceId, t.kind, t.externalId),
  byOrgTime: index("source_records_org_time").on(t.organizationId, t.occurredAt),
  byOrgKind: index("source_records_org_kind").on(t.organizationId, t.kind),
}));

export type DataSource = typeof dataSources.$inferSelect;
export type InsertDataSource = typeof dataSources.$inferInsert;
export type SourceRecord = typeof sourceRecords.$inferSelect;
export type InsertSourceRecord = typeof sourceRecords.$inferInsert;
