"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { rpcMessage } from "@/lib/auth/scope";
import { getActiveWorkspace } from "@/lib/auth/workspace";

export type MemberState = { error?: string; success?: string };

export const systemRoleCodes = [
  "company_owner",
  "mine_manager",
  "site_supervisor",
  "accountant",
  "storekeeper",
  "maintenance_officer",
  "safety_officer",
  "viewer",
] as const;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  roleCode: z.enum(systemRoleCodes),
});

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  roleCode: z.enum(systemRoleCodes),
});

const statusChangeSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

const revokeSchema = z.object({ invitationId: z.string().uuid() });

/** Membership administration is organization-wide, so it needs the organization rather than a site. */
async function activeOrganization() {
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization) return { error: "Select an active organization first." } as const;
  return { supabase: workspace.supabase, organizationId: workspace.activeOrganization.id } as const;
}

export async function inviteMember(_: MemberState, formData: FormData): Promise<MemberState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the invitation details." };
  const scope = await activeOrganization();
  if ("error" in scope) return scope;
  const { error } = await scope.supabase.rpc("invite_member", {
    requested_organization_id: scope.organizationId,
    invitee_email: parsed.data.email,
    role_code: parsed.data.roleCode,
  });
  if (error) return { error: rpcMessage(error, "Unable to send the invitation. Please try again.") };
  revalidatePath("/settings/users");
  return { success: `${parsed.data.email} will join when they next sign in.` };
}

export async function revokeInvitation(_: MemberState, formData: FormData): Promise<MemberState> {
  const parsed = revokeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Select an invitation to revoke." };
  const scope = await activeOrganization();
  if ("error" in scope) return scope;
  const { error } = await scope.supabase.rpc("revoke_invitation", { requested_invitation_id: parsed.data.invitationId });
  if (error) return { error: rpcMessage(error, "Unable to revoke the invitation. Please try again.") };
  revalidatePath("/settings/users");
  return { success: "Invitation revoked." };
}

export async function changeMemberRole(_: MemberState, formData: FormData): Promise<MemberState> {
  const parsed = roleChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the role selection." };
  const scope = await activeOrganization();
  if ("error" in scope) return scope;
  const { error } = await scope.supabase.rpc("set_member_role", {
    requested_organization_id: scope.organizationId,
    target_user_id: parsed.data.userId,
    role_code: parsed.data.roleCode,
  });
  if (error) return { error: rpcMessage(error, "Unable to change the role. Please try again.") };
  revalidatePath("/settings/users");
  return { success: "Role updated." };
}

export async function changeMemberStatus(_: MemberState, formData: FormData): Promise<MemberState> {
  const parsed = statusChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the access selection." };
  const scope = await activeOrganization();
  if ("error" in scope) return scope;
  const { error } = await scope.supabase.rpc("set_member_status", {
    requested_organization_id: scope.organizationId,
    target_user_id: parsed.data.userId,
    new_status: parsed.data.status,
  });
  if (error) return { error: rpcMessage(error, "Unable to change access. Please try again.") };
  revalidatePath("/settings/users");
  return { success: parsed.data.status === "active" ? "Access restored." : "Access suspended." };
}

/**
 * Claims any invitation addressed to the signed-in user. Called after authentication rather than on
 * every page, so an invited person becomes a member the first time they arrive.
 */
export async function acceptPendingInvitations() {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("accept_pending_invitations");
  return typeof data === "number" ? data : 0;
}
