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
  const { supabase, user } = await requirePlatformAdmin();
  const { data } = await supabase.rpc("platform_admin_list");
  const admins = (data ?? []) as PlatformAdmin[];

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Administrators"
        description="People who can administer Mantara itself."
      />

      <Card>
        <CardHeader>
          <CardTitle>Grant platform access</CardTitle>
          <CardDescription>The person must already have a Mantara account.</CardDescription>
        </CardHeader>
        <CardContent><GrantAdminForm /></CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Administrator</TableHead>
              <TableHead>Granted</TableHead>
              <TableHead>By</TableHead>
              <TableHead className="text-right">Action</TableHead>
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
