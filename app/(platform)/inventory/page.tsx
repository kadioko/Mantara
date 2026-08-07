import { redirect } from "next/navigation";
import { Panel } from "@/components/ui/card";
import { CatalogueList } from "@/components/ui/catalogue";
import { Pagination, SearchField } from "@/components/ui/pagination";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { likePattern, pageInfo, readPaging, type PageParams } from "@/lib/paging";
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
import {
  CategoryRow,
  ItemRow,
  StoreRow,
  SupplierRow,
  type CatalogueItem,
  type CatalogueStore,
  type CatalogueSupplier,
} from "@/features/inventory/catalogue-forms";

export const metadata = { title: "Inventory" };

/** One row of the stock overview view, which does the joining, filtering and paging in the database. */
type StockRow = {
  id: string;
  quantity: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  item_unit: string;
  reorder_level: string | null;
  location_name: string;
  below_reorder: boolean;
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "inventory.read")) redirect("/dashboard");

  const paging = readPaging(await searchParams);
  const [canManage, canReceive, canIssue, canTransfer, canAdjust] = await Promise.all([
    hasPermission(organization.id, "inventory.manage"),
    hasPermission(organization.id, "inventory.receive"),
    hasPermission(organization.id, "inventory.issue"),
    hasPermission(organization.id, "inventory.transfer"),
    hasPermission(organization.id, "inventory.adjust"),
  ]);

  // The stock list is read from inventory_stock_overview, one page at a time. The previous version
  // fetched every balance in the organization and narrowed it in JavaScript, which quietly showed a
  // subset as if it were the whole once an organization passed PostgREST's 1000-row cap.
  let stockQuery = workspace.supabase
    .from("inventory_stock_overview")
    .select("id, quantity, item_id, item_name, item_sku, item_unit, reorder_level, location_name, below_reorder", { count: "exact" })
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id);
  if (paging.search) {
    const pattern = likePattern(paging.search);
    stockQuery = stockQuery.or(`item_name.ilike.${pattern},item_sku.ilike.${pattern},location_name.ilike.${pattern}`);
  }

  const [stockResult, reorderResult, itemsResult, locationsResult, categoriesResult, suppliersResult] = await Promise.all([
    stockQuery.order("item_name").order("location_name").range(paging.from, paging.to),
    // Counted separately, because the reorder figure is about the whole site rather than this page.
    workspace.supabase
      .from("inventory_stock_overview")
      .select("id, item_name, item_unit, quantity, reorder_level, location_name", { count: "exact" })
      .eq("organization_id", organization.id)
      .eq("mine_site_id", site.id)
      .eq("below_reorder", true)
      .order("item_name")
      .limit(50),
    workspace.supabase.from("inventory_items").select("id, name, sku, unit, reorder_level, category_id, notes, is_active").eq("organization_id", organization.id).is("deleted_at", null).order("name"),
    workspace.supabase.from("inventory_locations").select("id, name, notes, is_active").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("name"),
    workspace.supabase.from("inventory_categories").select("id, name").eq("organization_id", organization.id).order("name"),
    workspace.supabase.from("suppliers").select("id, name, contact_name, phone_number, email, notes, is_active").eq("organization_id", organization.id).order("name"),
  ]);
  if (itemsResult.error) throw new Error("Unable to load inventory items.");

  const stock = (stockResult.data ?? []) as StockRow[];
  const reorderRows = (reorderResult.data ?? []) as StockRow[];
  const items = (itemsResult.data ?? []) as CatalogueItem[];
  const stores = (locationsResult.data ?? []) as CatalogueStore[];
  const suppliers = (suppliersResult.data ?? []) as CatalogueSupplier[];
  const categories = (categoriesResult.data ?? []) as { id: string; name: string }[];

  // Only what is in service can take a movement; the full lists above are for the catalogue panel.
  const activeItems = items.filter((item) => item.is_active);
  const activeStores = stores.filter((store) => store.is_active);
  const itemOptions: Option[] = activeItems.map((item) => ({ id: item.id, label: item.sku ? `${item.name} (${item.sku})` : item.name }));
  const locationOptions: Option[] = activeStores.map((store) => ({ id: store.id, label: store.name }));
  const categoryOptions: Option[] = categories.map((category) => ({ id: category.id, label: category.name }));
  const supplierOptions: Option[] = suppliers.filter((supplier) => supplier.is_active).map((supplier) => ({ id: supplier.id, label: supplier.name }));

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
  const info = pageInfo(paging, stockResult.count ?? stock.length);

  return <div className="space-y-6">
    <div>
      <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "controls")}</p>
      <h1 className="mt-2 text-3xl font-bold">{t(locale, "inventory")}</h1>
      <p className="mt-2 text-muted-foreground">{t(locale, "inventoryDescription", { site: site.name })}</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Catalogue items</p><p className="mt-1 text-2xl font-bold">{activeItems.length}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Stores at this site</p><p className="mt-1 text-2xl font-bold">{activeStores.length}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">At or below reorder</p><p className="mt-1 text-2xl font-bold">{reorderResult.count ?? reorderRows.length}</p></div>
    </div>

    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">{t(locale, "stockOnHand")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Balances are maintained by the database on every movement.</p>
        </div>
        <SearchField basePath="/inventory" search={paging.search} placeholder="Search item, SKU or store" />
      </div>
      {stock.length
        ? <ul className="divide-y divide-border px-5">{stock.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-medium">{row.item_name}<span className="ml-2 text-sm font-normal text-muted-foreground">{row.location_name}</span></span>
              <span className={`text-sm ${row.below_reorder ? "font-semibold text-accent-foreground" : "text-muted-foreground"}`}>
                {Number(row.quantity).toLocaleString()} {row.item_unit}{row.below_reorder ? " · at reorder level" : ""}
              </span>
            </li>
          ))}</ul>
        : <p className="px-5 py-6 text-sm text-muted-foreground">{paging.search ? "No stock matches that search." : "No stock is held at this site yet."}</p>}
      <Pagination basePath="/inventory" info={info} search={paging.search} />
    </section>

    {canManage && <>
      <CatalogueList title="Items" description="Shared across the organization. Retiring an item needs its stock to be zero first.">
        <div className="px-5 py-4"><InventoryItemForm categories={categoryOptions} /></div>
        {items.map((item) => <ItemRow key={item.id} item={item} categories={categoryOptions} canManage={canManage} />)}
      </CatalogueList>

      <CatalogueList title="Categories" description="Used to group items in reports.">
        <div className="px-5 py-4"><InventoryCategoryForm /></div>
        {categories.map((category) => <CategoryRow key={category.id} category={category} canManage={canManage} />)}
      </CatalogueList>

      <CatalogueList title="Stores" description="Stores belong to this mine site. A store must be empty before it can be taken out of service.">
        <div className="px-5 py-4"><InventoryLocationForm /></div>
        {stores.map((store) => <StoreRow key={store.id} store={store} canManage={canManage} />)}
      </CatalogueList>

      <CatalogueList title="Suppliers" description="Shared across the organization.">
        <div className="px-5 py-4"><SupplierForm /></div>
        {suppliers.map((supplier) => <SupplierRow key={supplier.id} supplier={supplier} canManage={canManage} />)}
      </CatalogueList>
    </>}

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
      {reorderRows.length
        ? <ul className="divide-y divide-border">{reorderRows.map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="font-medium">{row.item_name}<span className="ml-2 text-sm font-normal text-muted-foreground">{row.location_name}</span></span>
              <span className="text-sm font-semibold text-accent-foreground">
                {Number(row.quantity).toLocaleString()} {row.item_unit} · reorder at {Number(row.reorder_level).toLocaleString()}
              </span>
            </li>
          ))}</ul>
        : <p className="text-sm text-muted-foreground">Nothing is at its reorder level.</p>}
    </Panel>
  </div>;
}
