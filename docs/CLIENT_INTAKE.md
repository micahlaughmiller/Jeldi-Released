# Client intake (boutique setup)

Fill this in with the client before a setup engagement. It is what the setup session works from,
and it determines the setup fee (how many integrations, how much mapping) and the monthly fee
(hosting tier, sync frequency, support expectations).

## 1. Company

* Company name, locations, number of people who will log in
* Who owns the relationship on their side (owner/admin in Jeldi), who else needs access and at
  what role (operations, finance, CFO, project, cost, sales, marketing, viewer)
* What they want to see on the dashboard first (the five KPIs that matter to them)

## 2. Systems they run the business on

For each system: name and version, cloud or on-prem, who administers it, and whether it has an
API, a report export, or only screens.

| Area | System(s) | How data comes out today |
|---|---|---|
| ERP / job management | e.g. Epicor Kinetic, Infor SyteLine, JobBOSS, E2, spreadsheets, none | |
| Accounting / invoicing | e.g. QuickBooks, Sage, NetSuite, within ERP | |
| Quoting / CRM | e.g. HubSpot, Salesforce, spreadsheets | |
| Orders in | e.g. email, EDI, web shop, portal | |
| Shop floor / scheduling | e.g. whiteboard, ProShop, MES | |
| Inventory | e.g. ERP, spreadsheet, none | |
| Shipping | e.g. ShipStation, carrier portals, within ERP | |
| Email | Microsoft 365, Google Workspace, other | |

## 3. Mapping decisions (made together in the setup session)

* **Source of truth per record type**: which system (or the Jeldi Ledger) holds customers,
  items, orders, shipments, invoices, payments, jobs
* **Connector or import**: live connector (Epicor, SyteLine), CSV import on a schedule, or
  manual entry in the ledger
* **Field mapping**: statuses that mean open/closed/cancelled, which date is the promise date,
  where unit cost lives, how credit memos appear
* **History**: how far back to load (default 400 days) and who supplies the export
* **KPI definitions**: any client-specific meaning (e.g. on-time measured against original vs
  revised promise date), targets and thresholds

## 4. Access the setup needs

* ERP API credentials (read-only service account) or export files
* An admin login to Jeldi for the client's owner
* Their AI key (OpenAI or Anthropic) if they want the assistant, or a decision to run without it
* Email provider decision (Microsoft 365 / Google / SMTP) if they want reports mailed

## 5. Commercials

* Setup: number of connectors, import volume, custom mapping, training session(s)
* Monthly: hosting tier (shared / dedicated), sync frequency, support window, number of users
* Renewal and data-ownership terms (they can export everything as CSV at any time)

## 6. Go-live checklist

1. Organization created, owner invited, roles assigned
2. Connector connected or ledger enabled; first sync clean (no warnings) or warnings understood
3. KPIs sanity-checked against a number the client already trusts (last month's revenue, open AR)
4. Dashboard layout and charts set for the owner; targets entered
5. AI key entered and tested; email provider connected if wanted
6. Client walked through Ledger/ERP status, drill-downs and Settings; support contact agreed
