"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScope, type ActiveScope } from "@/lib/auth/scope";
import {
  assignmentSchema,
  attendanceRosterSchema,
  ppeIssueSchema,
  trainingSchema,
  workerSchema,
  workerStatusUpdateSchema,
} from "./schemas";

export type WorkerState = { error?: string; success?: string };

const workerInScope = (scope: ActiveScope, workerId: string) => rowInScope(scope, "workers", workerId);

export async function createWorker(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const parsed = workerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the worker details." };
  const scope = await requireScope("worker.create", "You do not have permission to register workers.");
  if ("error" in scope) return scope;
  const { error: insertError } = await scope.workspace.supabase.from("workers").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    full_name: parsed.data.fullName,
    employee_number: parsed.data.employeeNumber || null,
    phone_number: parsed.data.phoneNumber || null,
    job_title: parsed.data.jobTitle || null,
    employment_type: parsed.data.employmentType,
    start_date: parsed.data.startDate || null,
    emergency_contact_name: parsed.data.emergencyContactName || null,
    emergency_contact_phone: parsed.data.emergencyContactPhone || null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (insertError) return { error: insertError.code === "23505" ? "That employee number already exists in this organization." : "Unable to save the worker. Please try again." };
  revalidatePath("/workers");
  return { success: "Worker registered." };
}

export async function saveAttendance(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const entries = [...formData.entries()]
    .filter(([key, value]) => key.startsWith("status_") && value !== "")
    .map(([key, value]) => ({ workerId: key.slice("status_".length), status: value }));
  const parsed = attendanceRosterSchema.safeParse({ date: formData.get("date"), entries });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the attendance details." };
  const scope = await requireScope("worker.update", "You do not have permission to record attendance.");
  if ("error" in scope) return scope;
  const { data: siteWorkers, error: workersError } = await scope.workspace.supabase
    .from("workers")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId)
    .is("deleted_at", null);
  if (workersError) return { error: "Unable to load workers for this site." };
  const allowed = new Set((siteWorkers ?? []).map((worker) => worker.id));
  const rows = parsed.data.entries.filter((entry) => allowed.has(entry.workerId)).map((entry) => ({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    worker_id: entry.workerId,
    attendance_date: parsed.data.date,
    status: entry.status,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  }));
  if (!rows.length) return { error: "No workers at this site matched the attendance you submitted." };
  const { error: upsertError } = await scope.workspace.supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "worker_id,attendance_date" });
  if (upsertError) return { error: "Unable to save attendance. Please try again." };
  revalidatePath("/attendance");
  return { success: `Attendance saved for ${rows.length} worker${rows.length === 1 ? "" : "s"} on ${parsed.data.date}.` };
}

export async function updateWorkerStatus(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const parsed = workerStatusUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the worker status." };
  const scope = await requireScope("worker.update", "You do not have permission to change worker status.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase
    .from("workers")
    .update({ status: parsed.data.status, updated_by: scope.workspace.user.id })
    .eq("id", parsed.data.workerId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId)
    .is("deleted_at", null);
  if (error) return { error: "Unable to update the worker status. Please try again." };
  revalidatePath(`/workers/${parsed.data.workerId}`);
  revalidatePath("/workers");
  return { success: "Worker status updated." };
}

export async function createAssignment(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the assignment details." };
  const scope = await requireScope("worker.update", "You do not have permission to manage assignments.");
  if ("error" in scope) return scope;
  if (!await workerInScope(scope, parsed.data.workerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("worker_assignments").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    worker_id: parsed.data.workerId,
    assignment_name: parsed.data.assignmentName,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the assignment. Please try again." };
  revalidatePath(`/workers/${parsed.data.workerId}`);
  return { success: "Assignment recorded." };
}

export async function createTraining(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const parsed = trainingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the training details." };
  const scope = await requireScope("worker.update", "You do not have permission to manage training records.");
  if ("error" in scope) return scope;
  if (!await workerInScope(scope, parsed.data.workerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("training_records").insert({
    organization_id: scope.organizationId,
    worker_id: parsed.data.workerId,
    training_name: parsed.data.trainingName,
    completed_on: parsed.data.completedOn,
    expires_on: parsed.data.expiresOn || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the training record. Please try again." };
  revalidatePath(`/workers/${parsed.data.workerId}`);
  return { success: "Training recorded." };
}

export async function issuePpe(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const parsed = ppeIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the PPE details." };
  const scope = await requireScope("worker.update", "You do not have permission to issue PPE.");
  if ("error" in scope) return scope;
  if (!await workerInScope(scope, parsed.data.workerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("ppe_issues").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    worker_id: parsed.data.workerId,
    item_name: parsed.data.itemName,
    quantity: parsed.data.quantity,
    issued_on: parsed.data.issuedOn,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to record the PPE issue. Please try again." };
  revalidatePath(`/workers/${parsed.data.workerId}`);
  return { success: "PPE issue recorded." };
}
