import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";

export type Workspace = Awaited<ReturnType<typeof getActiveWorkspace>>;
export type ActiveScope = { workspace: Workspace; organizationId: string; siteId: string };
export type ScopeResult = { error: string } | ActiveScope;

/**
 * Resolves the active organization and mine site and confirms the caller holds `permission`.
 * Server actions must still rely on RLS as the real boundary; this produces the readable message.
 */
export async function requireScope(permission: string, denial: string): Promise<ScopeResult> {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site) return { error: "Select an active organization and mine site first." };
  if (!await hasPermission(organization.id, permission)) return { error: denial };
  return { workspace, organizationId: organization.id, siteId: site.id };
}

/** Confirms a row belongs to the active organization and mine site before writing related records. */
export async function rowInScope(scope: ActiveScope, table: string, id: string, options?: { siteScoped?: boolean }) {
  let query = scope.workspace.supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("organization_id", scope.organizationId);
  if (options?.siteScoped !== false) query = query.eq("mine_site_id", scope.siteId);
  const { data } = await query.is("deleted_at", null).maybeSingle();
  return Boolean(data);
}

/** Same as `rowInScope` for tables that have no soft-delete column. */
export async function rowInScopeHard(scope: ActiveScope, table: string, id: string, options?: { siteScoped?: boolean }) {
  let query = scope.workspace.supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("organization_id", scope.organizationId);
  if (options?.siteScoped !== false) query = query.eq("mine_site_id", scope.siteId);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

/** Maps a raised PostgreSQL exception from a module RPC onto a message an operator can act on. */
export function rpcMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501") return "You do not have permission to do that.";
  if (error.code === "P0002") return "That record no longer exists.";
  if (error.code === "22003" || error.code === "23514" || error.code === "P0001") {
    return error.message?.replace(/^.*?:\s*/, "") ?? fallback;
  }
  return fallback;
}
