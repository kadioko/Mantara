import { redirect } from "next/navigation";
import { Panel } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import {
  FuelAdjustmentForm,
  FuelIssueForm,
  FuelLocationForm,
  FuelReceiptForm,
  type Option,
} from "@/features/fuel/fuel-forms";
import { fuelTypeLabels } from "@/features/fuel/schemas";

export const metadata = { title: "Fuel" };

export default async function FuelPage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "fuel.read")) redirect("/dashboard");

  const [canManage, canReceive, canIssue, canAdjust] = await Promise.all([
    hasPermission(organization.id, "fuel.manage"),
    hasPermission(organization.id, "fuel.receive"),
    hasPermission(organization.id, "fuel.issue"),
    hasPermission(organization.id, "fuel.adjust"),
  ]);

  const { data: locations, error } = await workspace.supabase
    .from("fuel_storage_locations")
    .select("id, name, fuel_type, capacity_litres, current_balance_litres, is_active")
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .order("name");
  if (error) throw new Error("Unable to load fuel stores.");

  const activeLocations = (locations ?? []).filter((location) => location.is_active);
  const locationOptions: Option[] = activeLocations.map((location) => ({
    id: location.id,
    label: `${location.name} (${Number(location.current_balance_litres).toLocaleString()} L)`,
  }));

  const needsMovementData = locationOptions.length > 0;
  const [receipts, issues, adjustments, equipment, workers] = await Promise.all([
    workspace.supabase.from("fuel_receipts").select("id, litres, supplier, received_on, location:fuel_storage_locations(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("received_on", { ascending: false }).limit(10),
    workspace.supabase.from("fuel_issues").select("id, litres, issued_on, equipment:equipment(name), worker:workers(full_name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("issued_on", { ascending: false }).limit(10),
    workspace.supabase.from("fuel_adjustments").select("id, litres_delta, reason, adjusted_on").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("adjusted_on", { ascending: false }).limit(10),
    needsMovementData && canIssue
      ? workspace.supabase.from("equipment").select("id, name").eq("organization_id", organization.id).eq("mine_site_id", site.id).is("deleted_at", null).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    needsMovementData && canIssue
      ? workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const equipmentOptions: Option[] = (equipment.data ?? []).map((item) => ({ id: item.id, label: item.name }));
  const workerOptions: Option[] = (workers.data ?? []).map((worker) => ({ id: worker.id, label: worker.full_name }));
  const totalLitres = activeLocations.reduce((sum, location) => sum + Number(location.current_balance_litres), 0);
  const locale = await getLocale();

  return <div className="space-y-6">
    <div>
      <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "controls")}</p>
      <h1 className="mt-2 text-3xl font-bold">{t(locale, "fuel")}</h1>
      <p className="mt-2 text-muted-foreground">{t(locale, "fuelDescription", { site: site.name })}</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "fuelOnHand")}</p><p className="mt-1 text-2xl font-bold">{totalLitres.toLocaleString()} L</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "activeStores")}</p><p className="mt-1 text-2xl font-bold">{activeLocations.length}</p></div>
    </div>

    <Panel title={t(locale, "fuelStores")} description="Balances are maintained by the database on every movement.">
      {canManage && <div className="mb-5 border-b border-border pb-5"><FuelLocationForm /></div>}
      {locations?.length
        ? <ul className="divide-y divide-border">{locations.map((location) => <li key={location.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="font-medium">{location.name}<span className="ml-2 text-sm font-normal text-muted-foreground">{fuelTypeLabels[location.fuel_type as keyof typeof fuelTypeLabels] ?? location.fuel_type}{location.is_active ? "" : " · inactive"}</span></span>
            <span className="text-sm text-muted-foreground">{Number(location.current_balance_litres).toLocaleString()} L{location.capacity_litres ? ` of ${Number(location.capacity_litres).toLocaleString()} L` : ""}</span>
          </li>)}</ul>
        : <p className="text-sm text-muted-foreground">{t(locale, "noFuelStores")}</p>}
    </Panel>

    {locationOptions.length === 0
      ? <p className="rounded-xl border border-dashed border-input bg-card p-6 text-sm text-muted-foreground">Create an active fuel store before recording deliveries or issues.</p>
      : <>
          {canReceive && <Panel title="Record a delivery" description="Adds fuel to the selected store."><FuelReceiptForm locations={locationOptions} today={today} /></Panel>}
          {canIssue && <Panel title="Issue fuel" description="An issue that would take a store below zero is rejected."><FuelIssueForm locations={locationOptions} equipment={equipmentOptions} workers={workerOptions} today={today} /></Panel>}
          {canAdjust && <Panel title="Adjust stock" description="Use a negative value for losses and a positive value for gains."><FuelAdjustmentForm locations={locationOptions} today={today} /></Panel>}
        </>}

    <Panel title="Recent movements">
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">Deliveries</h3>
          {receipts.data?.length
            ? <ul className="mt-2 space-y-2">{receipts.data.map((row) => {
                const location = Array.isArray(row.location) ? row.location[0] : row.location;
                return <li key={row.id} className="text-sm"><span className="font-medium">+{Number(row.litres).toLocaleString()} L</span> <span className="text-muted-foreground">{row.received_on}{location?.name ? ` · ${location.name}` : ""}{row.supplier ? ` · ${row.supplier}` : ""}</span></li>;
              })}</ul>
            : <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">Issues</h3>
          {issues.data?.length
            ? <ul className="mt-2 space-y-2">{issues.data.map((row) => {
                const equipmentRow = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
                const workerRow = Array.isArray(row.worker) ? row.worker[0] : row.worker;
                return <li key={row.id} className="text-sm"><span className="font-medium">−{Number(row.litres).toLocaleString()} L</span> <span className="text-muted-foreground">{row.issued_on}{equipmentRow?.name ? ` · ${equipmentRow.name}` : ""}{workerRow?.full_name ? ` · ${workerRow.full_name}` : ""}</span></li>;
              })}</ul>
            : <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">Adjustments</h3>
          {adjustments.data?.length
            ? <ul className="mt-2 space-y-2">{adjustments.data.map((row) => <li key={row.id} className="text-sm"><span className="font-medium">{Number(row.litres_delta) > 0 ? "+" : "−"}{Math.abs(Number(row.litres_delta)).toLocaleString()} L</span> <span className="text-muted-foreground">{row.adjusted_on} · {row.reason}</span></li>)}</ul>
            : <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>}
        </div>
      </div>
    </Panel>
  </div>;
}
