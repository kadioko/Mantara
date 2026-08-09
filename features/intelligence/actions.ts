"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireScope } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";

export type ForecastState = { error?: string; success?: string };

const schema = z.object({
  commodity: z.string().trim().min(2).max(80),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  pricePerOunce: z.coerce.number().min(0).max(1_000_000_000),
  recoveryPercent: z.coerce.number().min(0).max(100),
  forecastDays: z.coerce.number().int().min(1).max(366),
  effectiveOn: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
});

export async function saveForecastAssumption(_: ForecastState, formData: FormData): Promise<ForecastState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the price, recovery, currency and forecast period." };
  const scope = await requireScope("production.update", "You do not have permission to manage forecast assumptions.");
  if ("error" in scope) return scope;
  if (!await hasPermission(scope.organizationId, "expense.update")) return { error: "Expense update permission is also required." };
  const d = parsed.data;
  const record = {
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    commodity: d.commodity,
    currency_code: d.currencyCode,
    price_per_ounce: d.pricePerOunce,
    recovery_percent: d.recoveryPercent,
    forecast_days: d.forecastDays,
    effective_on: d.effectiveOn,
    notes: d.notes || null,
    updated_by: scope.workspace.user.id,
  };
  const { data: existing } = await scope.workspace.supabase.from("site_forecast_assumptions").select("id")
    .eq("organization_id", scope.organizationId).eq("mine_site_id", scope.siteId)
    .eq("commodity", d.commodity).eq("currency_code", d.currencyCode).maybeSingle();
  const { error } = existing
    ? await scope.workspace.supabase.from("site_forecast_assumptions").update(record).eq("id", existing.id)
    : await scope.workspace.supabase.from("site_forecast_assumptions").insert({ ...record, created_by: scope.workspace.user.id });
  if (error) return { error: "The forecast assumptions could not be saved." };
  revalidatePath("/intelligence");
  return { success: "Forecast assumptions saved." };
}
