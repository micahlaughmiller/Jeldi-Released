# Integrations: one database for everything a company runs on

A company without an ERP still has its data spread across the tools it already uses. The
integration hub pulls those tools into one organization-scoped store in Jeldi, so the dashboard,
the activity feed, search and the AI assistant work from a single connected database.

Open it from the sidebar: **Integrations** (`/integrations`).

## What connects today

| Tool | What is pulled | Auth | Feeds KPIs |
|---|---|---|---|
| GitHub (github.com or Enterprise) | repositories, pull requests, issues, commits | personal access token (`repo`, or fine-grained read on Contents / Issues / Pull requests); OAuth app optional | no |
| GitLab (gitlab.com or self-managed) | projects, merge requests, issues, commits | personal access token with `read_api` | no |
| Microsoft 365 | Teams, channels, channel messages; SharePoint sites and document libraries; OneDrive (optional) | OAuth through the same Azure app registration used for Microsoft sign-in and Outlook | no |
| QuickBooks Online | customers, items, invoices, payments, credit memos, sales receipts | OAuth through an Intuit app (or a pasted token for testing) | **yes**: revenue, receivables, refunds, margin, inventory |

Every record lands in the same shape (`source_records`): provider, kind, title, link, author,
container (repository / team / site / customer), state, when it happened, searchable text and
the raw payload. The unique key is source + kind + external id, so re-syncs update in place.

Finance sources also produce the canonical ERP snapshot. QuickBooks writes a companion
`erp_connections` row (`erpSystem = quickbooks`, `connectionType = source`) so the existing KPI
engine, charts and drill-downs pick the numbers up unchanged, merged with any other ERP the
organization has connected. Removing the source switches that connection off.

## Setting up OAuth (one-time, per Jeldi server)

Tokens always work. OAuth gives the client a "Connect with ..." button instead of creating a
token by hand. Redirect URI for every provider: `https://<your-host>/api/sources/oauth/callback`
(override with `SOURCES_OAUTH_REDIRECT_URI`).

* **GitHub**: create an OAuth app (Settings > Developer settings). Set `GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET`.
* **Microsoft 365**: in the existing app registration (the one behind `MICROSOFT_CLIENT_ID`),
  add the delegated Graph permissions `Team.ReadBasic.All`, `Channel.ReadBasic.All`,
  `ChannelMessage.Read.All`, `Sites.Read.All`, `Files.Read.All`, `offline_access`, and add the
  redirect URI above. A tenant admin has to grant consent once for `ChannelMessage.Read.All`.
* **QuickBooks Online**: create an app at developer.intuit.com with the Accounting scope, add the
  redirect URI, and set `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` and
  `QUICKBOOKS_ENVIRONMENT` (`production` or `sandbox`).

## Sync

* First connection pulls `SOURCE_SYNC_HISTORY_DAYS` (default 180) of history in the background.
* Every source is re-pulled every `SOURCE_SYNC_INTERVAL_MINUTES` (default 30) on the long-running
  server, and by the scheduled Lambda (`sync-lambda.ts`) on AWS. Incremental pulls overlap the
  previous sync by six hours so late edits are not missed.
* "Sync" on a card re-pulls that tool now; "Sync everything" does all of them.
* Tokens are encrypted with `TOKEN_ENCRYPTION_KEY`; OAuth refresh tokens are used automatically
  when the access token is within two minutes of expiry.

## API

All routes require a login; reading needs `erp_connections.read` (every role), connecting and
removing need `erp_connections.manage` (owners, admins, operations).

| Route | Purpose |
|---|---|
| `GET /api/sources/providers` | catalogue, token fields, whether OAuth is set up |
| `GET /api/sources` | the organization's connected tools with record counts and status |
| `GET /api/sources/overview?days=30` | counts by kind, open work, stale items, busiest containers and people |
| `GET /api/sources/records?q=&provider=&kind=&container=&days=&limit=&offset=` | unified feed / search |
| `GET /api/sources/records/:id` | one record with its raw payload |
| `POST /api/sources/test` | try a token without saving |
| `POST /api/sources/connect` | save a token connection and start the first sync |
| `POST /api/sources/oauth/:provider/start` | returns the consent URL |
| `GET /api/sources/oauth/callback` | provider redirect target |
| `POST /api/sources/:id/sync`, `POST /api/sources/sync` | sync one / all (`{ "full": true }` re-pulls the whole window) |
| `POST /api/sources/:id/test` | re-test stored credentials |
| `DELETE /api/sources/:id` | remove the tool and its records |

## Boutique setup, step by step

1. Fill in [CLIENT_INTAKE.md](CLIENT_INTAKE.md) with the client's stack.
2. Create the client's organization and invite their people with roles (see
   [ORGANIZATIONS.md](ORGANIZATIONS.md)); the owner enters their own OpenAI or Claude key under
   Settings > Organization.
3. For each tool in scope, connect it on the Integrations page with a token the client creates,
   or through "Connect with ..." once the OAuth apps above exist. Books first (QuickBooks), then
   engineering (GitHub / GitLab), then collaboration (Microsoft 365).
4. Watch the first sync finish (record counts on the cards), open the dashboard to confirm the
   finance KPIs, and hand over the login.

## Adding another tool

One file in `server/sources/` implementing `SourceConnector` (`testConnection`, `sync` that emits
`SourceItem` batches, and `toErpSnapshot` for finance systems), plus one entry in
`server/sources/index.ts` (display name, token fields, OAuth env). Routes, storage, sync, the
overview and the page are generic. Tests use the same in-memory fetch as the ERP connectors
(`server/connectors/__tests__/fakeFetch.ts`).
