import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { figure, productionTotals } from "@/lib/totals";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { pageInfo, readPaging, type PageParams } from "@/lib/paging";
import { Pagination } from "@/components/ui/pagination";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { DowntimeForm, OreDispatchForm, OreLotForm, ProductionEntryForm } from "@/features/production/production-forms";
import { productionStatusLabels } from "@/features/production/schemas";

export const metadata = { title: "Production" };

const statusTone: Record<string, string> = {
  draft: "bg-muted text-foreground",
  submitted: "bg-warning/15 text-warning-foreground",
  approved: "bg-success/12 text-primary",
  rejected: "bg-destructive/12 text-destructive",
};

export default async function ProductionPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "production.read")) redirect("/dashboard");

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission(organization.id, "production.create"),
    hasPermission(organization.id, "production.update"),
  ]);
  const paging = readPaging(await searchParams);
  const [entriesResult, shiftsResult, downtimeResult, equipmentResult, oreLotsResult, dispatchesResult] = await Promise.all([
    workspace.supabase.from("production_entries").select("id, entry_date, material, quantity, unit, grade, status, location", { count: "exact" }).eq("organization_id", organization.id).eq("mine_site_id", site.id).order("entry_date", { ascending: false }).range(paging.from, paging.to),
    workspace.supabase.from("shifts").select("id, name, shift_date").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("shift_date", { ascending: false }).limit(30),
    workspace.supabase.from("downtime_records").select("id, reason, minutes, created_at, equipment:equipment!downtime_records_equipment_id_fkey(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("created_at", { ascending: false }).limit(15),
    canCreate
      ? workspace.supabase.from("equipment").select("id, name").eq("organization_id", organization.id).eq("mine_site_id", site.id).is("deleted_at", null).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    workspace.supabase.from("ore_lots").select("id, lot_number, produced_on, source_location, ore_tonnes, grade_ppm, bag_count, bagged_weight_kg, status").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("produced_on", { ascending: false }).limit(50),
    workspace.supabase.from("ore_dispatches").select("id, processing_plant, dispatched_on, dispatched_tonnes, dispatched_bags, status, lot:ore_lots!ore_dispatches_ore_lot_id_fkey(lot_number, grade_ppm)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("dispatched_on", { ascending: false }).limit(30),
  ]);
  if (entriesResult.error || oreLotsResult.error || dispatchesResult.error) throw new Error("Unable to load production records.");

  const entries = entriesResult.data ?? [];
  const entriesInfo = pageInfo(paging, entriesResult.count ?? 0);
  const shiftOptions = (shiftsResult.data ?? []).map((shift) => ({ id: shift.id, label: `${shift.shift_date} · ${shift.name}` }));
  const equipmentOptions = (equipmentResult.data ?? []).map((item) => ({ id: item.id, label: item.name }));
  // Every figure below is computed in the database. The approved total used to fetch each approved
  // row and sum in JavaScript, which stopped silently at 1000 rows; the ore figures were derived
  // from the last 50 lots and presented as the whole site.
  const totals = await productionTotals(workspace.supabase, site.id);
  const oreLots = oreLotsResult.data ?? [];
  const dispatches = dispatchesResult.data ?? [];
  const dispatchableLotOptions = oreLots.filter((lot) => lot.status !== "dispatched").map((lot) => ({ id: lot.id, label: `${lot.lot_number} · ${Number(lot.ore_tonnes).toLocaleString()} t · ${Number(lot.grade_ppm).toLocaleString()} PPM · ${lot.bag_count} bags` }));
  const locale = await getLocale();

  return <section>
    <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "operations")}</p>
    <h1 className="mt-2 text-3xl font-bold">{t(locale, "production")}</h1>
    <p className="mt-2 text-muted-foreground">{t(locale, "productionDescription", { site: site.name })}</p>

    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Approved quantity</p><p className="mt-1 text-2xl font-bold">{figure(totals?.approvedQuantity)}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Awaiting approval</p><p className="mt-1 text-2xl font-bold">{figure(totals?.submittedCount)}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Entries recorded</p><p className="mt-1 text-2xl font-bold">{entriesInfo.total}</p></div>
    </div>

    {canCreate && <div className="mt-8"><ProductionEntryForm shifts={shiftOptions} today={new Date().toISOString().slice(0, 10)} /></div>}

    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Ore, bagging & processing</h2><p className="mt-1 text-sm text-muted-foreground">Follow ore from mined tonnes and assay grade through bagging and dispatch to the processing plant.</p></div><p className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent-foreground">1 PPM ≈ 1 g/t for gold</p></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-background p-4"><p className="text-sm text-muted-foreground">Ready / in transit</p><p className="mt-1 text-2xl font-bold">{figure(totals?.oreReadyTonnes)} t</p></div>
        <div className="rounded-lg border border-border bg-background p-4"><p className="text-sm text-muted-foreground">Weighted grade</p><p className="mt-1 text-2xl font-bold">{figure(totals?.oreWeightedGradePpm, { maximumFractionDigits: 4 })} PPM</p></div>
        <div className="rounded-lg border border-border bg-background p-4"><p className="text-sm text-muted-foreground">Lots recorded</p><p className="mt-1 text-2xl font-bold">{oreLots.length}</p></div>
      </div>
      {canCreate && <div className="mt-5"><OreLotForm shifts={shiftOptions} today={new Date().toISOString().slice(0, 10)} /></div>}
      {canUpdate && <div className="mt-5"><OreDispatchForm lots={dispatchableLotOptions} today={new Date().toISOString().slice(0, 10)} /></div>}
    </section>

    <section className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">Bagged ore lots</h2><p className="text-sm text-muted-foreground">Lot-level tonnes, PPM, and bag counts.</p></div>
      {oreLots.length ? <div className="divide-y divide-border">{oreLots.map((lot) => <article key={lot.id} className="grid gap-2 p-5 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
        <div><p className="font-semibold">{lot.lot_number}</p><p className="text-sm text-muted-foreground">{lot.produced_on}{lot.source_location ? ` · ${lot.source_location}` : ""}</p></div>
        <p className="text-sm text-muted-foreground">{Number(lot.ore_tonnes).toLocaleString()} t · {Number(lot.grade_ppm).toLocaleString()} PPM</p>
        <p className="text-sm text-muted-foreground">{lot.bag_count.toLocaleString()} bags · {Number(lot.bagged_weight_kg).toLocaleString()} kg</p>
        <span className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ${lot.status === "dispatched" ? "bg-success/12 text-primary" : lot.status === "in_transit" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-foreground"}`}>{lot.status === "in_transit" ? "Part-dispatched" : lot.status}</span>
      </article>)}</div> : <p className="p-5 text-sm text-muted-foreground">No bagged ore lots recorded yet.</p>}
    </section>

    <section className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">Processing plant dispatches</h2><p className="text-sm text-muted-foreground">Transport trail for bagged ore leaving the site.</p></div>
      {dispatches.length ? <div className="divide-y divide-border">{dispatches.map((dispatch) => {
        const lot = Array.isArray(dispatch.lot) ? dispatch.lot[0] : dispatch.lot;
        return <article key={dispatch.id} className="grid gap-2 p-5 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center"><div><p className="font-semibold">{dispatch.processing_plant}</p><p className="text-sm text-muted-foreground">{lot?.lot_number ?? "Ore lot"}{lot?.grade_ppm === null || lot?.grade_ppm === undefined ? "" : ` · ${lot.grade_ppm} PPM`}</p></div><p className="text-sm text-muted-foreground">{dispatch.dispatched_on}</p><p className="text-sm text-muted-foreground">{Number(dispatch.dispatched_tonnes).toLocaleString()} t · {dispatch.dispatched_bags.toLocaleString()} bags</p><span className="justify-self-start rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning-foreground">{dispatch.status === "in_transit" ? "In transit" : "Received"}</span></article>;
      })}</div> : <p className="p-5 text-sm text-muted-foreground">No processing-plant dispatches recorded yet.</p>}
    </section>

    <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">{t(locale, "productionEntries")}</h2><p className="text-sm text-muted-foreground">{t(locale, "mostRecentFirst")}</p></div>
      {entries.length
        ? <div className="divide-y divide-border">{entries.map((entry) => <article key={entry.id} className="grid gap-2 p-5 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-center">
            <p className="text-sm text-muted-foreground">{entry.entry_date}</p>
            <p className="font-semibold"><Link className="text-primary hover:underline" href={`/production/${entry.id}`}>{entry.material}</Link>{entry.location ? <span className="font-normal text-muted-foreground"> · {entry.location}</span> : null}</p>
            <p className="text-sm text-muted-foreground">{entry.quantity} {entry.unit}{entry.grade === null ? "" : ` · grade ${entry.grade} PPM`}</p>
            <span className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ${statusTone[entry.status] ?? "bg-muted text-foreground"}`}>{productionStatusLabels[entry.status as keyof typeof productionStatusLabels] ?? entry.status}</span>
          </article>)}</div>
        : <p className="p-5 text-sm text-muted-foreground">No production has been captured at this site yet.</p>}
      <Pagination basePath="/production" info={entriesInfo} search="" />
    </div>

    <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">{t(locale, "downtime")}</h2><p className="text-sm text-muted-foreground">{t(locale, "downtimeDescription")}</p></div>
      <div className="p-5">
        {canCreate && <div className="mb-5 border-b border-border pb-5"><DowntimeForm shifts={shiftOptions} equipment={equipmentOptions} /></div>}
        {downtimeResult.data?.length
          ? <ul className="divide-y divide-border">{downtimeResult.data.map((row) => {
              const equipment = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
              return <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span className="font-medium">{row.reason}{equipment?.name ? ` · ${equipment.name}` : ""}</span>
                <span className="text-sm text-muted-foreground">{row.minutes} min</span>
              </li>;
            })}</ul>
          : <p className="text-sm text-muted-foreground">No downtime recorded.</p>}
      </div>
    </div>
  </section>;
}
