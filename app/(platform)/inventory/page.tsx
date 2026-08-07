import { redirect } from "next/navigation";
import { Panel } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import {
  InventoryCategoryForm,
  InventoryItemForm,
  InventoryLocationForm,
  StockAdjustmentForm,
  StockIssueForm,
  StockReceiptForm,
  StockTransferForm,
  SupplierForm,
  type Option,
} from "@/features/inventory/inventory-forms";

export default async function InventoryPage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "inventory.read")) redirect("/dashboard");

  const [canManage, canReceive, canIssue, canTransfer, canAdjust] = await Promise.all([
    hasPermission(organization.id, "inventory.manage"),
    hasPermission(organization.id, "inventory.receive"),
    hasPermission(organization.id, "inventory.issue"),
    hasPermission(organization.id, "inventory.transfer"),
    hasPermission(organization.id, "inventory.adjust"),
  ]);

  const [itemsResult, locationsResult, categoriesResult, suppliersResult, balancesResult] = await Promise.all([
    workspace.supabase.from("inventory_items").select("id, name, sku, unit, reorder_level").eq("organization_id", organization.id).eq("is_active", true).is("deleted_at", null).order("name"),
    workspace.supabase.from("inventory_locations").select("id, name, is_active").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("name"),
    workspace.supabase.from("inventory_categories").select("id, name").eq("organization_id", organization.id).order("name"),
    workspace.supabase.from("suppliers").select("id, name").eq("organization_id", organization.id).eq("is_active", true).order("name"),
    workspace.supabase.from("inventory_stock_balances").select("id, quantity, item:inventory_items(id, name, unit, reorder_level), location:inventory_locations(id, name, mine_site_id)").eq("organization_id", organization.id),
  ]);
  if (itemsResult.error) throw new Error("Unable to load inventory items.");

  const items = itemsResult.data ?? [];
  const activeLocations = (locationsResult.data ?? []).filter((location) => location.is_active);
  const itemOptions: Option[] = items.map((item) => ({ id: item.id, label: item.sku ? `${item.name} (${item.sku})` : item.name }));
  const locationOptions: Option[] = activeLocations.map((location) => ({ id: location.id, label: location.name }));
  const categoryOptions: Option[] = (categoriesResult.data ?? []).map((category) => ({ id: category.id, label: category.name }));
  const supplierOptions: Option[] = (suppliersResult.data ?? []).map((supplier) => ({ id: supplier.id, label: supplier.name }));

  // Balances are organization-wide; only show the ones held in this site's stores.
  const siteLocationIds = new Set(activeLocations.map((location) => location.id));
  const balances = (balancesResult.data ?? [])
    .map((row) => ({
      id: row.id,
      quantity: Number(row.quantity),
      item: Array.isArray(row.item) ? row.item[0] : row.item,
      location: Array.isArray(row.location) ? row.location[0] : row.location,
    }))
    .filter((row) => row.item && row.location && siteLocationIds.has(row.location.id))
    .sort((a, b) => (a.item?.name ?? "").localeCompare(b.item?.name ?? ""));
  const belowReorder = balances.filter((row) => row.item?.reorder_level !== null && row.item?.reorder_level !== undefined && row.quantity <= Number(row.item.reorder_level));

  const canMove = itemOptions.length > 0 && locationOptions.length > 0;
  const [workOrders, equipment, workers] = await Promise.all([
    canMove && canIssue
      ? workspace.supabase.from("maintenance_work_orders").select("id, title").eq("organization_id", organization.id).eq("mine_site_id", site.id).in("status", ["planned", "in_progress", "on_hold"]).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    canMove && canIssue
      ? workspace.supabase.from("equipment").select("id, name").eq("organization_id", organization.id).eq("mine_site_id", site.id).is("deleted_at", null).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    canMove && canIssue
      ? workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const locale = await getLocale();

  return <div className="space-y-6">
    <div>
      <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "controls")}</p>
      <h1 className="mt-2 text-3xl font-bold">{t(locale, "inventory")}</h1>
      <p className="mt-2 text-muted-foreground">{t(locale, "inventoryDescription", { site: site.name })}</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Catalogue items</p><p className="mt-1 text-2xl font-bold">{items.length}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Stores at this site</p><p className="mt-1 text-2xl font-bold">{activeLocations.length}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">At or below reorder</p><p className="mt-1 text-2xl font-bold">{belowReorder.length}</p></div>
    </div>

    <Panel title={t(locale, "stockOnHand")} description="Balances are maintained by the database on every movement.">
      {balances.length
        ? <ul className="divide-y divide-border">{balances.map((row) => {
            const low = row.item?.reorder_level !== null && row.item?.reorder_level !== undefined && row.quantity <= Number(row.item.reorder_level);
            return <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-medium">{row.item?.name}<span className="ml-2 text-sm font-normal text-muted-foreground">{row.location?.name}</span></span>
              <span className={`text-sm ${low ? "font-semibold text-accent-foreground" : "text-muted-foreground"}`}>{row.quantity.toLocaleString()} {row.item?.unit}{low ? " · at reorder level" : ""}</span>
            </li>;
          })}</ul>
        : <p className="text-sm text-muted-foreground">No stock is held at this site yet.</p>}
    </Panel>

    {canManage && <Panel title={t(locale, "catalogueAndStores")} description="Items, categories, and suppliers are shared across the organization; stores belong to this site.">
      <div className="space-y-6">
        <div><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Add an item</h3><InventoryItemForm categories={categoryOptions} /></div>
        <div className="border-t border-border pt-6"><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Add a category</h3><InventoryCategoryForm /></div>
        <div className="border-t border-border pt-6"><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Add a store</h3><InventoryLocationForm /></div>
        <div className="border-t border-border pt-6"><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Add a supplier</h3><SupplierForm /></div>
      </div>
    </Panel>}

    {!canMove
      ? <p className="rounded-xl border border-dashed border-input bg-card p-6 text-sm text-muted-foreground">Add at least one catalogue item and one active store before recording stock movements.</p>
      : <>
          {canReceive && <Panel title="Receive stock"><StockReceiptForm items={itemOptions} locations={locationOptions} suppliers={supplierOptions} today={today} /></Panel>}
          {canIssue && <Panel title="Issue stock" description="An issue larger than the balance is rejected.">
            <StockIssueForm
              items={itemOptions}
              locations={locationOptions}
              workOrders={(workOrders.data ?? []).map((order) => ({ id: order.id, label: order.title }))}
              equipment={(equipment.data ?? []).map((item) => ({ id: item.id, label: item.name }))}
              workers={(workers.data ?? []).map((worker) => ({ id: worker.id, label: worker.full_name }))}
              today={today}
            />
          </Panel>}
          {canTransfer && locationOptions.length > 1 && <Panel title="Transfer between stores"><StockTransferForm items={itemOptions} locations={locationOptions} today={today} /></Panel>}
          {canAdjust && <Panel title="Adjust stock" description="Use a negative value for losses and a positive value for gains."><StockAdjustmentForm items={itemOptions} locations={locationOptions} today={today} /></Panel>}
        </>}

    <Panel title={t(locale, "reorderWatch")} description="Items at or below their reorder level in this site's stores.">
      {belowReorder.length
        ? <ul className="divide-y divide-border">{belowReorder.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
            <span className="font-medium">{row.item?.name}<span className="ml-2 text-sm font-normal text-muted-foreground">{row.location?.name}</span></span>
            <span className="text-sm font-semibold text-accent-foreground">{row.quantity.toLocaleString()} {row.item?.unit} · reorder at {Number(row.item?.reorder_level).toLocaleString()}</span>
          </li>)}</ul>
        : <p className="text-sm text-muted-foreground">Nothing is at its reorder level.</p>}
    </Panel>
  </div>;
}
