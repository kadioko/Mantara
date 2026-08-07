import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  InviteMemberForm,
  MemberRoleForm,
  MemberStatusForm,
  RevokeInvitationForm,
  roleLabels,
} from "@/features/members/member-forms";

type Member = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role_code: string;
  role_name: string;
  status: string;
  joined_at: string | null;
};

export default async function UsersPage() {
  const [workspace, locale] = await Promise.all([getActiveWorkspace(), getLocale()]);
  const organization = workspace.activeOrganization;
  if (!organization || !await hasPermission(organization.id, "member.read")) redirect("/dashboard");

  const [canInvite, canManageRoles] = await Promise.all([
    hasPermission(organization.id, "member.invite"),
    hasPermission(organization.id, "member.update_role"),
  ]);

  const [membersResult, invitationsResult] = await Promise.all([
    workspace.supabase.rpc("organization_members", { requested_organization_id: organization.id }),
    workspace.supabase
      .from("organization_invitations")
      .select("id, email, created_at, expires_at, role:roles(code, name)")
      .eq("organization_id", organization.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const members = (membersResult.data ?? []) as Member[];
  const invitations = invitationsResult.data ?? [];
  const now = new Date().toISOString();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t(locale, "settings")}
        title="People"
        description={`Everyone with access to ${organization.name}, and what they can do.`}
      />

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
            <CardDescription>
              They join the moment they next sign in with this address. If they have no account yet, they can register
              with it first.
            </CardDescription>
          </CardHeader>
          <CardContent><InviteMemberForm /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Members</CardTitle></CardHeader>
        {members.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.user_id === workspace.user.id;
                return (
                  <TableRow key={member.user_id}>
                    <TableCell>
                      <p className="font-medium">
                        {member.full_name || member.email || "Unknown"}
                        {isSelf && <Badge variant="secondary" className="ml-2">You</Badge>}
                      </p>
                      {member.email && <p className="text-xs text-muted-foreground">{member.email}</p>}
                    </TableCell>
                    <TableCell>
                      {canManageRoles
                        ? <MemberRoleForm userId={member.user_id} roleCode={member.role_code} isSelf={isSelf} />
                        : <span className="text-sm text-muted-foreground">{roleLabels[member.role_code] ?? member.role_name}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.status === "active" ? "success" : member.status === "suspended" ? "destructive" : "secondary"}>
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canManageRoles && <MemberStatusForm userId={member.user_id} status={member.status} isSelf={isSelf} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <CardContent><EmptyState icon={<Users className="size-6" aria-hidden />} title="No members yet" /></CardContent>
        )}
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>These expire automatically if they are not accepted.</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => {
                const role = Array.isArray(invitation.role) ? invitation.role[0] : invitation.role;
                const expired = invitation.expires_at < now;
                return (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    <TableCell className="text-muted-foreground">{roleLabels[role?.code ?? ""] ?? role?.name ?? "—"}</TableCell>
                    <TableCell className={expired ? "font-semibold text-destructive" : "text-muted-foreground"}>
                      {new Date(invitation.expires_at).toISOString().slice(0, 10)}{expired ? " · expired" : ""}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canInvite && <RevokeInvitationForm invitationId={invitation.id} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Alert variant="info">
        An organization must always keep at least one active owner, and nobody can change their own role or suspend
        their own access. Those rules are enforced by the database, not just this screen.
      </Alert>
    </div>
  );
}
