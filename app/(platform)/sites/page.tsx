import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { CreateSiteForm, EditSiteForm, type SiteDetails } from "@/features/sites/site-forms";
import { siteStatusLabels } from "@/features/sites/schemas";

export const metadata = { title: "Mine sites" };

export default async function SitesPage() {
  const workspace = await getActiveWorkspace();
  const locale = await getLocale();
  const organization = workspace.activeOrganization;
  if (!organization || !await hasPermission(organization.id, "site.read")) redirect("/dashboard");

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission(organization.id, "site.create"),
    hasPermission(organization.id, "site.update"),
  ]);

  // Unlike the switcher, this lists sites in every status so one taken out of service can be brought back.
  const { data: sites, error } = await workspace.supabase
    .from("mine_sites")
    .select("id, name, country_code, region, district, latitude, longitude, status")
    .eq("organization_id", organization.id)
    .is("deleted_at", null)
    .order("status")
    .order("name");
  if (error) throw new Error("Unable to load mine sites.");

  const rows = (sites ?? []) as SiteDetails[];
  const activeCount = rows.filter((site) => site.status === "active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Core workspace"
        title={t(locale, "pMineSites")}
        description={`Every site belonging to ${organization.name}.`}
        actions={canCreate ? <CreateSiteForm defaultCountry={rows[0]?.country_code ?? "TZ"} /> : undefined}
      />

      {rows.length ? (
        <div className="space-y-4">
          {rows.map((site) => {
            const isActiveSite = site.id === workspace.activeSite?.id;
            const place = [site.district, site.region].filter(Boolean).join(", ");
            return (
              <Card key={site.id}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {site.name}
                        {isActiveSite && <Badge variant="secondary" className="ml-2">Your active site</Badge>}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {place || "No region recorded"} · {site.country_code}
                        {site.latitude !== null && site.longitude !== null ? ` · ${site.latitude}, ${site.longitude}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={site.status === "active" ? "success" : site.status === "closed" ? "destructive" : "secondary"}>
                        {siteStatusLabels[site.status as keyof typeof siteStatusLabels] ?? site.status}
                      </Badge>
                      {canUpdate && <EditSiteForm site={site} isActiveSite={isActiveSite} />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={<MapPin className="size-6" aria-hidden />}
              title="No mine sites"
              description={t(locale, "pEverySiteNeeded")}
            />
          </CardContent>
        </Card>
      )}

      {activeCount === 1 && (
        <Alert variant="info">
          Only one site is active. An organization must always keep at least one, so this one cannot be taken out of
          service until another is added — the database refuses it, not just this screen.
        </Alert>
      )}
    </div>
  );
}
