/**
 * Organizations are the tenant unit: every user belongs to at least one, every ERP connection,
 * snapshot and KPI definition belongs to exactly one, and AI keys / branding live on it.
 *
 * Roles inside an organization:
 *   owner   - created it or was made owner; full control including billing/AI keys
 *   admin   - the org-scoped "admin" RBAC role; manages members, connections, settings
 *   member  - everything else; permissions come from their org-scoped RBAC roles
 */
import crypto from "crypto";
import { storage } from "../storage";
import { encryptionService } from "./encryptionService";
import type { Organization, OrganizationMember, User } from "@shared/schema";

export type OrgRole = "owner" | "admin" | "member";

export interface OrgContext {
  organization: Organization;
  membership: OrganizationMember;
  orgRole: OrgRole;
}

/** Roles a member can be given inside an organization (mapped onto the RBAC role table) */
export const ORG_MEMBER_ROLES = ["admin", "ops_manager", "finance", "cfo", "project_manager", "cost_manager", "sales", "marketing", "user"] as const;
export type OrgMemberRole = (typeof ORG_MEMBER_ROLES)[number];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

export async function orgRoleFor(userId: string, organizationId: string, membership: OrganizationMember): Promise<OrgRole> {
  if (membership.isOwner) return "owner";
  const roles = await storage.getUserRolesInOrganization(userId, organizationId);
  return roles.some(r => r.role.name === "admin") ? "admin" : "member";
}

/** Create a personal organization for a user who has none, make them owner + org admin */
export async function createPersonalOrganization(user: Pick<User, "id" | "username" | "email">, displayName?: string): Promise<Organization> {
  const base = slugify(user.username || user.email.split("@")[0]);
  let name = `${base}-${crypto.randomBytes(3).toString("hex")}`;
  while (await storage.getOrganizationByName(name)) name = `${base}-${crypto.randomBytes(3).toString("hex")}`;
  const org = await storage.createOrganization({
    name,
    displayName: displayName || `${user.username || user.email.split("@")[0]}'s Organization`,
    createdBy: user.id,
    isActive: true,
  });
  await setOrgMemberRole(user.id, org.id, "admin", user.id);
  await storage.updateUser(user.id, { defaultOrganizationId: org.id });
  return org;
}

/** Replace a member's org-scoped RBAC role with `roleName` */
export async function setOrgMemberRole(userId: string, organizationId: string, roleName: OrgMemberRole, assignedBy?: string): Promise<void> {
  const target = await storage.getRoleByName(roleName);
  if (!target) throw new Error(`Unknown role: ${roleName}`);
  const current = await storage.getUserRolesInOrganization(userId, organizationId);
  for (const r of current) {
    if (r.roleId !== target.id) await storage.revokeRoleFromUserInOrganization(userId, r.roleId, organizationId);
  }
  if (!current.some(r => r.roleId === target.id)) {
    await storage.assignRoleToUserInOrganization(userId, target.id, organizationId, assignedBy);
  }
}

export async function orgMemberRoleName(userId: string, organizationId: string): Promise<OrgMemberRole | null> {
  const roles = await storage.getUserRolesInOrganization(userId, organizationId);
  const found = roles.map(r => r.role.name).find(n => (ORG_MEMBER_ROLES as readonly string[]).includes(n));
  return (found as OrgMemberRole) ?? null;
}

/**
 * Which organization a request acts on: the one asked for in X-Organization-Id if the user is a
 * member, else the user's default, else their first membership. A user with no organization
 * gets a personal one created on the spot, so every account is always inside a tenant.
 */
export async function resolveOrganizationForUser(userId: string, requestedOrganizationId?: string): Promise<OrgContext> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error("User not found");
  let memberships = await storage.getUserOrganizationMemberships(userId);
  memberships = memberships.filter(m => m.status === "active" && m.organization.isActive);

  if (memberships.length === 0) {
    const org = await createPersonalOrganization(user);
    await storage.backfillOrganizationScope(userId, org.id);
    memberships = (await storage.getUserOrganizationMemberships(userId)).filter(m => m.status === "active");
  }

  const pick =
    (requestedOrganizationId && memberships.find(m => m.organizationId === requestedOrganizationId)) ||
    (user.defaultOrganizationId && memberships.find(m => m.organizationId === user.defaultOrganizationId)) ||
    memberships[0];

  if (!user.defaultOrganizationId || user.defaultOrganizationId !== pick.organizationId && !requestedOrganizationId) {
    if (!user.defaultOrganizationId) await storage.updateUser(userId, { defaultOrganizationId: pick.organizationId });
  }
  const { organization, ...membership } = pick;
  return { organization, membership, orgRole: await orgRoleFor(userId, organization.id, membership) };
}

