"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { attendanceSchema, workerSchema } from "./schemas";

export type WorkerState = { error?: string; success?: string };

export async function createWorker(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const locale = await getLocale();
  const parsed = workerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(locale, "workerInvalid") };
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization || !workspace.activeSite) return { error: t(locale, "workerNoContext") };
  if (!await hasPermission(workspace.activeOrganization.id, "worker.create")) return { error: t(locale, "workerNoPermission") };
  const { error: insertError } = await workspace.supabase.from("workers").insert({ organization_id: workspace.activeOrganization.id, mine_site_id: workspace.activeSite.id, full_name: parsed.data.fullName, employee_number: parsed.data.employeeNumber || null, phone_number: parsed.data.phoneNumber || null, job_title: parsed.data.jobTitle || null, employment_type: parsed.data.employmentType, start_date: parsed.data.startDate || null, emergency_contact_name: parsed.data.emergencyContactName || null, emergency_contact_phone: parsed.data.emergencyContactPhone || null, notes: parsed.data.notes || null, created_by: workspace.user.id, updated_by: workspace.user.id });
  if (insertError) return { error: insertError.code === "23505" ? t(locale, "workerDuplicate") : t(locale, "workerFailed") };
  revalidatePath("/workers");
  return { success: t(locale, "workerCreated") };
}

export async function recordAttendance(_: WorkerState, formData: FormData): Promise<WorkerState> {
  const locale = await getLocale();
  const parsed = attendanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(locale, "attendanceInvalid") };
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization || !workspace.activeSite) return { error: t(locale, "workerNoContext") };
  if (!await hasPermission(workspace.activeOrganization.id, "worker.update")) return { error: t(locale, "attendanceNoPermission") };
  const { data: worker } = await workspace.supabase.from("workers").select("id").eq("id", parsed.data.workerId).eq("organization_id", workspace.activeOrganization.id).eq("mine_site_id", workspace.activeSite.id).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (!worker) return { error: t(locale, "attendanceWorkerInvalid") };
  const { data: existing, error: existingError } = await workspace.supabase.from("attendance_records").select("id").eq("worker_id", worker.id).eq("attendance_date", parsed.data.attendanceDate).maybeSingle();
  if (existingError) return { error: t(locale, "attendanceFailed") };
  const values = { status: parsed.data.status, notes: parsed.data.notes || null, updated_by: workspace.user.id };
  const { error } = existing
    ? await workspace.supabase.from("attendance_records").update(values).eq("id", existing.id)
    : await workspace.supabase.from("attendance_records").insert({ ...values, organization_id: workspace.activeOrganization.id, mine_site_id: workspace.activeSite.id, worker_id: worker.id, attendance_date: parsed.data.attendanceDate, created_by: workspace.user.id });
  if (error) return { error: t(locale, "attendanceFailed") };
  revalidatePath("/attendance");
  revalidatePath(`/workers/${worker.id}`);
  return { success: t(locale, "attendanceRecorded") };
}
