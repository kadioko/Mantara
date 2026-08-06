import { createClient } from "@/lib/supabase/server";

export async function hasPermission(organizationId: string, permissionCode: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    requested_organization_id: organizationId,
    requested_permission_code: permissionCode,
  });
  if (error) return false;
  return data === true;
}
