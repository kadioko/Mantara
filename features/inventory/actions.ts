"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScope, rowInScopeHard, rpcMessage, type ActiveScope } from "@/lib/auth/scope";
import {
  inventoryCategorySchema,
  inventoryItemSchema,
  inventoryLocationSchema,
  stockAdjustmentSchema,
  stockIssueSchema,
  stockReceiptSchema,
  stockTransferSchema,
  supplierSchema,
} from "./schemas";

export type InventoryState = { error?: string; success?: string };

/** Items, categories, and suppliers are organization-wide; stores are site-scoped. */
const itemInScope = (scope: ActiveScope, itemId: string) => rowInScope(scope, "inventory_items", itemId, { siteScoped: false });
const locationInScope = (scope: ActiveScope, locationId: string) => rowInScopeHard(scope, "inventory_locations", locationId);

export async function createInventoryCategory(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = inventoryCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the category name." };
  const scope = await requireScope("inventory.manage", "You do not have permission to manage inventory.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("inventory_categories").insert({
    organization_id: scope.organizationId,
    name: parsed.data.name,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That category already exists." : "Unable to save the category. Please try again." };
  revalidatePath("/inventory");
  return { success: "Category created." };
}

export async function createInventoryItem(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = inventoryItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the item details." };
  const scope = await requireScope("inventory.manage", "You do not have permission to manage inventory.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("inventory_items").insert({
    organization_id: scope.organizationId,
    category_id: parsed.data.categoryId || null,
    sku: parsed.data.sku || null,
    name: parsed.data.name,
    unit: parsed.data.unit,
    reorder_level: parsed.data.reorderLevel ?? null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That SKU already exists in this organization." : "Unable to save the item. Please try again." };
  revalidatePath("/inventory");
  return { success: "Item added to the catalogue." };
}

export async function createInventoryLocation(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = inventoryLocationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the store details." };
  const scope = await requireScope("inventory.manage", "You do not have permission to manage inventory.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("inventory_locations").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    name: parsed.data.name,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "A store with that name already exists at this site." : "Unable to save the store. Please try again." };
  revalidatePath("/inventory");
  return { success: "Store created." };
}

export async function createSupplier(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the supplier details." };
  const scope = await requireScope("inventory.manage", "You do not have permission to manage inventory.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("suppliers").insert({
    organization_id: scope.organizationId,
    name: parsed.data.name,
    contact_name: parsed.data.contactName || null,
    phone_number: parsed.data.phoneNumber || null,
    email: parsed.data.email || null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That supplier already exists." : "Unable to save the supplier. Please try again." };
  revalidatePath("/inventory");
  return { success: "Supplier created." };
}

export async function recordStockReceipt(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = stockReceiptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the receipt details." };
  const scope = await requireScope("inventory.receive", "You do not have permission to receive stock.");
  if ("error" in scope) return scope;
  if (!await itemInScope(scope, parsed.data.itemId)) return { error: "That item is not in this organization's catalogue." };
  if (!await locationInScope(scope, parsed.data.locationId)) return { error: "That store is not at the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("record_stock_receipt", {
    requested_item_id: parsed.data.itemId,
    requested_location_id: parsed.data.locationId,
    quantity: parsed.data.quantity,
    requested_supplier_id: parsed.data.supplierId || null,
    unit_cost: parsed.data.unitCost ?? null,
    reference: parsed.data.reference || null,
    received_on: parsed.data.receivedOn,
    receipt_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the receipt. Please try again.") };
  revalidatePath("/inventory");
  return { success: `Received ${parsed.data.quantity}.` };
}

export async function recordStockIssue(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = stockIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the issue details." };
  const scope = await requireScope("inventory.issue", "You do not have permission to issue stock.");
  if ("error" in scope) return scope;
  if (!await itemInScope(scope, parsed.data.itemId)) return { error: "That item is not in this organization's catalogue." };
  if (!await locationInScope(scope, parsed.data.locationId)) return { error: "That store is not at the active mine site." };
  if (parsed.data.equipmentId && !await rowInScope(scope, "equipment", parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  if (parsed.data.workerId && !await rowInScope(scope, "workers", parsed.data.workerId)) return { error: "That worker is not registered at the active mine site." };
  if (parsed.data.workOrderId && !await rowInScopeHard(scope, "maintenance_work_orders", parsed.data.workOrderId)) return { error: "That work order does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("record_stock_issue", {
    requested_item_id: parsed.data.itemId,
    requested_location_id: parsed.data.locationId,
    quantity: parsed.data.quantity,
    requested_work_order_id: parsed.data.workOrderId || null,
    requested_equipment_id: parsed.data.equipmentId || null,
    requested_worker_id: parsed.data.workerId || null,
    reason: parsed.data.reason,
    issued_on: parsed.data.issuedOn,
    issue_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the issue. Please try again.") };
  revalidatePath("/inventory");
  return { success: `Issued ${parsed.data.quantity}.` };
}

export async function recordStockTransfer(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = stockTransferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the transfer details." };
  const scope = await requireScope("inventory.transfer", "You do not have permission to transfer stock.");
  if ("error" in scope) return scope;
  if (!await itemInScope(scope, parsed.data.itemId)) return { error: "That item is not in this organization's catalogue." };
  if (!await locationInScope(scope, parsed.data.fromLocationId)) return { error: "The source store is not at the active mine site." };
  if (!await locationInScope(scope, parsed.data.toLocationId)) return { error: "The destination store is not at the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("record_stock_transfer", {
    requested_item_id: parsed.data.itemId,
    from_location_id: parsed.data.fromLocationId,
    to_location_id: parsed.data.toLocationId,
    quantity: parsed.data.quantity,
    transferred_on: parsed.data.transferredOn,
    transfer_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the transfer. Please try again.") };
  revalidatePath("/inventory");
  return { success: `Transferred ${parsed.data.quantity}.` };
}

export async function recordStockAdjustment(_: InventoryState, formData: FormData): Promise<InventoryState> {
  const parsed = stockAdjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the adjustment details." };
  const scope = await requireScope("inventory.adjust", "You do not have permission to adjust stock.");
  if ("error" in scope) return scope;
  if (!await itemInScope(scope, parsed.data.itemId)) return { error: "That item is not in this organization's catalogue." };
  if (!await locationInScope(scope, parsed.data.locationId)) return { error: "That store is not at the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("record_stock_adjustment", {
    requested_item_id: parsed.data.itemId,
    requested_location_id: parsed.data.locationId,
    quantity_delta: parsed.data.quantityDelta,
    explanation: parsed.data.explanation,
    reason: parsed.data.reason,
    adjusted_on: parsed.data.adjustedOn,
    adjustment_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the adjustment. Please try again.") };
  revalidatePath("/inventory");
  return { success: "Stock adjustment recorded." };
}
