# Organizations, roles and per-tenant AI keys

Every account belongs to an **organization**. The organization is the tenant: it owns the ERP
connections, the synced snapshots, the KPI definitions, the branding and the AI key. Users are
members with a role; each member keeps a personal dashboard layout over the organization's KPIs.

## How a user ends up in an organization

| Path | What happens |
|---|---|
| Registers normally | A personal organization is created (named from the optional "Company name" field, else "<user>'s Organization"); they are its **owner** with the org-scoped **admin** role |
| Registers through an invitation link (`/login?invite=<token>`) | Joins the inviting organization with the role chosen by the inviter; the token only works for the invited email, for 14 days |
| Existed before organizations shipped | `ensureOrganizationsForAllUsers()` at startup gives them a personal organization and moves their old connections, snapshots and KPIs under it |
| Demo users | All three belong to **Morton Industries**; the CFO owns it |

A user can belong to several organizations. The one a session acts on is the user's default
(set with **Switch** under Settings > Organization, or `POST /api/organizations/:id/switch`), and a
request may override it with the `X-Organization-Id` header when the user is a member.

## Roles inside an organization

| Role | Meaning |
|---|---|
| Owner | Created the organization. Everything, including AI keys and members. Cannot be removed or demoted. |
| Admin (`admin`) | Everything the owner can do except transfer ownership. |
| Operations manager, Finance, CFO, Project manager, Cost manager, Sales, Marketing, Viewer (`user`) | The existing RBAC roles, now assigned **per organization**. Their permissions (`server/services/rbac.ts`) only apply inside that organization. |

`requirePermission(resource, action)` passes for platform admins, organization owners/admins, and
anyone whose org-scoped or global roles grant the permission. `requireOrgAdmin` guards
organization settings, members, invitations and the AI key.

## AI: bring your own key

The AI assistant, the insights endpoints and the analytics summaries run on the organization's
own key, stored encrypted with `TOKEN_ENCRYPTION_KEY`:

* **Settings > Organization > AI provider**: choose OpenAI or Anthropic (Claude), paste the key,
  optionally pick a model (defaults `gpt-4o-mini` / `claude-opus-5`), **Test key**, Save.
* Without a key, AI requests return `409 { code: "ai_not_configured" }` and the UI says who can fix it.
* The platform keys `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are used **only** when `DEMO_MODE=true`
  and the organization has no key, so the hosted demo works out of the box and clients never run
  on your bill.

`server/services/aiService.ts` is the only place that talks to a model; `openai.ts` keeps the
prompts and calls it.

## API

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/organizations/current` | member | Organization, your role, AI status (key hint only), `canManage` |
| `PUT /api/organizations/current` | owner/admin | Display name, website, logo, `branding.primaryColor` |
| `GET /api/organizations/mine`, `POST /api/organizations/:id/switch` | member | List and switch |
| `PUT /api/organizations/current/ai`, `POST …/ai/test` | owner/admin | Provider, key, model |
| `GET /api/organizations/current/members` | member | Members with roles |
| `PUT …/members/:userId`, `DELETE …/members/:userId` | owner/admin | Change role, remove |
| `GET/POST/DELETE /api/organizations/current/invitations` | owner/admin | Invitation links |
| `GET /api/invitations/:token` | public | Who the invitation is for (register page) |
| `POST /api/invitations/:token/accept` | signed-in user | Join with an existing account |

Registration accepts `inviteToken` and `organizationName` in its body.

## Data model

New columns: `users.default_organization_id`; `organization_id` on `erp_connections`,
`erp_snapshots`, `kpi_configurations`; `organizations.ai_provider / ai_api_key / ai_model / plan /
plan_status`; new table `organization_invitations`. Run `npm run db:push` (the Render build does).
