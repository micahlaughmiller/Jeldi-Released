# ERP connectors

Jeldi pulls data from an ERP through a **connector** (`server/connectors/`). A connector
authenticates, reads the handful of business objects the dashboard needs, and normalises them
into one `ErpSnapshot` (`server/connectors/types.ts`). Everything downstream, the KPI engine
(`server/services/kpiEngine.ts`), the dashboard charts and the analytics pages, reads snapshots
only, so it never needs to know which ERP the data came from.

Two connectors exist today: **Epicor Kinetic** and **Infor SyteLine / CloudSuite Industrial**.
The other systems listed in the connection wizard still have OAuth scaffolding only and do not
produce data.

## How data flows

1. A user connects an ERP in the dashboard (ERP status button > pick the system > *API
   Credentials*). The wizard posts to `POST /api/erp/test-credentials`, then
   `POST /api/erp/connect-credentials`. Secrets are stored encrypted (AES-256-GCM, key
   `TOKEN_ENCRYPTION_KEY`) in `erp_connections.api_secret`; non-secret settings go in
   `erp_connections.config`.
2. A sync pulls a snapshot: `syncConnection()` in `server/services/syncService.ts`. It runs
   * right after connecting (in the background),
   * every `ERP_SYNC_INTERVAL_MINUTES` on the long-running server (`server/index.ts`),
   * on the EventBridge schedule in `serverless.yml` for the Lambda deployment
     (`dist/sync-lambda.handler`, every 15 minutes by default),
   * on demand via `POST /api/erp/sync`.
3. The snapshot is written to `erp_snapshots` (the newest three per connection are kept), and one
   `kpi_data` row per universal KPI is appended, so `/api/dashboard/kpi-preferences`,
   `/api/realtime/kpi-updates` and the WebSocket push show the new values.
4. `/api/charts/*`, `/api/analytics/overview` and `/api/analytics/revenue` read the latest
   snapshot directly. `GET /api/erp/sync-status` reports last sync time, errors and warnings.

Pulls go back `ERP_SYNC_HISTORY_DAYS` (default 400) so that previous-year comparisons work.

## What each KPI means

| KPI type | Computed as (last 30 days unless noted) |
|---|---|
| `revenue` | Posted invoices minus credit memos |
| `orders` | Sales orders currently open |
| `on_time_delivery` | Shipments on or before the line's promised date / all shipments |
| `inventory` (shown as "Inventory Fill Rate") | Order lines shipped complete / lines shipped |
| `cycle_time` | Average job start to completion, for jobs completed in the window |
| `gross_margin` | (revenue - cost of shipped lines) / revenue |
| `cost_per_unit` | Cost of shipped lines / units shipped |
| `working_capital_efficiency` | 30-day revenue / open receivables |
| `performance` | Jobs completed by their due date / jobs completed |
| `efficiency` | Open orders not past their requested date / open orders |

A KPI shows `N/A` (and nothing is written to `kpi_data`) when the snapshot has no data for it,
never a fabricated number. `change` is the percentage move against the previous 30 days.

## Epicor Kinetic

Uses the Kinetic REST API v2 (OData):
`{server}/api/v2/odata/{Company}/{Service}/{EntitySet}`.

**Credentials asked for**

| Field | Where it comes from |
|---|---|
| Kinetic server URL | The application server, e.g. `https://kinetic.example.com/EpicorERP` (cloud: `https://centralusdtapp01.epicorsaas.com/SaaS123`) |
| Company ID | The company code (e.g. `EPIC06`) |
| API key | Kinetic > System Setup > Security Maintenance > **API Key Maintenance**. Sent as `x-api-key`. |
| Service account username / password | A Kinetic user; sent as HTTP Basic. A bearer token can be supplied instead through the API (`bearerToken`). |

**Access needed by the service account** (read-only): `Erp.BO.CompanySvc`, `Erp.BO.SalesOrderSvc`
(SalesOrders, OrderRels), `Erp.BO.CustShipSvc` (CustShips, ShipDtls), `Erp.BO.ARInvoiceSvc`
(ARInvoices, InvcDtls), `Erp.BO.JobEntrySvc`, `Erp.BO.PartSvc` (PartWhses, PartCosts). In
Kinetic these are granted through the user's security group and the API key's access scope. If
one service is not granted the sync still completes and records a warning for that entity.

**Field mapping** (`server/connectors/epicor.ts`, `DEFAULT_ENTITIES`): OrderHed →
sales orders, OrderRel + ShipDtl → deliveries, InvcHead → invoices, InvcDtl → margin
(`DocExtPrice` vs the unit cost columns), JobHead → jobs, PartWhse + PartCost → inventory.
Sites with customised tables can override any entity path, `$select` list or `$filter`
through `config.overrides` on the connection row.

## Infor SyteLine / CloudSuite Industrial

Uses the Mongoose IDO REST service:
`{IDORequestService}/ido/load/{IDO}?properties=…&filter=…&recordCap=…`.

**CloudSuite (ION API)**

| Field | Where it comes from |
|---|---|
| IDORequestService URL | The ION API gateway URL for the CSI suite, e.g. `https://mingle-ionapi.inforcloudsuite.com/TENANT/CSI/IDORequestService` |
| Mongoose configuration name | The SyteLine configuration (e.g. `SL_Prod`); sent as `X-Infor-MongooseConfig` |
| Token URL, client ID, client secret, service account key/secret | From the `.ionapi` file of a **Backend Service** authorised app in ION API: `pu`+`ot`, `ci`, `cs`, `saak`, `sask`. Tokens are refreshed automatically. |

**On-premises**

| Field | Notes |
|---|---|
| IDORequestService URL | `https://your-server/IDORequestService` |
| Mongoose configuration name | as above |
| Username / password | A SyteLine user; a Mongoose token is fetched from `/ido/token/{config}/{user}/{password}` and refreshed hourly |

**IDOs read** (`server/connectors/syteline.ts`, `DEFAULT_IDOS`): `SLCos` (customer orders),
`SLCoitems` (lines: due date, price, cost), `SLCoShipments` (ship dates), `SLArtrans`
(AR: invoices `I`/`D`, payments `P`, credits `C`; open balance is rebuilt from what was applied
to each invoice), `SLJobs`, `SLItems` (unit cost), `SLItemwhses` (on hand). Override IDO names,
property lists or filters through `config.overrides` for sites with extended IDOs.

## Testing

Unit tests run against recorded-style fake HTTP responses, no ERP needed:

```bash
npm test
```

Neither connector has been run against a live tenant from this repository yet. Expect the first
real connection to surface field-name differences (custom columns, site-specific statuses); the
`warnings` array in `GET /api/erp/sync-status` and the sync log will say which entity failed and
why, and `config.overrides` lets you adjust without a code change.

## Adding another ERP

1. Implement `ErpConnector` in `server/connectors/<system>.ts`, filling an `ErpSnapshot`.
2. Register it in `server/connectors/index.ts` (`CONNECTOR_SYSTEMS`, `SECRET_FIELDS`, `buildConnector`).
3. Add its credential fields to `client/src/components/erp/connector-credentials-form.tsx`.
4. Add tests under `server/connectors/__tests__/`.
