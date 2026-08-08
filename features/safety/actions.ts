"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScope, rowInScopeHard, rpcMessage } from "@/lib/auth/scope";
import { rateLimitMessage, withinRateLimit } from "@/lib/auth/rate-limit";
import {
  correctiveActionSchema,
  correctiveActionStatusSchema,
  incidentSchema,
  incidentStatusSchema,
  inspectionSchema,
  sensitiveDetailsSchema,
} from "./schemas";

export type SafetyState = { error?: string; success?: string };

export type SensitiveDetails = {
  injured_worker_id: string | null;
  injury_description: string | null;
  medical_notes: string | null;
  personal_details: string | null;
  updated_at: string;
};

export type SensitiveDetailsState = SafetyState & { details?: SensitiveDetails | null; revealed?: boolean };

export async function createIncident(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const parsed = incidentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the incident details." };
  const scope = await requireScope("safety.create", "You do not have permission to report incidents.");
  if ("error" in scope) return scope;
  if (parsed.data.reportedByWorkerId && !await rowInScope(scope, "workers", parsed.data.reportedByWorkerId)) return { error: "That worker is not registered at the active mine site." };
  if (parsed.data.equipmentId && !await rowInScope(scope, "equipment", parsed.data.equipmentId)) return { error: "That equipment is not registered at the active mine site." };
  const occurredAt = parsed.data.occurredTime
    ? new Date(`${parsed.data.occurredOn}T${parsed.data.occurredTime}:00`).toISOString()
    : new Date(`${parsed.data.occurredOn}T12:00:00Z`).toISOString();
  const { error } = await scope.workspace.supabase.from("safety_incidents").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    reference: parsed.data.reference || null,
    title: parsed.data.title,
    category: parsed.data.category,
    severity: parsed.data.severity,
    occurred_at: occurredAt,
    reported_on: parsed.data.occurredOn,
    location: parsed.data.location || null,
    summary: parsed.data.summary || null,
    reported_by_worker_id: parsed.data.reportedByWorkerId || null,
    equipment_id: parsed.data.equipmentId || null,
    people_involved: parsed.data.peopleInvolved ?? 0,
    lost_time_hours: parsed.data.lostTimeHours ?? null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That incident reference already exists." : "Unable to save the incident. Please try again." };
  revalidatePath("/safety");
  return { success: "Incident reported." };
}

export async function updateIncidentStatus(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const parsed = incidentStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the incident status." };
  const scope = await requireScope("safety.update", "You do not have permission to update incidents.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase
    .from("safety_incidents")
    .update({
      status: parsed.data.status,
      closed_on: parsed.data.status === "closed" ? new Date().toISOString().slice(0, 10) : null,
      updated_by: scope.workspace.user.id,
    })
    .eq("id", parsed.data.incidentId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId);
  if (error) return { error: "Unable to update the incident. Please try again." };
  revalidatePath(`/safety/${parsed.data.incidentId}`);
  revalidatePath("/safety");
  return { success: "Incident updated." };
}

/**
 * Reading sensitive details is a privileged, audited act, so it is an explicit user action rather than
 * something the page does on load. The database function records the access and is the only way in.
 */
export async function revealIncidentDetails(_: SensitiveDetailsState, formData: FormData): Promise<SensitiveDetailsState> {
  const incidentId = String(formData.get("incidentId") ?? "");
  const scope = await requireScope("safety.read_sensitive", "You do not have permission to view sensitive incident details.");
  if ("error" in scope) return scope;
  // Bulk-reading medical notes is exactly the pattern worth slowing down, audit trail or not.
  if (!await withinRateLimit("safety.sensitive_read")) return { error: await rateLimitMessage("safety.sensitive_read") };
  const { data, error } = await scope.workspace.supabase.rpc("read_safety_incident_details", {
    requested_incident_id: incidentId,
  });
  if (error) return { error: rpcMessage(error, "Unable to load the details. Please try again.") };
  const details = (Array.isArray(data) ? data[0] : data) as SensitiveDetails | undefined;
  return { revealed: true, details: details ?? null, success: "Access to these details has been recorded in the audit log." };
}

export async function saveIncidentDetails(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const parsed = sensitiveDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const scope = await requireScope("safety.read_sensitive", "You do not have permission to record sensitive incident details.");
  if ("error" in scope) return scope;
  if (parsed.data.injuredWorkerId && !await rowInScope(scope, "workers", parsed.data.injuredWorkerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.rpc("write_safety_incident_details", {
    requested_incident_id: parsed.data.incidentId,
    injured_worker: parsed.data.injuredWorkerId || null,
    injury_description: parsed.data.injuryDescription || null,
    medical_notes: parsed.data.medicalNotes || null,
    personal_details: parsed.data.personalDetails || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to save the details. Please try again.") };
  revalidatePath(`/safety/${parsed.data.incidentId}`);
  return { success: "Sensitive details saved, and the change has been recorded." };
}

export async function createInspection(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const parsed = inspectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the inspection details." };
  const scope = await requireScope("safety.create", "You do not have permission to record inspections.");
  if ("error" in scope) return scope;
  if (parsed.data.inspectorWorkerId && !await rowInScope(scope, "workers", parsed.data.inspectorWorkerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("safety_inspections").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    title: parsed.data.title,
    area: parsed.data.area || null,
    inspected_on: parsed.data.inspectedOn,
    inspector_worker_id: parsed.data.inspectorWorkerId || null,
    findings: parsed.data.findings || null,
    is_satisfactory: parsed.data.isSatisfactory === "yes" ? true : parsed.data.isSatisfactory === "no" ? false : null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the inspection. Please try again." };
  revalidatePath("/safety");
  return { success: "Inspection recorded." };
}

export async function createCorrectiveAction(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const parsed = correctiveActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the action details." };
  const scope = await requireScope("safety.update", "You do not have permission to raise corrective actions.");
  if ("error" in scope) return scope;
  if (parsed.data.incidentId && !await rowInScopeHard(scope, "safety_incidents", parsed.data.incidentId)) return { error: "That incident does not belong to the active mine site." };
  if (parsed.data.inspectionId && !await rowInScopeHard(scope, "safety_inspections", parsed.data.inspectionId)) return { error: "That inspection does not belong to the active mine site." };
  if (parsed.data.assignedWorkerId && !await rowInScope(scope, "workers", parsed.data.assignedWorkerId)) return { error: "That worker is not registered at the active mine site." };
  const { error } = await scope.workspace.supabase.from("corrective_actions").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    incident_id: parsed.data.incidentId || null,
    inspection_id: parsed.data.inspectionId || null,
    description: parsed.data.description,
    assigned_worker_id: parsed.data.assignedWorkerId || null,
    due_on: parsed.data.dueOn || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the corrective action. Please try again." };
  revalidatePath("/safety");
  return { success: "Corrective action raised." };
}

export async function updateCorrectiveAction(_: SafetyState, formData: FormData): Promise<SafetyState> {
  const parsed = correctiveActionStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the action status." };
  const scope = await requireScope("safety.update", "You do not have permission to update corrective actions.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase
    .from("corrective_actions")
    .update({
      status: parsed.data.status,
      completed_on: parsed.data.status === "completed" ? new Date().toISOString().slice(0, 10) : null,
      completion_notes: parsed.data.notes || null,
      updated_by: scope.workspace.user.id,
    })
    .eq("id", parsed.data.actionId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId);
  if (error) return { error: "Unable to update the action. Please try again." };
  revalidatePath("/safety");
  return { success: "Corrective action updated." };
}
