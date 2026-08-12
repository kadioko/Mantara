import { t } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/locale";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GrantAdminForm, RevokeAdminForm } from "@/features/platform/platform-forms";

export const metadata = { title: "Administrators" };

type PlatformAdmin = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  granted_at: string;
  granted_by_name: string | null;
};

export default async function AdministratorsPage() {
  const locale = await getLocale();
  const { supabase, user } = await requirePlatformAdmin();
  const { data } = await supabase.rpc("platform_admin_list");
  const admins = (data ?? []) as PlatformAdmin[];

  return (
    <>
      <PageHeader
        eyebrow={t(locale, "uiPlatform")}
        title={t(locale, "uiAdministrators")}
        description={t(locale, "uiPeopleWhoCanAdministerMantaraItself")}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "uiGrantPlatformAccess")}</CardTitle>
          <CardDescription>{t(locale, "uiThePersonMustAlreadyHaveAMantaraAccount")}</CardDescription>
        </CardHeader>
        <CardContent><GrantAdminForm /></CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t(locale, "uiAdministrator")}</TableHead>
              <TableHead>{t(locale, "uiGranted")}</TableHead>
              <TableHead>By</TableHead>
              <TableHead className="text-right">{t(locale, "auditAction")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((admin) => (
              <TableRow key={admin.user_id}>
                <TableCell>
                  <p className="font-medium">
                    {admin.full_name || admin.email || "Unknown user"}
                    {admin.user_id === user.id && <Badge variant="secondary" className="ml-2">You</Badge>}
                  </p>
                  {admin.email && <p className="text-xs text-muted-foreground">{admin.email}</p>}
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(admin.granted_at).toISOString().slice(0, 10)}</TableCell>
                <TableCell className="text-muted-foreground">{admin.granted_by_name || "Bootstrapped"}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <RevokeAdminForm userId={admin.user_id} isSelf={admin.user_id === user.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Alert variant="warning">
        The last remaining administrator cannot be revoked. There is no self-service way back in, so restoring access
        would need a direct database change.
      </Alert>
    </>
  );
}
