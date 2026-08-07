import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads a module's headline figures from the database.
 *
 * These used to be worked out in the page from whatever rows it happened to have fetched — a page of
 * 25 work orders, the last 50 ore lots. That made every headline a site-wide claim built from a
 * page-sized sample: "Open work orders" changed when the reader turned the page, and a tonnage or a
 * spend figure was simply short with nothing on screen to say so.
 *
 * A failure here returns nulls rather than zeros. Zero is a claim — "there is no outstanding work" —
 * and it is the wrong one to make when the truth is that we could not find out. The caller shows a
 * dash instead.
 */
async function readTotals<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  fn: string,
  siteId: string,
): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, { requested_site_id: siteId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as T | undefined) ?? null;
}

const number = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

export type ProductionTotals = { approvedQuantity: number; submittedCount: number; oreReadyTonnes: number; oreWeightedGradePpm: number };
export type MaintenanceTotals = { openWorkOrders: number; openRequests: number; overdueSchedules: number };
export type ExpenseTotals = { approvedAmount: number; submittedCount: number; activeBudgets: number };
export type FuelTotals = { litresOnHand: number; activeStores: number };

export async function productionTotals(supabase: SupabaseClient, siteId: string): Promise<ProductionTotals | null> {
  const row = await readTotals<Record<string, unknown>>(supabase, "production_totals", siteId);
  return row && {
    approvedQuantity: number(row.approved_quantity),
    submittedCount: number(row.submitted_count),
    oreReadyTonnes: number(row.ore_ready_tonnes),
    oreWeightedGradePpm: number(row.ore_weighted_grade_ppm),
  };
}

export async function maintenanceTotals(supabase: SupabaseClient, siteId: string): Promise<MaintenanceTotals | null> {
  const row = await readTotals<Record<string, unknown>>(supabase, "maintenance_totals", siteId);
  return row && {
    openWorkOrders: number(row.open_work_orders),
    openRequests: number(row.open_requests),
    overdueSchedules: number(row.overdue_schedules),
  };
}

export async function expenseTotals(supabase: SupabaseClient, siteId: string): Promise<ExpenseTotals | null> {
  const row = await readTotals<Record<string, unknown>>(supabase, "expense_totals", siteId);
  return row && {
    approvedAmount: number(row.approved_amount),
    submittedCount: number(row.submitted_count),
    activeBudgets: number(row.active_budgets),
  };
}

export async function fuelTotals(supabase: SupabaseClient, siteId: string): Promise<FuelTotals | null> {
  const row = await readTotals<Record<string, unknown>>(supabase, "fuel_totals", siteId);
  return row && {
    litresOnHand: number(row.litres_on_hand),
    activeStores: number(row.active_stores),
  };
}

/** Renders a figure, or a dash when it could not be established. A dash is honest; a zero is not. */
export function figure(value: number | undefined, options?: Intl.NumberFormatOptions) {
  return value === undefined ? "—" : value.toLocaleString(undefined, options);
}
