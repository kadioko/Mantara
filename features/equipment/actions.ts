"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireScope, rowInScope, rpcMessage, type ActiveScope } from "@/lib/auth/scope";
import {
  equipmentAssignmentSchema,
  equipmentEditSchema,
  equipmentRemovalSchema,
  equipmentSchema,
  equipmentStatusUpdateSchema,
  meterReadingSchema,
} from "./schemas";

export type EquipmentState = { error?: string; success?: string };

const equipmentInScope = (scope: ActiveScope, equipmentId: string) => rowInScope(scope, "equipment", equipmentId);

export async function createEquipment(_: EquipmentState, formData: FormData): Promise<EquipmentState> {
  const parsed = equipmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the equipment details." };
  const scope = await requireScope("equipment.create", "You do not have permission to add equipment.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("equipment").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    name: parsed.data.name,
    asset_code: parsed.data.assetCode || null,
    category: parsed.data.category,
    make: parsed.data.make || null,
    model: parsed.data.model || null,
    serial_number: parsed.data.serialNumber || null,
    year_of_manufacture: parsed.data.yearOfManufacture ?? null,
    meter_type: parsed.data.meterType,
    current_meter: parsed.data.currentMeter ?? null,
    acquired_on: parsed.data.acquiredOn || null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That asset code already exists in this organization." : "Unable to save the equipment. Please try again." };
  revalidatePath("/equipment");
  return { success: "Equipment added to the register." };
}

export async function recordMeterReading(_: EquipmentState, formData: FormData): Promise<EquipmentState> {
  const parsed = meterReadingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the meter reading." };
  const scope = await requireScope("equipment.update", "You do not have permission to record meter readings.");
  if ("error" in scope) return scope;
  if (!await equipmentInScope(scope, parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  // reading_taken_at is only sent when supplied so the function's now() default applies otherwise.
  const params: Record<string, unknown> = {
    requested_equipment_id: parsed.data.equipmentId,
    reading: parsed.data.reading,
    reading_notes: parsed.data.notes || null,
  };
  if (parsed.data.readingOn) params.reading_taken_at = new Date(`${parsed.data.readingOn}T12:00:00Z`).toISOString();
  const { error } = await scope.workspace.supabase.rpc("record_equipment_meter_reading", params);
  if (error) return { error: rpcMessage(error, "Unable to record the meter reading. Please try again.") };
  revalidatePath(`/equipment/${parsed.data.equipmentId}`);
  revalidatePath("/equipment");
  return { success: "Meter reading recorded." };
}

export async function updateEquipmentStatus(_: EquipmentState, formData: FormData): Promise<EquipmentState> {
  const parsed = equipmentStatusUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the status details." };
  const scope = await requireScope("equipment.update", "You do not have permission to change equipment status.");
  if ("error" in scope) return scope;
  if (!await equipmentInScope(scope, parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("set_equipment_status", {
    requested_equipment_id: parsed.data.equipmentId,
    requested_status: parsed.data.status,
    reason: parsed.data.reason || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to change the equipment status. Please try again.") };
  revalidatePath(`/equipment/${parsed.data.equipmentId}`);
  revalidatePath("/equipment");
  return { success: "Equipment status updated." };
}

export async function createEquipmentAssignment(_: EquipmentState, formData: FormData): Promise<EquipmentState> {
  const parsed = equipmentAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the assignment details." };
  const scope = await requireScope("equipment.update", "You do not have permission to assign equipment.");
  if ("error" in scope) return scope;
  if (!await equipmentInScope(scope, parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  if (parsed.data.workerId) {
    const { data: worker } = await scope.workspace.supabase
      .from("workers")
      .select("id")
      .eq("id", parsed.data.workerId)
      .eq("organization_id", scope.organizationId)
      .eq("mine_site_id", scope.siteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!worker) return { error: "That operator is not registered at the active mine site." };
  }
  const { error } = await scope.workspace.supabase.from("equipment_assignments").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    equipment_id: parsed.data.equipmentId,
    worker_id: parsed.data.workerId || null,
    assignment_name: parsed.data.assignmentName,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the assignment. Please try again." };
  revalidatePath(`/equipment/${parsed.data.equipmentId}`);
  return { success: "Assignment recorded." };
}

export async function updateEquipment(_: EquipmentState, formData: FormData): Promise<EquipmentState> {
  const parsed = equipmentEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the equipment details." };
  const scope = await requireScope("equipment.update", "You do not have permission to edit equipment.");
  if ("error" in scope) return scope;
  if (!await equipmentInScope(scope, parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  // current_meter is deliberately not editable here: it is owned by record_equipment_meter_reading(),
  // which keeps it monotonic and writes the matching reading.
  const { error } = await scope.workspace.supabase
    .from("equipment")
    .update({
      name: parsed.data.name,
      asset_code: parsed.data.assetCode || null,
      category: parsed.data.category,
      make: parsed.data.make || null,
      model: parsed.data.model || null,
      serial_number: parsed.data.serialNumber || null,
      year_of_manufacture: parsed.data.yearOfManufacture ?? null,
      meter_type: parsed.data.meterType,
      acquired_on: parsed.data.acquiredOn || null,
      notes: parsed.data.notes || null,
      updated_by: scope.workspace.user.id,
    })
    .eq("id", parsed.data.equipmentId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId)
    .is("deleted_at", null);
  if (error) return { error: error.code === "23505" ? "That asset code already exists in this organization." : "Unable to save the changes. Please try again." };
  revalidatePath(`/equipment/${parsed.data.equipmentId}`);
  revalidatePath("/equipment");
  return { success: "Equipment updated." };
}

/** Soft delete, so meter readings, status history, and fuel issues against this asset stay meaningful. */
export async function removeEquipment(_: EquipmentState, formData: FormData): Promise<EquipmentState> {
  const parsed = equipmentRemovalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confirm the removal." };
  const scope = await requireScope("equipment.update", "You do not have permission to remove equipment.");
  if ("error" in scope) return scope;

  const { data: item } = await scope.workspace.supabase
    .from("equipment").select("id, name")
    .eq("id", parsed.data.equipmentId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) return { error: "That equipment is not registered at the active mine site." };
  if (item.name.trim().toLowerCase() !== parsed.data.confirmName.toLowerCase()) {
    return { error: "The name you typed does not match this equipment." };
  }

  const { error } = await scope.workspace.supabase
    .from("equipment")
    .update({ deleted_at: new Date().toISOString(), deleted_by: scope.workspace.user.id, updated_by: scope.workspace.user.id })
    .eq("id", parsed.data.equipmentId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId);
  if (error) return { error: "Unable to remove the equipment. Please try again." };
  revalidatePath("/equipment");
  redirect("/equipment");
}
