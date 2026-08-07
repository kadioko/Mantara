"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScope, rowInScopeHard, rpcMessage } from "@/lib/auth/scope";
import { complianceTaskSchema, completeTaskSchema, licenceSchema, requirementSchema } from "./schemas";

export type ComplianceState = { error?: string; success?: string };

export async function createLicence(_: ComplianceState, formData: FormData): Promise<ComplianceState> {
  const parsed = licenceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the licence details." };
  const scope = await requireScope("compliance.create", "You do not have permission to record licences.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("mineral_licences").insert({
    organization_id: scope.organizationId,
    // A licence can cover the whole organization or one site; the operator chooses.
    mine_site_id: parsed.data.siteScoped ? scope.siteId : null,
    licence_number: parsed.data.licenceNumber,
    licence_type: parsed.data.licenceType,
    issuing_authority: parsed.data.issuingAuthority || null,
    holder_name: parsed.data.holderName || null,
    issued_on: parsed.data.issuedOn || null,
    expires_on: parsed.data.expiresOn || null,
    status: parsed.data.status,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That licence number already exists in this organization." : "Unable to save the licence. Please try again." };
  revalidatePath("/compliance");
  return { success: "Licence recorded." };
}

export async function createRequirement(_: ComplianceState, formData: FormData): Promise<ComplianceState> {
  const parsed = requirementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the requirement details." };
  const scope = await requireScope("compliance.create", "You do not have permission to manage requirements.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("compliance_requirements").insert({
    organization_id: scope.organizationId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    category: parsed.data.category || null,
    recurrence: parsed.data.recurrence,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That requirement already exists." : "Unable to save the requirement. Please try again." };
  revalidatePath("/compliance");
  return { success: "Requirement added." };
}

export async function createComplianceTask(_: ComplianceState, formData: FormData): Promise<ComplianceState> {
  const parsed = complianceTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the task details." };
  const scope = await requireScope("compliance.create", "You do not have permission to schedule compliance tasks.");
  if ("error" in scope) return scope;
  if (parsed.data.requirementId && !await rowInScopeHard(scope, "compliance_requirements", parsed.data.requirementId, { siteScoped: false })) return { error: "That requirement does not belong to this organization." };
  if (parsed.data.licenceId && !await rowInScope(scope, "mineral_licences", parsed.data.licenceId, { siteScoped: false })) return { error: "That licence does not belong to this organization." };
  if (parsed.data.assignedWorkerId && !await rowInScope(scope, "workers", parsed.data.assignedWorkerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("compliance_tasks").insert({
    organization_id: scope.organizationId,
    mine_site_id: parsed.data.siteScoped ? scope.siteId : null,
    requirement_id: parsed.data.requirementId || null,
    licence_id: parsed.data.licenceId || null,
    title: parsed.data.title,
    details: parsed.data.details || null,
    due_on: parsed.data.dueOn,
    assigned_worker_id: parsed.data.assignedWorkerId || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the task. Please try again." };
  revalidatePath("/compliance");
  return { success: "Compliance task scheduled." };
}

export async function completeComplianceTask(_: ComplianceState, formData: FormData): Promise<ComplianceState> {
  const parsed = completeTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the completion details." };
  const scope = await requireScope("compliance.update", "You do not have permission to complete compliance tasks.");
  if ("error" in scope) return scope;
  const { data, error } = await scope.workspace.supabase.rpc("complete_compliance_task", {
    requested_task_id: parsed.data.taskId,
    notes: parsed.data.notes || null,
    completed_date: parsed.data.completedOn,
  });
  if (error) return { error: rpcMessage(error, "Unable to complete the task. Please try again.") };
  revalidatePath("/compliance");
  return { success: data ? "Task completed, and the next one has been scheduled." : "Task completed." };
}
