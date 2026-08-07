"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScopeHard, rpcMessage } from "@/lib/auth/scope";
import { fuelLocationEditSchema, fuelLocationStatusSchema } from "./schemas";
import type { FuelState } from "./actions";

/**
 * Corrections to the fuel store register.
 *
 * A tank entered with the wrong capacity or the wrong fuel type was previously permanent. Note that
 * the balance is deliberately not editable here: it is derived from receipts, issues and
 * adjustments, and letting it be typed over would break the reconciliation the whole module exists
 * to provide. Correcting a balance is what a fuel adjustment is for, and that leaves a reason and
 * an author behind it.
 */

const MANAGE_DENIED = "You do not have permission to manage fuel stores.";

export async function updateFuelLocation(_: FuelState, formData: FormData): Promise<FuelState> {
  const parsed = fuelLocationEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fuel store details." };
  const scope = await requireScope("fuel.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;
  if (!await rowInScopeHard(scope, "fuel_storage_locations", parsed.data.id)) {
    return { error: "That fuel store is not at this mine site." };
  }

  const { error } = await scope.workspace.supabase
    .from("fuel_storage_locations")
    .update({
      name: parsed.data.name,
      fuel_type: parsed.data.fuelType,
      capacity_litres: parsed.data.capacityLitres ?? null,
      notes: parsed.data.notes || null,
      updated_by: scope.workspace.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "Another store at this site already uses that name." : rpcMessage(error, "Unable to save the fuel store. Please try again.") };
  }
  revalidatePath("/fuel");
  return { success: "Fuel store updated." };
}

export async function setFuelLocationStatus(_: FuelState, formData: FormData): Promise<FuelState> {
  const parsed = fuelLocationStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the fuel store and try again." };
  const scope = await requireScope("fuel.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;
  if (!await rowInScopeHard(scope, "fuel_storage_locations", parsed.data.id)) {
    return { error: "That fuel store is not at this mine site." };
  }

  const { error } = await scope.workspace.supabase
    .from("fuel_storage_locations")
    .update({ is_active: parsed.data.isActive, updated_by: scope.workspace.user.id, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  // A tank with litres in it cannot be retired; the database says how many, which is the number the
  // operator needs in order to decide what to do about it.
  if (error) return { error: rpcMessage(error, "Unable to change the fuel store. Please try again.") };
  revalidatePath("/fuel");
  return { success: parsed.data.isActive ? "Fuel store returned to service." : "Fuel store retired." };
}
