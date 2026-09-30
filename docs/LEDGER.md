# Jeldi Ledger: using Jeldi as the system of record

For organizations that do not have an ERP to connect, Jeldi keeps the operating records itself.
Everything else in the product (KPIs, charts, drill-downs, analytics, the AI assistant) reads
from the same snapshot pipeline, through the built-in `jeldi` connector
(`server/connectors/native.ts`). An organization can run on the ledger alone, or on the ledger
plus an external ERP; both feed the same KPIs.

**Scope, stated plainly:** this is an operational ledger, not accounting software. There is no
general ledger, tax, payroll or MRP. It covers what the dashboard measures:

| Record | What it drives |
|---|---|
| Customers | Names on orders and invoices, payment terms (due dates) |
| Items | SKU, unit cost and price (margin, cost per unit), on-hand quantity (inventory value) |
| Sales orders and lines | Open orders, requested dates (efficiency), line due dates |
| Shipments | On-time delivery, fill rate, revenue and cost of goods (margin) |
| Invoices and payments | Revenue, receivables, working-capital efficiency, unpaid-invoice chart |
| Jobs | Cycle time and on-time performance |

## Turning it on

Ledger page in the sidebar > **Turn on the ledger**. That creates the `jeldi` connection for the
organization and runs the first sync. From then on every edit triggers a KPI recalculation about
two seconds later; **Recalculate KPIs** forces one.

## Daily use

* **Orders**: New order (customer, dates, lines with item/qty/price). **Ship** a line when it
  goes out (partial shipments allowed; inventory on hand is reduced; the order closes when every
  line is fully shipped). **Invoice** an order once something has shipped (one invoice per order,
  amount = shipped quantity x unit price, due date from the customer's terms).
* **Invoices**: record payments against open balances; add stand-alone invoices or credit memos.
* **Jobs**: add with start/due dates, mark **Complete**.
* **Customers / Items**: maintain directly; item on-hand is editable inline.

## Importing from spreadsheets

Import CSV tab. Download the template for each type, fill it from your existing spreadsheets or
export, upload or paste. Import in order: customers, items, orders, invoices, jobs. Re-importing
updates customers and items by name/SKU and skips orders, invoices and jobs whose numbers already
exist, so a file can be re-run safely.

Order files are one row per line; rows with the same `order_number` form one order. `qty_shipped`
and `ship_date` record history so on-time delivery and margin are right from day one. Invoice
files accept `paid_amount` / `paid_date` for the same reason. Dates may be `YYYY-MM-DD` or
`M/D/YYYY`; money may include `$` and commas.

## Permissions

Everyone in the organization can view the ledger. Owners, admins and the operating and finance
roles (operations manager, finance, CFO, project manager, cost manager) can change it. Sales,
marketing and viewers are read-only.

## API

`/api/ledger/status`, `/enable`, `/sync`; CRUD under `/customers`, `/items`, `/orders`
(`POST /orders/:id/ship`, `POST /orders/:id/invoice`), `/invoices` (`POST /invoices/:id/payments`),
`/jobs` (`POST /jobs/:id/complete`); `GET /templates/:entity`; `POST /import/:entity` with
`{ csv }`. Tables are in `shared/ledger-schema.ts` (all rows carry `organization_id`).
