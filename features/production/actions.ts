"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScopeHard, rpcMessage, type ActiveScope } from "@/lib/auth/scope";
import {
  downtimeSchema,
  oreDispatchSchema,
  oreLotSchema,
  productionEntrySchema,
  productionReviewSchema,
  productionSubmitSchema,
  shiftSchema,
} from "./schemas";

export type ProductionState = { error?: string; success?: string };

const shiftInScope = (scope: ActiveScope, shiftId: string) => rowInScopeHard(scope, "shifts", shiftId);

/** Combines a date with an optional HH:mm from the form into a timestamp, or null when not supplied. */
function timestampFor(date: string, time?: string) {
  return time ? new Date(`${date}T${time}:00`).toISOString() : null;
}

export async function createShift(_: ProductionState, formData: FormData): Promise<ProductionState> {
  const parsed = shiftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the shift details." };
  const scope = await requireScope("production.create", "You do not have permission to create shifts.");
  if ("error" in scope) return scope;
  if (parsed.data.supervisorWorkerId) {
    const { data: supervisor } = await scope.workspace.supabase
      .from("workers").select("id").eq("id", parsed.data.supervisorWorkerId)
      .eq("organization_id", scope.organizationId).eq("mine_site_id", scope.siteId)
      .is("deleted_at", null).maybeSingle();
    if (!supervisor) return { error: "That supervisor is not registered at the active mine site." };
  }
  const { error } = await scope.workspace.supabase.from("shifts").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    name: parsed.data.name,
    shift_date: parsed.data.shiftDate,
    starts_at: timestampFor(parsed.data.shiftDate, parsed.data.startsAt),
    ends_at: timestampFor(parsed.data.shiftDate, parsed.data.endsAt),
    supervisor_worker_id: parsed.data.supervisorWorkerId || null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "A shift with that name already exists on that date." : "Unable to save the shift. Please try again." };
  revalidatePath("/shifts");
  return { success: "Shift created." };
}

export async function createProductionEntry(_: ProductionState, formData: FormData): Promise<ProductionState> {
  const parsed = productionEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the production details." };
  const scope = await requireScope("production.create", "You do not have permission to capture production.");
  if ("error" in scope) return scope;
  if (parsed.data.shiftId && !await shiftInScope(scope, parsed.data.shiftId)) return { error: "That shift does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.from("production_entries").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    shift_id: parsed.data.shiftId || null,
    entry_date: parsed.data.entryDate,
    material: parsed.data.material,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    grade: parsed.data.grade ?? null,
    location: parsed.data.location || null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the production entry. Please try again." };
  revalidatePath("/production");
  return { success: "Production entry saved as a draft." };
}

export async function submitProductionEntry(_: ProductionState, formData: FormData): Promise<ProductionState> {
  const parsed = productionSubmitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Select a production entry to submit." };
  const scope = await requireScope("production.update", "You do not have permission to submit production entries.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase
    .from("production_entries")
    .update({ status: "submitted", updated_by: scope.workspace.user.id })
    .eq("id", parsed.data.entryId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId);
  if (error) return { error: rpcMessage(error, "Unable to submit the entry. Please try again.") };
  revalidatePath(`/production/${parsed.data.entryId}`);
  revalidatePath("/production");
  return { success: "Production entry submitted for approval." };
}

export async function reviewProductionEntry(_: ProductionState, formData: FormData): Promise<ProductionState> {
  const parsed = productionReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the review details." };
  const scope = await requireScope("production.approve", "You do not have permission to approve production.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.rpc("review_production_entry", {
    requested_entry_id: parsed.data.entryId,
    decision: parsed.data.decision,
    review_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the decision. Please try again.") };
  revalidatePath(`/production/${parsed.data.entryId}`);
  revalidatePath("/production");
  return { success: parsed.data.decision === "approved" ? "Production entry approved." : "Production entry rejected." };
}

export async function createDowntime(_: ProductionState, formData: FormData): Promise<ProductionState> {
  const parsed = downtimeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the downtime details." };
  const scope = await requireScope("production.create", "You do not have permission to record downtime.");
  if ("error" in scope) return scope;
  if (parsed.data.shiftId && !await shiftInScope(scope, parsed.data.shiftId)) return { error: "That shift does not belong to the active mine site." };
  if (parsed.data.equipmentId) {
    const { data: equipment } = await scope.workspace.supabase
      .from("equipment").select("id").eq("id", parsed.data.equipmentId)
      .eq("organization_id", scope.organizationId).eq("mine_site_id", scope.siteId)
      .is("deleted_at", null).maybeSingle();
    if (!equipment) return { error: "That equipment is not registered at the active mine site." };
  }
  const { error } = await scope.workspace.supabase.from("downtime_records").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    shift_id: parsed.data.shiftId || null,
    equipment_id: parsed.data.equipmentId || null,
    reason: parsed.data.reason,
    minutes: parsed.data.minutes,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to record the downtime. Please try again." };
  revalidatePath("/production");
  return { success: "Downtime recorded." };
}

export async function createOreLot(_: ProductionState, formData: FormData): Promise<ProductionState> {
  const parsed = oreLotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the ore lot details." };
  const scope = await requireScope("production.create", "You do not have permission to record bagged ore.");
  if ("error" in scope) return scope;
  if (parsed.data.shiftId && !await shiftInScope(scope, parsed.data.shiftId)) return { error: "That shift does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.from("ore_lots").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    shift_id: parsed.data.shiftId || null,
    lot_number: parsed.data.lotNumber,
    produced_on: parsed.data.producedOn,
    source_location: parsed.data.sourceLocation || null,
    ore_tonnes: parsed.data.oreTonnes,
    grade_ppm: parsed.data.gradePpm,
    grade_method: parsed.data.gradeMethod || null,
    bag_count: parsed.data.bagCount,
    bag_weight_kg: parsed.data.bagWeightKg,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That ore lot number already exists in this organization." : "Unable to save the ore lot. Please try again." };
  revalidatePath("/production");
  return { success: "Bagged ore lot recorded." };
}

export async function dispatchOreLot(_: ProductionState, formData: FormData): Promise<ProductionState> {
  const parsed = oreDispatchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the dispatch details." };
  const scope = await requireScope("production.update", "You do not have permission to dispatch ore.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.rpc("record_ore_dispatch", {
    requested_lot_id: parsed.data.lotId,
    requested_processing_plant: parsed.data.processingPlant,
    requested_dispatched_on: parsed.data.dispatchedOn,
    requested_tonnes: parsed.data.dispatchedTonnes,
    requested_bags: parsed.data.dispatchedBags,
    requested_vehicle_reference: parsed.data.vehicleReference || null,
    requested_dispatch_reference: parsed.data.dispatchReference || null,
    requested_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the ore dispatch. Please try again.") };
  revalidatePath("/production");
  return { success: "Ore dispatch recorded for the processing plant." };
}
