import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { fetchAllPages } from "./fetch-all";

export const reportKinds = ["production", "fuel", "stock", "expenses"] as const;
export type ReportKind = (typeof reportKinds)[number];

export const reportLabels: Record<ReportKind, string> = {
  production: "Production",
  fuel: "Fuel issues",
  stock: "Stock issues",
  expenses: "Expenses",
};

/** Each report is gated on the permission that guards the records it reads. */
const reportPermissions: Record<ReportKind, string> = {
  production: "production.read",
  fuel: "fuel.read",
  stock: "inventory.read",
  expenses: "expense.read",
};

export type ReportRow = Record<string, string | number | null>;
export type ReportResult = { columns: string[]; rows: ReportRow[]; truncated: boolean };

export function isReportKind(value: string | undefined): value is ReportKind {
  return reportKinds.includes((value ?? "") as ReportKind);
}

export { toCsv } from "./csv";

/**
 * Builds a report over a date range for the active mine site. Returns plain rows so the same query
 * serves both the on-screen table and the CSV download without them drifting apart.
 *
 * Every query below is read through fetchAllPages rather than in one shot. A single select stops at
 * PostgREST's 1000-row cap without saying so, which for a report is the most damaging thing it could
 * do: a year of production would come back short and look complete.
 */
export async function runReport(kind: ReportKind, from: string, to: string): Promise<ReportResult | { error: string }> {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site) return { error: "Select an active organization and mine site first." };
  if (!await hasPermission(organization.id, reportPermissions[kind])) {
    return { error: "You do not have permission to run this report." };
  }

  const supabase = workspace.supabase;
  const failed = { error: "Unable to run the report." };

  if (kind === "production") {
    const paged = await fetchAllPages(async (start, end) => {
      const { data, error } = await supabase
        .from("production_entries").select("entry_date, material, quantity, unit, grade, status, location")
        .eq("organization_id", organization.id).eq("mine_site_id", site.id)
        .gte("entry_date", from).lte("entry_date", to)
        .order("entry_date").order("id").range(start, end);
      return error ? null : data ?? [];
    });
    if (!paged) return failed;
    return {
      columns: ["Date", "Material", "Quantity", "Unit", "Grade", "Status", "Location"],
      truncated: paged.truncated,
      rows: paged.rows.map((row) => ({
        Date: row.entry_date, Material: row.material, Quantity: Number(row.quantity), Unit: row.unit,
        Grade: row.grade === null ? "" : Number(row.grade), Status: row.status, Location: row.location ?? "",
      })),
    };
  }

  if (kind === "fuel") {
    const paged = await fetchAllPages(async (start, end) => {
      const { data, error } = await supabase
        .from("fuel_issues").select("id, issued_on, litres, equipment_meter, store:fuel_storage_locations!fuel_issues_storage_location_id_fkey(name), equipment:equipment!fuel_issues_equipment_id_fkey(name), worker:workers!fuel_issues_worker_id_fkey(full_name)")
        .eq("organization_id", organization.id).eq("mine_site_id", site.id)
        .gte("issued_on", from).lte("issued_on", to)
        .order("issued_on").order("id").range(start, end);
      return error ? null : data ?? [];
    });
    if (!paged) return failed;
    return {
      columns: ["Date", "Store", "Equipment", "Collected by", "Litres", "Meter"],
      truncated: paged.truncated,
      rows: paged.rows.map((row) => {
        const store = Array.isArray(row.store) ? row.store[0] : row.store;
        const equipment = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
        const worker = Array.isArray(row.worker) ? row.worker[0] : row.worker;
        return {
          Date: row.issued_on, Store: store?.name ?? "", Equipment: equipment?.name ?? "",
          "Collected by": worker?.full_name ?? "", Litres: Number(row.litres),
          Meter: row.equipment_meter === null ? "" : Number(row.equipment_meter),
        };
      }),
    };
  }

  if (kind === "stock") {
    // Stock issues are organization-scoped through their store. This previously fetched every issue
    // in the organization and dropped the other sites' rows afterwards, so for a company with more
    // than one site the report was short twice over: capped org-wide, then filtered down. An inner
    // join on the store pushes the site filter into the query, where it belongs.
    const paged = await fetchAllPages(async (start, end) => {
      const { data, error } = await supabase
        .from("stock_issues")
        .select("id, issued_on, quantity, reason, item:inventory_items!inner(name, unit), location:inventory_locations!inner(name, mine_site_id)")
        .eq("organization_id", organization.id)
        .eq("location.mine_site_id", site.id)
        .gte("issued_on", from).lte("issued_on", to)
        .order("issued_on").order("id").range(start, end);
      return error ? null : data ?? [];
    });
    if (!paged) return failed;
    return {
      columns: ["Date", "Item", "Store", "Quantity", "Unit", "Reason"],
      truncated: paged.truncated,
      rows: paged.rows.map((row) => {
        const item = Array.isArray(row.item) ? row.item[0] : row.item;
        const location = Array.isArray(row.location) ? row.location[0] : row.location;
        return {
          Date: row.issued_on, Item: item?.name ?? "", Store: location?.name ?? "",
          Quantity: Number(row.quantity), Unit: item?.unit ?? "", Reason: row.reason,
        };
      }),
    };
  }

  const paged = await fetchAllPages(async (start, end) => {
    const { data, error } = await supabase
      .from("expenses").select("id, incurred_on, description, amount, currency_code, status, category:expense_categories!expenses_category_id_fkey(name)")
      .eq("organization_id", organization.id).eq("mine_site_id", site.id)
      .gte("incurred_on", from).lte("incurred_on", to)
      .order("incurred_on").order("id").range(start, end);
    return error ? null : data ?? [];
  });
  if (!paged) return failed;
  return {
    columns: ["Date", "Description", "Category", "Amount", "Currency", "Status"],
    truncated: paged.truncated,
    rows: paged.rows.map((row) => {
      const category = Array.isArray(row.category) ? row.category[0] : row.category;
      return {
        Date: row.incurred_on, Description: row.description, Category: category?.name ?? "",
        Amount: Number(row.amount), Currency: row.currency_code, Status: row.status,
      };
    }),
  };
}
