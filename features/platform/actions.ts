"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/context";
import { rpcMessage } from "@/lib/auth/scope";
import { grantAdminSchema, organizationSuspensionSchema, revokeAdminSchema } from "./schemas";

export type PlatformState = { error?: string; success?: string };

/**
 * Every action here is authorized inside its database function via is_platform_admin(), which also
 * writes the platform audit row. The check below is only so the UI can say something useful; it is
 * not what protects the action.
 */
async function platformClient() {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("is_platform_admin");
  if (data !== true) return { error: "You are not a platform administrator." } as const;
  return { supabase } as const;
}

export async function setOrganizationSuspended(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const parsed = organizationSuspensionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the suspension details." };
  const client = await platformClient();
  if ("error" in client) return client;
  const { error } = await client.supabase.rpc("platform_set_organization_suspended", {
    requested_organization_id: parsed.data.organizationId,
    suspend: parsed.data.suspend,
    reason: parsed.data.reason || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to change the organization. Please try again.") };
  revalidatePath("/admin/organizations");
  revalidatePath("/admin");
  return { success: parsed.data.suspend ? "Organization suspended." : "Organization restored." };
}

export async function grantPlatformAdmin(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const parsed = grantAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the email address." };
  const client = await platformClient();
  if ("error" in client) return client;
  const { error } = await client.supabase.rpc("platform_grant_admin", {
    target_email: parsed.data.email,
    admin_note: parsed.data.note || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to grant platform administration. Please try again.") };
  revalidatePath("/admin/administrators");
  return { success: `${parsed.data.email} is now a platform administrator.` };
}

export async function revokePlatformAdmin(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const parsed = revokeAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Select an administrator to revoke." };
  const client = await platformClient();
  if ("error" in client) return client;
  const { error } = await client.supabase.rpc("platform_revoke_admin", { target_user_id: parsed.data.userId });
  if (error) return { error: rpcMessage(error, "Unable to revoke platform administration. Please try again.") };
  revalidatePath("/admin/administrators");
  return { success: "Platform administration revoked." };
}
