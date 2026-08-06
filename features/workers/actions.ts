"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { workerSchema } from "./schemas";

export type WorkerState = { error?: string; success?: string };

export async function createWorker(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const parsed = workerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the worker details." };
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization || !workspace.activeSite) return { error: "Select an active organization and mine site first." };
  if (!await hasPermission(workspace.activeOrganization.id, "worker.create")) return { error: "You do not have permission to register workers." };
  const { error: insertError } = await workspace.supabase.from("workers").insert({
    organization_id: workspace.activeOrganization.id,
    mine_site_id: workspace.activeSite.id,
    full_name: parsed.data.fullName,
    employee_number: parsed.data.employeeNumber || null,
    phone_number: parsed.data.phoneNumber || null,
    job_title: parsed.data.jobTitle || null,
    employment_type: parsed.data.employmentType,
    start_date: parsed.data.startDate || null,
    emergency_contact_name: parsed.data.emergencyContactName || null,
    emergency_contact_phone: parsed.data.emergencyContactPhone || null,
    notes: parsed.data.notes || null,
    created_by: workspace.user.id,
    updated_by: workspace.user.id,
  });
  if (insertError) return { error: insertError.code === "23505" ? "That employee number already exists in this organization." : "Unable to save the worker. Please try again." };
  revalidatePath("/workers");
  return { success: "Worker registered." };
}
