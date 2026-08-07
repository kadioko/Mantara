import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";

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
export type ReportResult = { columns: string[]; rows: ReportRow[] };

export function isReportKind(value: string | undefined): value is ReportKind {
  return reportKinds.includes((value ?? "") as ReportKind);
}

/**
 * Builds a report over a date range for the active mine site. Returns plain rows so the same query
 * serves both the on-screen table and the CSV download without them drifting apart.
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

  if (kind === "production") {
    const { data, error } = await supabase
      .from("production_entries").select("entry_date, material, quantity, unit, grade, status, location")
      .eq("organization_id", organization.id).eq("mine_site_id", site.id)
      .gte("entry_date", from).lte("entry_date", to).order("entry_date");
    if (error) return { error: "Unable to run the report." };
    return {
      columns: ["Date", "Material", "Quantity", "Unit", "Grade", "Status", "Location"],
      rows: (data ?? []).map((row) => ({
        Date: row.entry_date, Material: row.material, Quantity: Number(row.quantity), Unit: row.unit,
        Grade: row.grade === null ? "" : Number(row.grade), Status: row.status, Location: row.location ?? "",
      })),
    };
  }

  if (kind === "fuel") {
    const { data, error } = await supabase
      .from("fuel_issues").select("issued_on, litres, equipment_meter, store:fuel_storage_locations(name), equipment:equipment(name), worker:workers(full_name)")
      .eq("organization_id", organization.id).eq("mine_site_id", site.id)
      .gte("issued_on", from).lte("issued_on", to).order("issued_on");
    if (error) return { error: "Unable to run the report." };
    return {
      columns: ["Date", "Store", "Equipment", "Collected by", "Litres", "Meter"],
      rows: (data ?? []).map((row) => {
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
    // Stock issues are organization-scoped through their store, so the site filter is applied after.
    const { data, error } = await supabase
      .from("stock_issues")
      .select("issued_on, quantity, reason, item:inventory_items(name, unit), location:inventory_locations(name, mine_site_id)")
      .eq("organization_id", organization.id)
      .gte("issued_on", from).lte("issued_on", to).order("issued_on");
    if (error) return { error: "Unable to run the report." };
    const rows = (data ?? []).flatMap((row) => {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      const location = Array.isArray(row.location) ? row.location[0] : row.location;
      if (location?.mine_site_id !== site.id) return [];
      return [{
        Date: row.issued_on, Item: item?.name ?? "", Store: location?.name ?? "",
        Quantity: Number(row.quantity), Unit: item?.unit ?? "", Reason: row.reason,
      }];
    });
    return { columns: ["Date", "Item", "Store", "Quantity", "Unit", "Reason"], rows };
  }

  const { data, error } = await supabase
    .from("expenses").select("incurred_on, description, amount, currency_code, status, category:expense_categories(name)")
    .eq("organization_id", organization.id).eq("mine_site_id", site.id)
    .gte("incurred_on", from).lte("incurred_on", to).order("incurred_on");
  if (error) return { error: "Unable to run the report." };
  return {
    columns: ["Date", "Description", "Category", "Amount", "Currency", "Status"],
    rows: (data ?? []).map((row) => {
      const category = Array.isArray(row.category) ? row.category[0] : row.category;
      return {
        Date: row.incurred_on, Description: row.description, Category: category?.name ?? "",
        Amount: Number(row.amount), Currency: row.currency_code, Status: row.status,
      };
    }),
  };
}

/** Escapes a value for CSV, guarding against separator, quote, and newline injection. */
function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(result: ReportResult) {
  const header = result.columns.map(csvCell).join(",");
  const body = result.rows.map((row) => result.columns.map((column) => csvCell(row[column] ?? "")).join(","));
  return [header, ...body].join("\r\n");
}
