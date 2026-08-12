import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { RolePermissionsForm, type PermissionOption } from "@/features/roles/role-forms";
import { roleLabels } from "@/features/members/member-forms";

export const metadata = { title: "Roles" };

type OrganizationRole = {
  role_code: string;
  role_name: string;
  is_system: boolean;
  member_count: number;
  permission_codes: string[];
};

export default async function RolesPage() {
  const [workspace, locale] = await Promise.all([getActiveWorkspace(), getLocale()]);
  const organization = workspace.activeOrganization;
  if (!organization || !await hasPermission(organization.id, "role.read")) redirect("/dashboard");

  const canManage = await hasPermission(organization.id, "role.manage");
  const [rolesResult, permissionsResult] = await Promise.all([
    workspace.supabase.rpc("organization_roles", { requested_organization_id: organization.id }),
    workspace.supabase.from("permissions").select("code, name, description").order("code"),
  ]);

  const roles = (rolesResult.data ?? []) as OrganizationRole[];
  const permissions = (permissionsResult.data ?? []) as PermissionOption[];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t(locale, "settings")}
        title={t(locale, "pRoles")}
        description={`What each role in ${organization.name} is allowed to do.`}
      />

      <Alert variant="info">
        A permission applies across the whole organization, at every mine site. Changes take effect on
        a member&rsquo;s next request — they do not need to sign in again.
      </Alert>

      {roles.map((role) => {
        const isOwner = role.role_code === "company_owner";
        return (
          <Card key={role.role_code}>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {roleLabels[role.role_code] ?? role.role_name}
                    {role.is_system && <Badge variant="secondary" className="ml-2">{t(locale, "uiStandard")}</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {role.member_count} member{role.member_count === 1 ? "" : "s"} ·{" "}
                    {isOwner ? "every permission" : `${role.permission_codes.length} permission${role.permission_codes.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                {canManage && !isOwner && (
                  <RolePermissionsForm
                    roleCode={role.role_code}
                    roleName={roleLabels[role.role_code] ?? role.role_name}
                    granted={role.permission_codes}
                    permissions={permissions}
                  />
                )}
              </div>

              {isOwner ? (
                <p className="text-sm text-muted-foreground">
                  The owner always holds every permission, including ones added by a future update. It is the
                  organization&rsquo;s way back in, so it cannot be narrowed.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {role.permission_codes.length ? (
                    role.permission_codes.map((code) => <Badge key={code} variant="outline">{code}</Badge>)
                  ) : (
                    <p className="text-sm text-muted-foreground">{t(locale, "uiNoPermissionsGrantedThisRoleCanSignInButSee")}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
