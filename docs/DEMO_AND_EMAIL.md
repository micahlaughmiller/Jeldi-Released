# Demo dataset and email setup

## Morton Industries demo dataset

Morton Industries is a fictional precision-machining and fabrication company (`server/services/demoCompany.ts`).
Its data is generated deterministically and served through a **demo ERP connector**
(`server/connectors/demo.ts`), so demos and tests exercise exactly the same sync, KPI and chart
code paths as a real Epicor or SyteLine connection.

What the dataset contains (400 days of history by default):

| Object | Volume | Character |
|---|---|---|
| Sales orders | ~5 per business day, 15 customers | ~3% cancelled, 1-3 lines each, gentle growth and seasonality |
| Deliveries | one per shipped line | ~93% on time, ~6% short-shipped |
| Invoices | one per shipped order, net 30 | two slow-paying customers, ~2% credit memos |
| Jobs | ~60% of lines | planned vs actual duration varies, so cycle time and on-time completion move |
| Inventory | 40 SKUs with unit costs | drives inventory value |

### Run it locally without Postgres

```bash
cp .env.example .env
# in .env:
#   DATABASE_URL=pglite://./data/dev
#   JWT_SECRET=<openssl rand -base64 64>
#   TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
npm run db:push       # creates the schema in the embedded PGlite database
npm run seed:demo     # demo users + Morton Industries connection + first sync
npm run dev:demo      # server with DEMO_MODE=true on http://localhost:5000
```

Then either use **View Demo** on the login page (auto-login as the demo CFO) or sign in with one of
`cfo@`, `coo@`, `admin@demo.jeldi.app` and the value of `DEMO_USER_PASSWORD` (set it before
seeding; otherwise the seeded password is random).

`pglite://` is for development and demos only. Production uses a Postgres `DATABASE_URL`.

### On the hosted demo (demo.jeldi.app)

Set `DEMO_MODE=true` on that stack. On startup the server seeds the demo users, the Morton
Industries connection and the first snapshot; the scheduled sync keeps it fresh. Production
(`overlay.jeldi.app`) runs with `DEMO_MODE` unset and never shows Morton data.

Outside production (`NODE_ENV !== production`) the connection wizard also lists
**Morton Industries (Demo ERP)** so any user can attach the demo dataset to their own account.

## Email providers

| Provider | How it connects | Needs |
|---|---|---|
| Gmail | Google OAuth (PKCE), sends via Gmail API | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or `GMAIL_CLIENT_*`), Gmail API enabled, redirect URI `https://<host>/api/email/callback` registered |
| Outlook / Microsoft 365 | Microsoft OAuth (`common` tenant: work and personal accounts), sends via Microsoft Graph `sendMail` | `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (or `OUTLOOK_CLIENT_SECRET`), delegated `Mail.Send` permission, same redirect URI registered |
| Other (SMTP) | Username/password, verified with a login before saving, sent with nodemailer | Provider SMTP host/port; an app password for Yahoo, iCloud, Zoho, Fastmail, Gmail-with-2FA |
| Demo outbox | Nothing external; messages are captured in memory and shown in the Email Center | Available when `DEMO_MODE=true` or outside production |

Tokens and SMTP passwords are stored encrypted with `TOKEN_ENCRYPTION_KEY`. OAuth tokens are
refreshed automatically before sending; a failed refresh asks the user to reconnect.

Common SMTP settings:

| Provider | Host | Port |
|---|---|---|
| Yahoo | smtp.mail.yahoo.com | 465 (TLS) or 587 |
| iCloud | smtp.mail.me.com | 587 |
| Zoho | smtp.zoho.com | 465 (TLS) or 587 |
| Fastmail | smtp.fastmail.com | 465 (TLS) |
| Microsoft 365 (SMTP AUTH) | smtp.office365.com | 587 |

## Email inside Jeldi

Nobody has to leave the app to send or read mail.

* **Email page** (sidebar > Email): **Inbox** reads the connected Outlook or Gmail mailbox
  (newest 25, open a message, Reply pre-fills the composer with the quoted text); **Sent from
  Jeldi** is the organization's log of everything sent through Jeldi, with what each email was
  about; **Accounts** connects Outlook, Gmail or SMTP. SMTP can send but has no inbox.
* **Right-click any record to email it**: issues, pull requests, Teams messages, files and
  QuickBooks documents on the Integrations page; orders, invoices, jobs and customers in the
  Ledger; any row of a KPI drill-down. "Send by email..." opens the composer with the record's
  details written into the message as plain text. Links are stripped on purpose: the reader
  needs nothing but the email. "Copy details" puts the same text on the clipboard.
* **Recipients**: start typing and the composer suggests people from the organization and
  customers known to the ledger or the connected finance tool; any address can be typed too.
* Every send is logged in `email_messages` (organization, sender, provider, recipients, subject,
  body, status, and the related record). Owners and admins see the whole organization's log,
  everyone else their own.

Formatting lives in `shared/email-format.ts` (`draftFromSourceRecord`, `draftFromLedger`,
`draftFromDrilldownRow`); the composer is `client/src/components/modals/email-composer.tsx`,
opened from anywhere through `useEmailCompose()`; the right-click wrapper is
`client/src/components/email/email-context-menu.tsx`.

Endpoints: `GET /api/email/status`, `POST /api/email/connect/:provider`,
`DELETE /api/email/disconnect/:provider`, `POST /api/email/send` (accepts `related`),
`GET /api/email/sent`, `GET /api/email/inbox?provider=outlook|gmail`,
`GET /api/email/inbox/:provider/:id`, `GET /api/email/directory`, `GET /api/email/outbox`.
