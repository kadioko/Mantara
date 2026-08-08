"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScopeHard, rpcMessage, type ActiveScope } from "@/lib/auth/scope";
import {
  fuelAdjustmentSchema,
  fuelIssueSchema,
  fuelLocationSchema,
  fuelReceiptSchema,
  fuelStockTakeSchema,
} from "./schemas";

export type FuelState = { error?: string; success?: string };

const locationInScope = (scope: ActiveScope, locationId: string) =>
  rowInScopeHard(scope, "fuel_storage_locations", locationId);

export async function createFuelLocation(_: FuelState, formData: FormData): Promise<FuelState> {
  const parsed = fuelLocationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fuel store details." };
  const scope = await requireScope("fuel.manage", "You do not have permission to manage fuel stores.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("fuel_storage_locations").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    name: parsed.data.name,
    fuel_type: parsed.data.fuelType,
    capacity_litres: parsed.data.capacityLitres ?? null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "A fuel store with that name already exists at this site." : "Unable to save the fuel store. Please try again." };
  revalidatePath("/fuel");
  return { success: "Fuel store created." };
}

export async function recordFuelReceipt(_: FuelState, formData: FormData): Promise<FuelState> {
  const parsed = fuelReceiptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the delivery details." };
  const scope = await requireScope("fuel.receive", "You do not have permission to record fuel deliveries.");
  if ("error" in scope) return scope;
  if (!await locationInScope(scope, parsed.data.locationId)) return { error: "That fuel store is not at the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("record_fuel_receipt", {
    requested_location_id: parsed.data.locationId,
    litres: parsed.data.litres,
    supplier: parsed.data.supplier || null,
    reference: parsed.data.reference || null,
    unit_cost: parsed.data.unitCost ?? null,
    received_on: parsed.data.receivedOn,
    receipt_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the delivery. Please try again.") };
  revalidatePath("/fuel");
  return { success: `Recorded ${parsed.data.litres} litres received.` };
}

export async function recordFuelIssue(_: FuelState, formData: FormData): Promise<FuelState> {
  const parsed = fuelIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the issue details." };
  const scope = await requireScope("fuel.issue", "You do not have permission to issue fuel.");
  if ("error" in scope) return scope;
  if (!await locationInScope(scope, parsed.data.locationId)) return { error: "That fuel store is not at the active mine site." };
  if (parsed.data.equipmentId) {
    const { data } = await scope.workspace.supabase
      .from("equipment").select("id").eq("id", parsed.data.equipmentId)
      .eq("organization_id", scope.organizationId).eq("mine_site_id", scope.siteId)
      .is("deleted_at", null).maybeSingle();
    if (!data) return { error: "That equipment is not registered at the active mine site." };
  }
  if (parsed.data.workerId) {
    const { data } = await scope.workspace.supabase
      .from("workers").select("id").eq("id", parsed.data.workerId)
      .eq("organization_id", scope.organizationId).eq("mine_site_id", scope.siteId)
      .is("deleted_at", null).maybeSingle();
    if (!data) return { error: "That worker is not registered at the active mine site." };
  }
  const { error } = await scope.workspace.supabase.rpc("record_fuel_issue", {
    requested_location_id: parsed.data.locationId,
    litres: parsed.data.litres,
    requested_equipment_id: parsed.data.equipmentId || null,
    requested_worker_id: parsed.data.workerId || null,
    equipment_meter: parsed.data.equipmentMeter ?? null,
    issued_on: parsed.data.issuedOn,
    issue_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the fuel issue. Please try again.") };
  revalidatePath("/fuel");
  return { success: `Issued ${parsed.data.litres} litres.` };
}

export async function recordFuelAdjustment(_: FuelState, formData: FormData): Promise<FuelState> {
  const parsed = fuelAdjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the adjustment details." };
  const scope = await requireScope("fuel.adjust", "You do not have permission to adjust fuel stock.");
  if ("error" in scope) return scope;
  if (!await locationInScope(scope, parsed.data.locationId)) return { error: "That fuel store is not at the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("record_fuel_adjustment", {
    requested_location_id: parsed.data.locationId,
    litres_delta: parsed.data.litresDelta,
    reason: parsed.data.reason,
    adjusted_on: parsed.data.adjustedOn,
    adjustment_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the adjustment. Please try again.") };
  revalidatePath("/fuel");
  return { success: "Fuel adjustment recorded." };
}

/**
 * Records a measured tank level, and reports the variance rather than hiding it.
 *
 * The success message leads with the shortfall or surplus because that is the finding. "Recorded"
 * alone would let a 400-litre discrepancy pass as a routine save.
 */
export async function recordFuelStockTake(_: FuelState, formData: FormData): Promise<FuelState> {
  const parsed = fuelStockTakeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the stock take details." };
  const scope = await requireScope("fuel.adjust", "You do not have permission to reconcile fuel stock.");
  if ("error" in scope) return scope;
  if (!await locationInScope(scope, parsed.data.locationId)) return { error: "That fuel store is not at the active mine site." };

  const { data, error } = await scope.workspace.supabase.rpc("record_fuel_stock_take", {
    requested_location_id: parsed.data.locationId,
    measured: parsed.data.measuredLitres,
    taken_date: parsed.data.takenOn,
    take_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the stock take. Please try again.") };

  revalidatePath("/fuel");
  const variance = Number(data ?? 0);
  if (variance === 0) return { success: "Stock take recorded. The tank matches the records exactly." };
  const litres = Math.abs(variance).toLocaleString();
  return {
    success: variance < 0
      ? `Stock take recorded. ${litres} litres short of the records — the balance has been corrected.`
      : `Stock take recorded. ${litres} litres more than the records — the balance has been corrected.`,
  };
}
