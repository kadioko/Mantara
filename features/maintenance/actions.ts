"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScope, rowInScopeHard, rpcMessage, type ActiveScope } from "@/lib/auth/scope";
import {
  maintenanceCostSchema,
  maintenancePartSchema,
  maintenanceRequestSchema,
  maintenanceScheduleSchema,
  workOrderCompletionSchema,
  workOrderSchema,
  workOrderStatusSchema,
} from "./schemas";

export type MaintenanceState = { error?: string; success?: string };

const equipmentInScope = (scope: ActiveScope, equipmentId: string) => rowInScope(scope, "equipment", equipmentId);
const workerInScope = (scope: ActiveScope, workerId: string) => rowInScope(scope, "workers", workerId);
const workOrderInScope = (scope: ActiveScope, workOrderId: string) =>
  rowInScopeHard(scope, "maintenance_work_orders", workOrderId);

export async function createMaintenanceRequest(_: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const parsed = maintenanceRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the request details." };
  const scope = await requireScope("maintenance.create", "You do not have permission to raise maintenance requests.");
  if ("error" in scope) return scope;
  if (parsed.data.equipmentId && !await equipmentInScope(scope, parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  if (parsed.data.reportedByWorkerId && !await workerInScope(scope, parsed.data.reportedByWorkerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("maintenance_requests").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    equipment_id: parsed.data.equipmentId || null,
    title: parsed.data.title,
    description: parsed.data.description || null,
    priority: parsed.data.priority,
    reported_by_worker_id: parsed.data.reportedByWorkerId || null,
    reported_on: parsed.data.reportedOn,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the request. Please try again." };
  revalidatePath("/maintenance");
  return { success: "Maintenance request raised." };
}

export async function createWorkOrder(_: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const parsed = workOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the work order details." };
  const scope = await requireScope("maintenance.create", "You do not have permission to create work orders.");
  if ("error" in scope) return scope;
  if (parsed.data.equipmentId && !await equipmentInScope(scope, parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  if (parsed.data.assignedWorkerId && !await workerInScope(scope, parsed.data.assignedWorkerId)) return { error: "That worker is not registered at the active mine site." };
  if (parsed.data.requestId && !await rowInScopeHard(scope, "maintenance_requests", parsed.data.requestId)) return { error: "That request does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.from("maintenance_work_orders").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    equipment_id: parsed.data.equipmentId || null,
    request_id: parsed.data.requestId || null,
    title: parsed.data.title,
    description: parsed.data.description || null,
    priority: parsed.data.priority,
    assigned_worker_id: parsed.data.assignedWorkerId || null,
    scheduled_for: parsed.data.scheduledFor || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the work order. Please try again." };
  revalidatePath("/maintenance");
  return { success: "Work order created." };
}

export async function updateWorkOrderStatus(_: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const parsed = workOrderStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the status." };
  const scope = await requireScope("maintenance.update", "You do not have permission to update work orders.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase
    .from("maintenance_work_orders")
    .update({ status: parsed.data.status, updated_by: scope.workspace.user.id })
    .eq("id", parsed.data.workOrderId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId);
  if (error) return { error: rpcMessage(error, "Unable to update the work order. Please try again.") };
  revalidatePath(`/maintenance/${parsed.data.workOrderId}`);
  revalidatePath("/maintenance");
  return { success: "Work order updated." };
}

export async function completeWorkOrder(_: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const parsed = workOrderCompletionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the completion details." };
  const scope = await requireScope("maintenance.update", "You do not have permission to complete work orders.");
  if ("error" in scope) return scope;
  if (!await workOrderInScope(scope, parsed.data.workOrderId)) return { error: "That work order does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("complete_work_order", {
    requested_work_order_id: parsed.data.workOrderId,
    service_meter: parsed.data.meterAtService ?? null,
    completion_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to complete the work order. Please try again.") };
  revalidatePath(`/maintenance/${parsed.data.workOrderId}`);
  revalidatePath("/maintenance");
  return { success: "Work order completed and any service schedule rolled forward." };
}

export async function addMaintenancePart(_: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const parsed = maintenancePartSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the part details." };
  const scope = await requireScope("maintenance.update", "You do not have permission to record parts.");
  if ("error" in scope) return scope;
  if (!await workOrderInScope(scope, parsed.data.workOrderId)) return { error: "That work order does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.from("maintenance_parts").insert({
    organization_id: scope.organizationId,
    work_order_id: parsed.data.workOrderId,
    part_name: parsed.data.partName,
    quantity: parsed.data.quantity,
    unit_cost: parsed.data.unitCost ?? null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to record the part. Please try again." };
  revalidatePath(`/maintenance/${parsed.data.workOrderId}`);
  return { success: "Part recorded." };
}

export async function addMaintenanceCost(_: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const parsed = maintenanceCostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the cost details." };
  const scope = await requireScope("maintenance.update", "You do not have permission to record costs.");
  if ("error" in scope) return scope;
  if (!await workOrderInScope(scope, parsed.data.workOrderId)) return { error: "That work order does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.from("maintenance_costs").insert({
    organization_id: scope.organizationId,
    work_order_id: parsed.data.workOrderId,
    cost_type: parsed.data.costType,
    amount: parsed.data.amount,
    description: parsed.data.description || null,
    incurred_on: parsed.data.incurredOn,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to record the cost. Please try again." };
  revalidatePath(`/maintenance/${parsed.data.workOrderId}`);
  return { success: "Cost recorded." };
}

export async function createMaintenanceSchedule(_: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const parsed = maintenanceScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the schedule details." };
  const scope = await requireScope("maintenance.update", "You do not have permission to manage service schedules.");
  if ("error" in scope) return scope;
  if (!await equipmentInScope(scope, parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("maintenance_schedules").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    equipment_id: parsed.data.equipmentId,
    name: parsed.data.name,
    interval_meter: parsed.data.intervalMeter ?? null,
    interval_days: parsed.data.intervalDays ?? null,
    next_due_on: parsed.data.nextDueOn || null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the service schedule. Please try again." };
  revalidatePath("/maintenance");
  return { success: "Service schedule created." };
}
