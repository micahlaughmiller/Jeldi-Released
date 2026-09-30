/**
 * Jeldi Ledger: the built-in system of record for organizations that do not connect an external
 * ERP. Customers, items, orders, shipments, invoices, payments and jobs are entered here (or
 * imported from CSV) and feed the same snapshot -> KPI -> chart pipeline through the "jeldi"
 * connector (server/connectors/native.ts).
 *
 * Money and quantities are `decimal` (strings on the wire); dates are calendar dates (YYYY-MM-DD).
 */
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, integer, decimal, uuid, date } from "drizzle-orm/pg-core";
import { organizations, users } from "./schema";

export const ledgerCustomers = pgTable("ledger_customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  paymentTermsDays: integer("payment_terms_days").default(30).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ledgerItems = pgTable("ledger_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  unitCost: decimal("unit_cost", { precision: 14, scale: 4 }).default("0").notNull(),
  unitPrice: decimal("unit_price", { precision: 14, scale: 4 }).default("0").notNull(),
  onHand: decimal("on_hand", { precision: 14, scale: 3 }).default("0").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ledgerOrders = pgTable("ledger_orders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  customerId: uuid("customer_id").references(() => ledgerCustomers.id).notNull(),
  orderDate: date("order_date").notNull(),
  requestedDate: date("requested_date"),
  status: text("status").default("open").notNull(), // open | closed | cancelled
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ledgerOrderLines = pgTable("ledger_order_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  orderId: uuid("order_id").references(() => ledgerOrders.id).notNull(),
  lineNo: integer("line_no").notNull(),
  itemId: uuid("item_id").references(() => ledgerItems.id),
  description: text("description"),
  qty: decimal("qty", { precision: 14, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 14, scale: 4 }).default("0").notNull(),
  unitCost: decimal("unit_cost", { precision: 14, scale: 4 }).default("0").notNull(),
  dueDate: date("due_date"),
  qtyShipped: decimal("qty_shipped", { precision: 14, scale: 3 }).default("0").notNull(),
});

export const ledgerShipments = pgTable("ledger_shipments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  orderId: uuid("order_id").references(() => ledgerOrders.id).notNull(),
  lineId: uuid("line_id").references(() => ledgerOrderLines.id).notNull(),
  shipDate: date("ship_date").notNull(),
  qty: decimal("qty", { precision: 14, scale: 3 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ledgerInvoices = pgTable("ledger_invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  customerId: uuid("customer_id").references(() => ledgerCustomers.id).notNull(),
  orderId: uuid("order_id").references(() => ledgerOrders.id),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  isCreditMemo: boolean("is_credit_memo").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ledgerPayments = pgTable("ledger_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  invoiceId: uuid("invoice_id").references(() => ledgerInvoices.id).notNull(),
  paymentDate: date("payment_date").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  reference: text("reference"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ledgerJobs = pgTable("ledger_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  itemId: uuid("item_id").references(() => ledgerItems.id),
  orderLineId: uuid("order_line_id").references(() => ledgerOrderLines.id),
  qty: decimal("qty", { precision: 14, scale: 3 }).default("1").notNull(),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  completedDate: date("completed_date"),
  status: text("status").default("open").notNull(), // open | complete | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LedgerCustomer = typeof ledgerCustomers.$inferSelect;
export type LedgerItem = typeof ledgerItems.$inferSelect;
export type LedgerOrder = typeof ledgerOrders.$inferSelect;
export type LedgerOrderLine = typeof ledgerOrderLines.$inferSelect;
export type LedgerShipment = typeof ledgerShipments.$inferSelect;
export type LedgerInvoice = typeof ledgerInvoices.$inferSelect;
export type LedgerPayment = typeof ledgerPayments.$inferSelect;
export type LedgerJob = typeof ledgerJobs.$inferSelect;
