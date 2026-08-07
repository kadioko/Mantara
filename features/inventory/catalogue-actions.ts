"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScope, rowInScopeHard, rpcMessage, type ActiveScope } from "@/lib/auth/scope";
import {
  catalogueStatusSchema,
  inventoryCategoryEditSchema,
  inventoryItemEditSchema,
  inventoryLocationEditSchema,
  supplierEditSchema,
} from "./schemas";
import type { InventoryState } from "./actions";

/**
 * Corrections to the inventory catalogue.
 *
 * Until now every catalogue in the product was create-only: a supplier entered with a typo, or an
 * item given the wrong reorder level, stayed wrong for the life of the organization. The database
 * has always permitted these updates — only the actions and screens were missing.
 *
 * Every statement narrows by `organization_id` as well as `id`. RLS is the boundary that actually
 * holds, but naming the organization keeps the intent legible at the call site and turns a stray id
 * into a plain "not found" rather than a policy rejection.
 */

const MANAGE_DENIED = "You do not have permission to manage inventory.";

const itemInScope = (scope: ActiveScope, itemId: string) =>
  rowInScope(scope, "inventory_items", itemId, { siteScoped: false });
const locationInScope = (scope: ActiveScope, locationId: string) =>
  rowInScopeHard(scope, "inventory_locations", locationId);

/** The columns every correction sets, so an edited row records who touched it and when. */
const audit = (scope: ActiveScope) => ({
  updated_by: scope.workspace.user.id,
  updated_at: new Date().toISOString(),
});

export async function updateInventoryCategory(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = inventoryCategoryEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the category name." };
  const scope = await requireScope("inventory.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;

  const { error } = await scope.workspace.supabase
    .from("inventory_categories")
    .update({ name: parsed.data.name, ...audit(scope) })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "Another category already uses that name." : rpcMessage(error, "Unable to save the category. Please try again.") };
  }
  revalidatePath("/inventory");
  return { success: "Category updated." };
}

export async function updateInventoryItem(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = inventoryItemEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the item details." };
  const scope = await requireScope("inventory.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;
  if (!await itemInScope(scope, parsed.data.id)) return { error: "That item is not in this organization." };

  const { error } = await scope.workspace.supabase
    .from("inventory_items")
    .update({
      category_id: parsed.data.categoryId || null,
      sku: parsed.data.sku || null,
      name: parsed.data.name,
      unit: parsed.data.unit,
      reorder_level: parsed.data.reorderLevel ?? null,
      notes: parsed.data.notes || null,
      ...audit(scope),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "That SKU already exists in this organization." : rpcMessage(error, "Unable to save the item. Please try again.") };
  }
  revalidatePath("/inventory");
  return { success: "Item updated." };
}

export async function setInventoryItemStatus(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = catalogueStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the item and try again." };
  const scope = await requireScope("inventory.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;
  if (!await itemInScope(scope, parsed.data.id)) return { error: "That item is not in this organization." };

  const { error } = await scope.workspace.supabase
    .from("inventory_items")
    .update({ is_active: parsed.data.isActive, ...audit(scope) })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  // The database refuses to retire an item that still has stock against it, and names the quantity.
  // That message is far more use than a generic failure, so rpcMessage passes it straight through.
  if (error) return { error: rpcMessage(error, "Unable to change the item. Please try again.") };
  revalidatePath("/inventory");
  return { success: parsed.data.isActive ? "Item restored to the catalogue." : "Item retired." };
}

export async function updateInventoryLocation(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = inventoryLocationEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the store details." };
  const scope = await requireScope("inventory.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;
  if (!await locationInScope(scope, parsed.data.id)) return { error: "That store is not at this mine site." };

  const { error } = await scope.workspace.supabase
    .from("inventory_locations")
    .update({ name: parsed.data.name, notes: parsed.data.notes || null, ...audit(scope) })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "Another store at this site already uses that name." : rpcMessage(error, "Unable to save the store. Please try again.") };
  }
  revalidatePath("/inventory");
  return { success: "Store updated." };
}

export async function setInventoryLocationStatus(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = catalogueStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the store and try again." };
  const scope = await requireScope("inventory.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;
  if (!await locationInScope(scope, parsed.data.id)) return { error: "That store is not at this mine site." };

  const { error } = await scope.workspace.supabase
    .from("inventory_locations")
    .update({ is_active: parsed.data.isActive, ...audit(scope) })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) return { error: rpcMessage(error, "Unable to change the store. Please try again.") };
  revalidatePath("/inventory");
  return { success: parsed.data.isActive ? "Store returned to service." : "Store retired." };
}

export async function updateSupplier(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = supplierEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the supplier details." };
  const scope = await requireScope("inventory.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;

  const { error } = await scope.workspace.supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      contact_name: parsed.data.contactName || null,
      phone_number: parsed.data.phoneNumber || null,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
      ...audit(scope),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "Another supplier already uses that name." : rpcMessage(error, "Unable to save the supplier. Please try again.") };
  }
  revalidatePath("/inventory");
  return { success: "Supplier updated." };
}

export async function setSupplierStatus(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = catalogueStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the supplier and try again." };
  const scope = await requireScope("inventory.manage", MANAGE_DENIED);
  if ("error" in scope) return scope;

  const { error } = await scope.workspace.supabase
    .from("suppliers")
    .update({ is_active: parsed.data.isActive, ...audit(scope) })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) return { error: rpcMessage(error, "Unable to change the supplier. Please try again.") };
  revalidatePath("/inventory");
  return { success: parsed.data.isActive ? "Supplier reinstated." : "Supplier retired." };
}
