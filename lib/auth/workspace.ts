import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/context";

export type WorkspaceOrganization = { id: string; name: string };
export type WorkspaceSite = { id: string; name: string };

export async function getActiveWorkspace() {
  const { supabase, user } = await requireUser();
  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, organization:organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at");

  if (membershipError) throw new Error("Unable to load your organizations.");

  const organizations = (membershipRows ?? []).flatMap((row) => {
    const organization = Array.isArray(row.organization) ? row.organization[0] : row.organization;
    return organization ? [{ id: organization.id, name: organization.name }] : [];
  }) as WorkspaceOrganization[];

  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get("mantara-org-id")?.value;
  const activeOrganization = organizations.find(({ id }) => id === requestedOrganizationId) ?? organizations[0] ?? null;
  if (!activeOrganization) return { supabase, user, organizations, activeOrganization: null, sites: [], activeSite: null };

  const { data: siteRows, error: siteError } = await supabase
    .from("mine_sites")
    .select("id, name")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  if (siteError) throw new Error("Unable to load your mine sites.");

  const sites = (siteRows ?? []) as WorkspaceSite[];
  const requestedSiteId = cookieStore.get("mantara-site-id")?.value;
  const activeSite = sites.find(({ id }) => id === requestedSiteId) ?? sites[0] ?? null;
  return { supabase, user, organizations, activeOrganization, sites, activeSite };
}
