import Link from "next/link";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { EmptyState, StatCard } from "@/components/ui/feedback";

type Tile = { label: string; value: number | string; href: string; tone?: "default" | "warning" | "destructive" };

/**
 * Every figure is gated on the permission that guards its module, so an operator only ever sees
 * numbers drawn from records they are allowed to read. RLS enforces that regardless; this keeps the
 * page from showing a row of zeros for modules the user has no access to.
 */
export default async function DashboardPage() {
  const [workspace, locale] = await Promise.all([getActiveWorkspace(), getLocale()]);
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site) {
    return <section><h1 className="text-3xl font-bold">{t(locale, "dashboard")}</h1></section>;
  }

  const supabase = workspace.supabase;
  const organizationId = organization.id;
  const siteId = site.id;
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(new Date().getTime() + 60 * 86_400_000).toISOString().slice(0, 10);

  const [canWorkers, canEquipment, canProduction, canFuel, canMaintenance, canInventory, canExpenses, canCompliance, canSafety] = await Promise.all([
    hasPermission(organizationId, "worker.read"),
    hasPermission(organizationId, "equipment.read"),
    hasPermission(organizationId, "production.read"),
    hasPermission(organizationId, "fuel.read"),
    hasPermission(organizationId, "maintenance.read"),
    hasPermission(organizationId, "inventory.read"),
    hasPermission(organizationId, "expense.read"),
    hasPermission(organizationId, "compliance.read"),
    hasPermission(organizationId, "safety.read"),
  ]);

  /** Counts matching rows without transferring any of them. */
  const countOf = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;
  const from = (table: string) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);

  const groups: Array<{ heading: string; tiles: Tile[] }> = [];

  if (canWorkers) {
    const [activeWorkers, presentToday] = await Promise.all([
      countOf(from("workers").eq("mine_site_id", siteId).eq("status", "active").is("deleted_at", null)),
      countOf(from("attendance_records").eq("mine_site_id", siteId).eq("attendance_date", today).eq("status", "present")),
    ]);
    groups.push({
      heading: t(locale, "workforce"),
      tiles: [
        { label: t(locale, "activeWorkers"), value: activeWorkers, href: "/workers" },
        { label: t(locale, "presentToday"), value: presentToday, href: "/attendance" },
      ],
    });
  }

  if (canEquipment || canMaintenance) {
    const tiles: Tile[] = [];
    if (canEquipment) {
      const [operating, down] = await Promise.all([
        countOf(from("equipment").eq("mine_site_id", siteId).eq("status", "operational").is("deleted_at", null)),
        countOf(from("equipment").eq("mine_site_id", siteId).in("status", ["breakdown", "maintenance"]).is("deleted_at", null)),
      ]);
      tiles.push({ label: t(locale, "operationalEquipment"), value: operating, href: "/equipment" });
      tiles.push({ label: t(locale, "equipmentDown"), value: down, href: "/equipment", tone: down > 0 ? "warning" : "default" });
    }
    if (canMaintenance) {
      const [openOrders, overdueServices] = await Promise.all([
        countOf(from("maintenance_work_orders").eq("mine_site_id", siteId).in("status", ["planned", "in_progress", "on_hold"])),
        countOf(from("maintenance_schedules").eq("mine_site_id", siteId).eq("is_active", true).lt("next_due_on", today)),
      ]);
      tiles.push({ label: t(locale, "openWorkOrders"), value: openOrders, href: "/maintenance" });
      tiles.push({ label: t(locale, "servicesOverdue"), value: overdueServices, href: "/maintenance", tone: overdueServices > 0 ? "destructive" : "default" });
    }
    groups.push({ heading: t(locale, "assets"), tiles });
  }

  if (canProduction || canFuel || canInventory) {
    const tiles: Tile[] = [];
    if (canProduction) {
      const awaiting = await countOf(from("production_entries").eq("mine_site_id", siteId).eq("status", "submitted"));
      tiles.push({ label: `${t(locale, "production")} · ${t(locale, "awaitingApproval")}`, value: awaiting, href: "/production", tone: awaiting > 0 ? "warning" : "default" });
    }
    if (canFuel) {
      const { data: stores } = await supabase
        .from("fuel_storage_locations").select("current_balance_litres")
        .eq("organization_id", organizationId).eq("mine_site_id", siteId).eq("is_active", true);
      const litres = (stores ?? []).reduce((sum, row) => sum + Number(row.current_balance_litres), 0);
      tiles.push({ label: t(locale, "fuelOnHand"), value: `${litres.toLocaleString()} L`, href: "/fuel" });
    }
    if (canInventory) {
      const { data: balances } = await supabase
        .from("inventory_stock_balances")
        .select("quantity, item:inventory_items(reorder_level), location:inventory_locations(mine_site_id)")
        .eq("organization_id", organizationId);
      const belowReorder = (balances ?? []).filter((row) => {
        const item = Array.isArray(row.item) ? row.item[0] : row.item;
        const location = Array.isArray(row.location) ? row.location[0] : row.location;
        if (!item || location?.mine_site_id !== siteId || item.reorder_level === null) return false;
        return Number(row.quantity) <= Number(item.reorder_level);
      }).length;
      tiles.push({ label: t(locale, "reorderWatch"), value: belowReorder, href: "/inventory", tone: belowReorder > 0 ? "warning" : "default" });
    }
    groups.push({ heading: t(locale, "operations"), tiles });
  }

  if (canExpenses || canCompliance || canSafety) {
    const tiles: Tile[] = [];
    if (canExpenses) {
      const awaiting = await countOf(from("expenses").eq("mine_site_id", siteId).eq("status", "submitted"));
      tiles.push({ label: `${t(locale, "expenses")} · ${t(locale, "awaitingApproval")}`, value: awaiting, href: "/expenses", tone: awaiting > 0 ? "warning" : "default" });
    }
    if (canCompliance) {
      const [overdueTasks, expiringLicences] = await Promise.all([
        countOf(from("compliance_tasks").in("status", ["open", "in_progress"]).lt("due_on", today)),
        countOf(from("mineral_licences").is("deleted_at", null).not("expires_on", "is", null).lte("expires_on", horizon)),
      ]);
      tiles.push({ label: t(locale, "tasksOverdue"), value: overdueTasks, href: "/compliance", tone: overdueTasks > 0 ? "destructive" : "default" });
      tiles.push({ label: t(locale, "expiringWithin", { days: "60" }), value: expiringLicences, href: "/compliance", tone: expiringLicences > 0 ? "warning" : "default" });
    }
    if (canSafety) {
      const [openIncidents, overdueActions] = await Promise.all([
        countOf(from("safety_incidents").eq("mine_site_id", siteId).neq("status", "closed")),
        countOf(from("corrective_actions").eq("mine_site_id", siteId).in("status", ["open", "in_progress"]).lt("due_on", today)),
      ]);
      tiles.push({ label: t(locale, "openIncidents"), value: openIncidents, href: "/safety", tone: openIncidents > 0 ? "warning" : "default" });
      tiles.push({ label: t(locale, "actionsOverdue"), value: overdueActions, href: "/safety", tone: overdueActions > 0 ? "destructive" : "default" });
    }
    groups.push({ heading: t(locale, "riskAndInsight"), tiles });
  }

  const populated = groups.filter((group) => group.tiles.length > 0);

  return <section className="space-y-8">
    <div>
      <p className="text-sm font-semibold tracking-wider text-amber-700">MANTARA OS</p>
      <h1 className="mt-2 text-3xl font-bold">{organization.name}</h1>
      <p className="mt-2 text-stone-600">{t(locale, "overviewDescription", { site: site.name })}</p>
    </div>

    {populated.length ? populated.map((group) => (
      <div key={group.heading}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{group.heading}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {group.tiles.map((tile) => (
            <Link key={`${group.heading}-${tile.label}`} href={tile.href} className="rounded-xl transition hover:opacity-80">
              <StatCard label={tile.label} value={tile.value} tone={tile.tone} />
            </Link>
          ))}
        </div>
      </div>
    )) : (
      <EmptyState title={t(locale, "nothingToShow")} description={t(locale, "nothingToShowDescription")} />
    )}
  </section>;
}
