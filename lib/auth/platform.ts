import { requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Platform administration is a separate axis from tenancy. Holding it grants no access to any
 * organization's operational records; it only unlocks the platform metadata and support tools under
 * `/admin`. Tenant data remains reachable exclusively through organization membership.
 */
export async function isPlatformAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}

export async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.rpc("is_platform_admin");
  return { supabase, user, isAdmin: data === true };
}
