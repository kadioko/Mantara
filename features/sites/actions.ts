"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { rpcMessage } from "@/lib/auth/scope";
import { organizationSchema, siteEditSchema, siteSchema } from "./schemas";

export type SiteState = { error?: string; success?: string };

/**
 * Sites and organization details belong to the organization rather than a site, so these resolve the
 * organization directly instead of going through requireScope, which also insists on an active site.
 */
async function organizationScope(permission: string, denial: string) {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  if (!organization) return { error: "Select an active organization first." } as const;
  if (!await hasPermission(organization.id, permission)) return { error: denial } as const;
  return { supabase: workspace.supabase, organizationId: organization.id, userId: workspace.user.id } as const;
}

export async function createSite(_: SiteState, formData: FormData): Promise<SiteState> {
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the site details." };
  const scope = await organizationScope("site.create", "You do not have permission to add mine sites.");
  if ("error" in scope) return scope;

  const { error } = await scope.supabase.from("mine_sites").insert({
    organization_id: scope.organizationId,
    name: parsed.data.name,
    country_code: parsed.data.countryCode,
    region: parsed.data.region || null,
    district: parsed.data.district || null,
    latitude: parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
    created_by: scope.userId,
    updated_by: scope.userId,
  });
  if (error) return { error: error.code === "23505" ? "A site with that name already exists in this organization." : "Unable to save the mine site. Please try again." };
  revalidatePath("/sites");
  return { success: `${parsed.data.name} added. It is now available in the site switcher.` };
}

export async function updateSite(_: SiteState, formData: FormData): Promise<SiteState> {
  const parsed = siteEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the site details." };
  const scope = await organizationScope("site.update", "You do not have permission to edit mine sites.");
  if ("error" in scope) return scope;

  const { error } = await scope.supabase
    .from("mine_sites")
    .update({
      name: parsed.data.name,
      country_code: parsed.data.countryCode,
      region: parsed.data.region || null,
      district: parsed.data.district || null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      status: parsed.data.status,
      updated_by: scope.userId,
    })
    .eq("id", parsed.data.siteId)
    .eq("organization_id", scope.organizationId)
    .is("deleted_at", null);

  if (error) {
    if (error.code === "23505") return { error: "A site with that name already exists in this organization." };
    // The database refuses to leave an organization with no active site; pass that reason through.
    return { error: rpcMessage(error, "Unable to save the changes. Please try again.") };
  }
  revalidatePath("/sites");
  return { success: "Mine site updated." };
}

export async function updateOrganization(_: SiteState, formData: FormData): Promise<SiteState> {
  const parsed = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the organization details." };
  const scope = await organizationScope("organization.update", "You do not have permission to change organization settings.");
  if ("error" in scope) return scope;

  const { error } = await scope.supabase
    .from("organizations")
    .update({ name: parsed.data.name, country_code: parsed.data.countryCode, updated_by: scope.userId })
    .eq("id", scope.organizationId)
    .is("deleted_at", null);
  if (error) return { error: "Unable to save the organization. Please try again." };
  revalidatePath("/settings/organization");
  revalidatePath("/dashboard");
  return { success: "Organization updated." };
}
