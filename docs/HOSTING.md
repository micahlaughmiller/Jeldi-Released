# Hosting Jeldi

Jeldi is two things: a Postgres database and a long-running Node/Express server that also serves
the built React client, holds WebSocket connections, and runs the ERP sync scheduler. Any Postgres
works for the database; any host that runs a Node process works for the app. Serverless (the AWS
Lambda pipeline in `serverless.yml`) also works but loses WebSockets and needs the separate
scheduled `sync` function.

## Database on Supabase

1. Create a project at https://supabase.com (free tier is enough for the demo; note the database
   password you set).
2. **Project Settings > Database > Connection string**. Pick **Session pooler** (IPv4, port 5432).
   The URL looks like
   `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Use this same URL everywhere (server, `db:push`, seed). The **Transaction pooler** (port 6543)
   is only for Lambda-style workloads; the **Direct** connection is IPv6-only on the free tier.
3. Locally, put it in `.env` as `DATABASE_URL` and create the schema:

   ```bash
   npm run db:push
   ```

   Re-run `db:push` after any change to `shared/schema.ts`. There are no migration files yet.
4. Optional: seed the Morton Industries demo data into it:

   ```bash
   DEMO_USER_PASSWORD='choose-one' npm run seed:demo
   ```

TLS is enabled automatically for non-local hosts. Supabase's certificate chain is not verified by
default; set `DATABASE_SSL=verify` once you have the Supabase CA in your trust store.

Supabase Auth, Storage and Row Level Security are not used; Jeldi manages its own users, JWTs and
sessions in its own tables.

## Demo instance in a few clicks (Render blueprint)

`render.yaml` in the repo root describes the demo service with `DEMO_MODE=true` already set and
the two secrets generated for you.

1. https://render.com > **New > Blueprint** > connect `micahlaughmiller/Jeldi-Released`.
2. When prompted, paste the Supabase session-pooler URL as `DATABASE_URL` and choose a
   `DEMO_USER_PASSWORD`. `OPENAI_API_KEY` can be left blank (AI assistant off).
3. After the first deploy, copy the service URL Render assigned (e.g.
   `https://jeldi-demo.onrender.com`) into `FRONTEND_URL`, and its hostname into
   `ALLOWED_DOMAINS`, then redeploy once.
4. Open the URL and press **View Demo**. The first start seeds Morton Industries into Supabase
   (30-60 s on the first boot); every later push to `main` redeploys automatically.

A `Dockerfile` is also included for Railway, Fly.io or Cloud Run with the same environment
variables.

## App on Render (manual web service)

1. https://render.com > **New > Web Service** > connect the `micahlaughmiller/Jeldi-Released`
   repository, branch `main`.
2. Settings:
   * Runtime: Node
   * Build command: `npm ci --include=dev && npm run build && npm run db:push -- --force`
   * Start command: `npm start`
   * Instance: Starter (the free tier sleeps after 15 minutes and the sync scheduler with it)
3. Environment variables (Environment tab):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the Supabase session-pooler URL |
   | `JWT_SECRET` | `openssl rand -base64 64` |
   | `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` |
   | `OPENAI_API_KEY` | your key |
   | `FRONTEND_URL` | `https://<service>.onrender.com` (or the custom domain) |
   | `ALLOWED_DOMAINS` | the same hostname |
   | `DEMO_MODE` | `true` for the demo instance only |
   | `DEMO_USER_PASSWORD` | demo login password |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional, Gmail + Google sign-in |
   | `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | optional, Outlook + Microsoft sign-in |
   | `EMAIL_OAUTH_REDIRECT_URI` | `https://<host>/api/email/callback` |
   | `ERP_SYNC_INTERVAL_MINUTES` | `15` |

   Render sets `PORT` itself; the server reads it.
4. Deploy. Health check path: `/api/security/policy` (any 200 will do). Render auto-deploys on
   every push to `main`.
5. For two instances (demo + overlay) create two services from the same repo with different
   `DEMO_MODE`, `FRONTEND_URL` and `ALLOWED_DOMAINS`.

Railway and Fly.io work the same way with the same commands and variables.

## CORS and hostnames

`server/index.ts` allows `https://demo.jeldi.app`, `https://overlay.jeldi.app` and the original
CloudFront domain, plus whatever `FRONTEND_URL` / `ALLOWED_DOMAINS` name. When the client is served
by the same server (Render setup above) requests are same-origin and CORS does not apply.

## Keeping the AWS pipeline

`.github/workflows/deploy.yml` still deploys to Lambda on push to `main`. If you are not using AWS
yet, either delete the workflow or set the repository variable `DEMO_MODE` and the secrets it lists
in `.github/DEPLOYMENT_SETUP.md`; otherwise every push shows a failed run.
