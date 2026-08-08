"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { rpcMessage } from "@/lib/auth/scope";
import { rateLimitMessage, withinRateLimit } from "@/lib/auth/rate-limit";
import { getLocale } from "@/lib/i18n/locale";
import { invitationMessage, invitationOutcome } from "@/lib/email/messages";
import { emailEnabled, sendEmail } from "@/lib/email/send";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { systemRoleCodes } from "./schemas";

export type MemberState = { error?: string; success?: string };

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
  return {
    supabase: workspace.supabase,
    organizationId: workspace.activeOrganization.id,
    // Carried through so the invitation email can name the organization and the sender without a
    // second lookup — and, more to the point, without reading anything the caller could not.
    organizationName: workspace.activeOrganization.name,
    userId: workspace.user.id,
  } as const;
}

export async function inviteMember(_: MemberState, formData: FormData): Promise<MemberState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the invitation details." };
  const scope = await activeOrganization();
  if ("error" in scope) return scope;
  if (!await withinRateLimit("member.invite")) return { error: rateLimitMessage("member.invite") };
  const { error } = await scope.supabase.rpc("invite_member", {
    requested_organization_id: scope.organizationId,
    invitee_email: parsed.data.email,
    role_code: parsed.data.roleCode,
  });
  if (error) return { error: rpcMessage(error, "Unable to send the invitation. Please try again.") };

  // The invitation is recorded at this point, whatever happens next. Sending the email is a
  // courtesy on top of it, so a provider outage must not turn a successful invitation into an
  // error — that would lose the invitation and leave the operator thinking nothing happened.
  const { sent } = await sendInvitationEmail(scope, parsed.data.email);

  revalidatePath("/settings/users");
  const locale = await getLocale();
  return {
    success: emailEnabled()
      ? `${invitationOutcome(locale, parsed.data.email, sent)} They will join when they next sign in.`
      : `${parsed.data.email} will join when they next sign in. Tell them directly — Mantara is not configured to send email.`,
  };
}

/**
 * Sends the invitation, using only what the inviter can already see.
 *
 * The organization name and the inviter's own name come from the caller's session, not from a
 * privileged lookup: an email must never carry something the person triggering it could not read
 * themselves.
 */
async function sendInvitationEmail(scope: Awaited<ReturnType<typeof activeOrganization>>, email: string) {
  if ("error" in scope || !emailEnabled()) return { sent: false };

  const { data: profile } = await scope.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", scope.userId)
    .maybeSingle();

  // emailEnabled() has already established this is set; the trailing slash is the only thing left
  // to normalise, so the link does not come out with a double slash in it.
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const locale = await getLocale();

  return sendEmail(
    email,
    invitationMessage({
      organizationName: scope.organizationName,
      invitedByName: (profile as { full_name: string | null } | null)?.full_name ?? null,
      signInUrl: `${origin}/register`,
      locale,
    }),
    // No address and no organization name in the log line; only which organization by id.
    { organizationId: scope.organizationId, purpose: "member_invitation" },
  );
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
  if (!await withinRateLimit("member.role_change")) return { error: rateLimitMessage("member.role_change") };
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

/**
 * Replaces a member's mine-site restriction.
 *
 * An empty selection means every site, not no sites. That reading is deliberate and matches the
 * database: a member with no restriction rows reaches everywhere, which is what every member did
 * before this existed. The alternative — empty meaning nothing — would let one careless save lock
 * somebody out of the whole company.
 */
export async function changeMemberSites(_: MemberState, formData: FormData): Promise<MemberState> {
  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) return { error: "Check the member and try again." };
  const siteIds = formData.getAll("siteIds").filter((value): value is string => typeof value === "string" && value !== "");

  const scope = await activeOrganization();
  if ("error" in scope) return scope;
  if (!await withinRateLimit("member.role_change")) return { error: rateLimitMessage("member.role_change") };

  const { error } = await scope.supabase.rpc("set_member_sites", {
    requested_organization_id: scope.organizationId,
    requested_user_id: userId,
    requested_site_ids: siteIds,
  });
  if (error) return { error: rpcMessage(error, "Unable to change the site access. Please try again.") };
  revalidatePath("/settings/users");
  return {
    success: siteIds.length === 0
      ? "This person can now reach every mine site."
      : `Restricted to ${siteIds.length} mine site${siteIds.length === 1 ? "" : "s"}.`,
  };
}
