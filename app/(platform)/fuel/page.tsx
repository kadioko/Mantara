import { redirect } from "next/navigation";
import { Panel } from "@/components/ui/card";
import { CatalogueList } from "@/components/ui/catalogue";
import { TankRow, type CatalogueTank } from "@/features/fuel/catalogue-forms";
import { hasPermission } from "@/lib/auth/permissions";
import { figure, fuelTotals } from "@/lib/totals";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import {
  FuelAdjustmentForm,
  FuelIssueForm,
  FuelLocationForm,
  FuelReceiptForm,
  FuelStockTakeForm,
  type Option,
} from "@/features/fuel/fuel-forms";

type StockTakeRow = {
  id: string;
  measured_litres: string;
  book_litres: string;
  variance_litres: string;
  taken_on: string;
  notes: string | null;
  location: { name: string } | { name: string }[] | null;
};

type ConsumptionRow = {
  equipment_id: string;
  equipment_name: string;
  meter_type: string;
  issues: string;
  litres_used: string;
  meter_travelled: string;
  litres_per_unit: string;
};

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
    .select("id, name, fuel_type, capacity_litres, current_balance_litres, notes, is_active")
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
  const [receipts, issues, adjustments, stockTakes, equipment, workers] = await Promise.all([
    workspace.supabase.from("fuel_receipts").select("id, litres, supplier, received_on, location:fuel_storage_locations(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("received_on", { ascending: false }).limit(10),
    workspace.supabase.from("fuel_issues").select("id, litres, issued_on, equipment:equipment!fuel_issues_equipment_id_fkey(name), worker:workers!fuel_issues_worker_id_fkey(full_name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("issued_on", { ascending: false }).limit(10),
    workspace.supabase.from("fuel_adjustments").select("id, litres_delta, reason, adjusted_on").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("adjusted_on", { ascending: false }).limit(10),
    workspace.supabase.from("fuel_stock_takes").select("id, measured_litres, book_litres, variance_litres, taken_on, notes, location:fuel_storage_locations(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("taken_on", { ascending: false }).limit(12),
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
  const totals = await fuelTotals(workspace.supabase, site.id);
  // Consumption per machine over the last quarter, from the meter readings already on each issue.
  // A machine that has drifted upwards is either developing a fault or not receiving all it is given.
  // The 90-day window is the function's own default, so the period comes from the database's clock
  // rather than this server's.
  const { data: consumptionRows } = await workspace.supabase.rpc("equipment_fuel_consumption", {
    requested_site_id: site.id,
  });
  const consumption = (consumptionRows ?? []) as ConsumptionRow[];
  const takes = (stockTakes.data ?? []) as StockTakeRow[];
  const locale = await getLocale();

  return <div className="space-y-6">
    <div>
      <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "controls")}</p>
      <h1 className="mt-2 text-3xl font-bold">{t(locale, "fuel")}</h1>
      <p className="mt-2 text-muted-foreground">{t(locale, "fuelDescription", { site: site.name })}</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "fuelOnHand")}</p><p className="mt-1 text-2xl font-bold">{figure(totals?.litresOnHand)} L</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "activeStores")}</p><p className="mt-1 text-2xl font-bold">{figure(totals?.activeStores)}</p></div>
    </div>

    <CatalogueList title={t(locale, "fuelStores")} description={t(locale, "pBalancesMaintained")}>
      {canManage && <div className="px-5 py-4"><FuelLocationForm /></div>}
      {locations?.length
        ? (locations as CatalogueTank[]).map((tank) => <TankRow key={tank.id} tank={tank} canManage={canManage} />)
        : <p className="px-5 py-6 text-sm text-muted-foreground">{t(locale, "noFuelStores")}</p>}
    </CatalogueList>

    {canAdjust && locationOptions.length > 0 && <Panel
      title={t(locale, "pFuelReconciliation")}
      description={t(locale, "pRecordTankHolds")}>
      <FuelStockTakeForm locations={locationOptions} today={today} />
      {takes.length > 0 && <ul className="mt-6 divide-y divide-border border-t border-border">
        {takes.map((take) => {
          const variance = Number(take.variance_litres);
          const location = Array.isArray(take.location) ? take.location[0] : take.location;
          return <li key={take.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="text-sm">
              <span className="font-medium">{location?.name ?? "Unknown store"}</span>
              <span className="ml-2 text-muted-foreground">
                {take.taken_on} · measured {Number(take.measured_litres).toLocaleString()} L against {Number(take.book_litres).toLocaleString()} L
              </span>
            </span>
            <span className={`text-sm font-semibold ${variance < 0 ? "text-destructive" : variance > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
              {variance === 0 ? "Matched" : `${variance > 0 ? "+" : ""}${variance.toLocaleString()} L`}
            </span>
          </li>;
        })}
      </ul>}
    </Panel>}

    {consumption.length > 0 && <Panel
      title={t(locale, "pConsumptionPerMachine")}
      description={t(locale, "pLitresPerUnit")}>
      <ul className="divide-y divide-border">
        {consumption.map((row) => (
          <li key={row.equipment_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="text-sm">
              <span className="font-medium">{row.equipment_name}</span>
              <span className="ml-2 text-muted-foreground">
                {Number(row.litres_used).toLocaleString()} L over {Number(row.meter_travelled).toLocaleString()} {row.meter_type === "kilometres" ? "km" : "h"}
              </span>
            </span>
            <span className="text-sm font-semibold">
              {Number(row.litres_per_unit).toLocaleString(undefined, { maximumFractionDigits: 2 })} L/{row.meter_type === "kilometres" ? "km" : "h"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>}

    {locationOptions.length === 0
      ? <p className="rounded-xl border border-dashed border-input bg-card p-6 text-sm text-muted-foreground">Create an active fuel store before recording deliveries or issues.</p>
      : <>
          {canReceive && <Panel title={t(locale, "pRecordDelivery")} description={t(locale, "pAddsFuel")}><FuelReceiptForm locations={locationOptions} today={today} /></Panel>}
          {canIssue && <Panel title={t(locale, "pIssueFuel")} description={t(locale, "pIssueBelowZero")}><FuelIssueForm locations={locationOptions} equipment={equipmentOptions} workers={workerOptions} today={today} /></Panel>}
          {canAdjust && <Panel title={t(locale, "pAdjustStock")} description={t(locale, "pNegativeForLosses")}><FuelAdjustmentForm locations={locationOptions} today={today} /></Panel>}
        </>}

    <Panel title={t(locale, "pRecentMovements")}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Deliveries</h2>
          {receipts.data?.length
            ? <ul className="mt-2 space-y-2">{receipts.data.map((row) => {
                const location = Array.isArray(row.location) ? row.location[0] : row.location;
                return <li key={row.id} className="text-sm"><span className="font-medium">+{Number(row.litres).toLocaleString()} L</span> <span className="text-muted-foreground">{row.received_on}{location?.name ? ` · ${location.name}` : ""}{row.supplier ? ` · ${row.supplier}` : ""}</span></li>;
              })}</ul>
            : <p className="mt-2 text-sm text-muted-foreground">{t(locale,"noneRecorded")}</p>}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Issues</h2>
          {issues.data?.length
            ? <ul className="mt-2 space-y-2">{issues.data.map((row) => {
                const equipmentRow = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
                const workerRow = Array.isArray(row.worker) ? row.worker[0] : row.worker;
                return <li key={row.id} className="text-sm"><span className="font-medium">−{Number(row.litres).toLocaleString()} L</span> <span className="text-muted-foreground">{row.issued_on}{equipmentRow?.name ? ` · ${equipmentRow.name}` : ""}{workerRow?.full_name ? ` · ${workerRow.full_name}` : ""}</span></li>;
              })}</ul>
            : <p className="mt-2 text-sm text-muted-foreground">{t(locale,"noneRecorded")}</p>}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Adjustments</h2>
          {adjustments.data?.length
            ? <ul className="mt-2 space-y-2">{adjustments.data.map((row) => <li key={row.id} className="text-sm"><span className="font-medium">{Number(row.litres_delta) > 0 ? "+" : "−"}{Math.abs(Number(row.litres_delta)).toLocaleString()} L</span> <span className="text-muted-foreground">{row.adjusted_on} · {row.reason}</span></li>)}</ul>
            : <p className="mt-2 text-sm text-muted-foreground">{t(locale,"noneRecorded")}</p>}
        </div>
      </div>
    </Panel>
  </div>;
}
