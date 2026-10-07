/**
 * Sent-mail log: every email sent from inside Jeldi, per organization, with what it was about.
 */
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, uuid, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./schema";

export const emailMessages = pgTable("email_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  provider: text("provider").notNull(), // gmail | outlook | smtp | demo
  fromAddress: text("from_address"),
  to: text("to").array().notNull(),
  cc: text("cc").array().default(sql`'{}'`).notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  isHtml: boolean("is_html").default(false).notNull(),
  status: text("status").notNull(), // sent | failed
  error: text("error"),
  relatedKind: text("related_kind"),
  relatedId: text("related_id"),
  relatedTitle: text("related_title"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (t) => ({
  byOrg: index("email_messages_org_sent").on(t.organizationId, t.sentAt),
}));

export type EmailMessageRow = typeof emailMessages.$inferSelect;
export type InsertEmailMessageRow = typeof emailMessages.$inferInsert;
