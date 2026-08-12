import { t } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/locale";
import { Building2 } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SuspendOrganizationForm } from "@/features/platform/platform-forms";

export const metadata = { title: "Organizations" };

type PlatformOrganization = {
  id: string;
  name: string;
  country_code: string;
  created_at: string;
  suspended_at: string | null;
  suspension_reason: string | null;
  member_count: number;
  site_count: number;
};

export default async function AdminOrganizationsPage() {
  const locale = await getLocale();
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase.rpc("platform_organizations");
  const organizations = (data ?? []) as PlatformOrganization[];

  return (
    <>
      <PageHeader
        eyebrow={t(locale, "uiPlatform")}
        title={t(locale, "uiOrganizations")}
        description={t(locale, "uiMetadataAndCountsForEveryTenantOperationalRecordsAreNot")}
      />

      <Card>
        {organizations.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "organization")}</TableHead>
                <TableHead>{t(locale, "uiMembers")}</TableHead>
                <TableHead>{t(locale, "uiSites")}</TableHead>
                <TableHead>{t(locale, "uiJoined")}</TableHead>
                <TableHead>{t(locale, "attendanceStatus")}</TableHead>
                <TableHead className="text-right">{t(locale, "auditAction")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => {
                const suspended = Boolean(organization.suspended_at);
                return (
                  <TableRow key={organization.id}>
                    <TableCell>
                      <p className="font-medium">{organization.name}</p>
                      <p className="text-xs text-muted-foreground">{organization.country_code}</p>
                    </TableCell>
                    <TableCell className="tabular-nums">{organization.member_count}</TableCell>
                    <TableCell className="tabular-nums">{organization.site_count}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(organization.created_at).toISOString().slice(0, 10)}</TableCell>
                    <TableCell>
                      {suspended ? (
                        <div>
                          <Badge variant="destructive">{t(locale, "uiSuspended")}</Badge>
                          {organization.suspension_reason && (
                            <p className="mt-1 max-w-56 text-xs text-muted-foreground">{organization.suspension_reason}</p>
                          )}
                        </div>
                      ) : (
                        <Badge variant="success">{t(locale, "uiActive")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <SuspendOrganizationForm
                          organizationId={organization.id}
                          organizationName={organization.name}
                          suspended={suspended}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={<Building2 className="size-6" aria-hidden />}
              title={t(locale, "uiNoOrganizationsYet")}
              description={t(locale, "uiOrganizationsAppearHereOnceACustomerCompletesOnboarding")}
            />
          </div>
        )}
      </Card>

      <p className="text-sm text-muted-foreground">
        Suspending an organization makes it read-only: its people keep access to their existing records, but no new
        production, fuel, stock, or expense entries can be written until it is restored.
      </p>
    </>
  );
}
