import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Loads every permission the caller holds in an organization, once per request.
 *
 * React's cache() deduplicates this across a single render pass, so a page that asks about nine
 * modules makes one database call rather than nine. That matters for correctness as much as speed:
 * each call previously built its own Supabase client, and twenty of those refreshing the same auth
 * session concurrently would fail often enough that navigation items disappeared at random.
 *
 * Returns null when the lookup itself failed, which is deliberately different from "holds nothing".
 */
const loadPermissions = cache(async (organizationId: string): Promise<Set<string> | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_permissions", {
    requested_organization_id: organizationId,
  });

  if (error) {
    // Worth seeing in logs: a failure here looks exactly like a loss of access to the operator.
    console.error("Failed to load permissions", { organizationId, message: error.message });
    return null;
  }

  const codes = Array.isArray(data) ? data : [];
  return new Set(codes.filter((code): code is string => typeof code === "string"));
});

/**
 * Whether the caller holds `permissionCode`. Denies when the lookup failed, because failing open
 * would be worse — but unlike before, the failure is logged rather than silently indistinguishable
 * from a denial. RLS remains the real boundary; this only decides what the interface offers.
 */
export async function hasPermission(organizationId: string, permissionCode: string) {
  const permissions = await loadPermissions(organizationId);
  return permissions?.has(permissionCode) ?? false;
}

/** Resolves several permissions from the same cached lookup. */
export async function hasPermissions<const T extends readonly string[]>(
  organizationId: string,
  codes: T,
): Promise<Record<T[number], boolean>> {
  const permissions = await loadPermissions(organizationId);
  return Object.fromEntries(codes.map((code) => [code, permissions?.has(code) ?? false])) as Record<T[number], boolean>;
}
