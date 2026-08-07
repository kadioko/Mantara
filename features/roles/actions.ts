"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { rpcMessage } from "@/lib/auth/scope";

export type RoleState = { error?: string; success?: string };

const roleUpdateSchema = z.object({
  roleCode: z.string().trim().regex(/^[a-z_]+$/, "Choose a role."),
});

export async function setRolePermissions(_: RoleState, formData: FormData): Promise<RoleState> {
  const parsed = roleUpdateSchema.safeParse({ roleCode: formData.get("roleCode") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a role." };

  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  if (!organization) return { error: "Select an active organization first." };
  if (!await hasPermission(organization.id, "role.manage")) {
    return { error: "You do not have permission to change roles." };
  }

  // Unchecked boxes are simply absent, so the submitted set is the complete new grant.
  const permissionCodes = formData.getAll("permissions").map(String).filter((code) => /^[a-z_]+\.[a-z_]+$/.test(code));

  const { error } = await workspace.supabase.rpc("set_role_permissions", {
    requested_organization_id: organization.id,
    role_code: parsed.data.roleCode,
    permission_codes: permissionCodes,
  });
  if (error) return { error: rpcMessage(error, "Unable to save the role. Please try again.") };

  revalidatePath("/settings/roles");
  return { success: `Saved. ${permissionCodes.length} permission${permissionCodes.length === 1 ? "" : "s"} granted.` };
}
