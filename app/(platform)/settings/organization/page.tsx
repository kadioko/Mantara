import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { OrganizationForm } from "@/features/sites/site-forms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  const [workspace, locale] = await Promise.all([getActiveWorkspace(), getLocale()]);
  const organization = workspace.activeOrganization;
  if (!organization || !await hasPermission(organization.id, "organization.read")) redirect("/dashboard");

  const canUpdate = await hasPermission(organization.id, "organization.update");

  const [{ data: details }, { count: siteCount }, { count: memberCount }] = await Promise.all([
    workspace.supabase.from("organizations").select("name, country_code, created_at").eq("id", organization.id).maybeSingle(),
    workspace.supabase.from("mine_sites").select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id).eq("status", "active").is("deleted_at", null),
    workspace.supabase.from("organization_memberships").select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id).eq("status", "active"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t(locale, "settings")}
        title={t(locale,"organization")}
        description={t(locale, "pTheCompany")}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent><p className="text-sm text-muted-foreground">{t(locale, "uiActiveMineSites")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{siteCount ?? 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-muted-foreground">{t(locale, "uiActiveMembers")}</p><p className="mt-1 text-2xl font-bold tabular-nums">{memberCount ?? 0}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-muted-foreground">{t(locale, "uiOnMantaraSince")}</p><p className="mt-1 text-2xl font-bold">{details?.created_at ? new Date(details.created_at).toISOString().slice(0, 10) : "—"}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale,"pDetails")}</CardTitle>
          <CardDescription>{t(locale, "uiTheNameShownThroughoutTheWorkspaceAndOnExports")}</CardDescription>
        </CardHeader>
        <CardContent>
          {canUpdate ? (
            <OrganizationForm name={details?.name ?? organization.name} countryCode={details?.country_code ?? "TZ"} />
          ) : (
            <div className="space-y-1">
              <p className="font-medium">{details?.name ?? organization.name}</p>
              <p className="text-sm text-muted-foreground">{details?.country_code ?? "—"}</p>
              <p className="pt-2 text-sm text-muted-foreground">{t(locale, "uiChangingTheseNeedsTheOrganizationManagementPermission")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/*
        The commercial answer to "can we get our data out?", which a mining company asks before it
        puts a year of production into this. Kept on the organization screen rather than buried in
        reports, because it is a statement about ownership rather than a reporting feature.

        A plain link, not a form: the route answers with a file, and a server action cannot stream a
        download. `download` is deliberate — without it a browser would render the JSON in a tab.
      */}
      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "pYourData")}</CardTitle>
          <CardDescription>{t(locale, "pYourDataDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <a
            href="/settings/organization/export"
            download
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            <Download aria-hidden />
            {t(locale, "downloadYourData")}
          </a>
          <p className="text-sm text-muted-foreground">{t(locale, "pYourDataScope")}</p>
          <p className="text-sm text-muted-foreground">{t(locale, "pYourDataAudited")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "uiElsewhere")}</CardTitle>
          <CardDescription>{t(locale, "uiSitesAndPeopleAreManagedOnTheirOwnScreens")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/sites" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>{t(locale,"mineSites")}</Link>
          <Link href="/settings/users" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>{t(locale,"people")}</Link>
          <Link href="/settings/audit-logs" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>{t(locale,"auditLog")}</Link>
        </CardContent>
      </Card>

      <Alert variant="info">
        Custom roles are not configurable yet. Each organization uses the standard role set, and the permissions behind
        each role are seeded from one place so every organization is granted the same way.
      </Alert>
    </div>
  );
}