/** Startup: make sure every user is inside an organization and legacy per-user data is scoped */
export async function ensureOrganizationsForAllUsers(): Promise<void> {
  const users = await storage.getAllUsersWithRoles();
  let created = 0, backfilled = 0;
  for (const u of users) {
    try {
      const memberships = (await storage.getUserOrganizationMemberships(u.id)).filter(m => m.status === "active");
      let orgId = memberships.find(m => m.organizationId === u.defaultOrganizationId)?.organizationId ?? memberships[0]?.organizationId;
      if (!orgId) {
        orgId = (await createPersonalOrganization(u)).id;
        created++;
      } else if (!u.defaultOrganizationId) {
        await storage.updateUser(u.id, { defaultOrganizationId: orgId });
      }
      backfilled += await storage.backfillOrganizationScope(u.id, orgId);
    } catch (error) {
      console.error(`Organization bootstrap failed for ${u.email}:`, (error as Error).message);
    }
  }
  if (created || backfilled) console.log(`Organizations: created ${created}, scoped ${backfilled} legacy row(s)`);
}

// ---- AI provider configuration -------------------------------------------------------------

export type AiProvider = "none" | "openai" | "anthropic";
export interface OrgAiConfig { provider: AiProvider; apiKey: string | null; model: string | null }

export const DEFAULT_AI_MODELS: Record<Exclude<AiProvider, "none">, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-opus-5",
};

export async function getOrgAiConfig(organizationId: string): Promise<OrgAiConfig> {
  const org = await storage.getOrganization(organizationId);
  if (!org) return { provider: "none", apiKey: null, model: null };
  const provider = (org.aiProvider as AiProvider) || "none";
  let apiKey: string | null = null;
  if (org.aiApiKey) {
    try { apiKey = encryptionService.decrypt(org.aiApiKey); } catch { apiKey = null; }
  }
  return { provider, apiKey, model: org.aiModel ?? null };
}

export async function setOrgAiConfig(organizationId: string, input: { provider: AiProvider; apiKey?: string | null; model?: string | null }): Promise<void> {
  const updates: Record<string, unknown> = { aiProvider: input.provider, aiModel: input.model || null };
  if (input.provider === "none") updates.aiApiKey = null;
  else if (input.apiKey) updates.aiApiKey = encryptionService.encrypt(input.apiKey);
  await storage.updateOrganization(organizationId, updates as any);
}

/** Last four characters of the stored key, for display */
export async function orgAiKeyHint(organizationId: string): Promise<string | null> {
  const cfg = await getOrgAiConfig(organizationId);
  return cfg.apiKey ? `••••${cfg.apiKey.slice(-4)}` : null;
}

// ---- invitations ---------------------------------------------------------------------------

export async function createInvitation(organizationId: string, email: string, roleName: OrgMemberRole, invitedBy: string) {
  const token = crypto.randomBytes(24).toString("base64url");
  return storage.createOrganizationInvitation({
    organizationId,
    email: email.trim().toLowerCase(),
    roleName,
    token,
    invitedBy,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
}

/** Join the invited organization; returns the organization id or null when the token is unusable */
export async function acceptInvitation(token: string, user: Pick<User, "id" | "email">): Promise<string | null> {
  const inv = await storage.getOrganizationInvitationByToken(token);
  if (!inv || inv.acceptedAt || inv.expiresAt.getTime() < Date.now()) return null;
  if (inv.email !== user.email.trim().toLowerCase()) return null;
  const existing = await storage.getOrganizationMember(inv.organizationId, user.id);
  if (!existing) {
    await storage.addOrganizationMember({ organizationId: inv.organizationId, userId: user.id, status: "active", isOwner: false, invitedBy: inv.invitedBy });
  }
  await setOrgMemberRole(user.id, inv.organizationId, inv.roleName as OrgMemberRole, inv.invitedBy ?? undefined);
  await storage.acceptOrganizationInvitation(inv.id);
  await storage.updateUser(user.id, { defaultOrganizationId: inv.organizationId });
  return inv.organizationId;
}
