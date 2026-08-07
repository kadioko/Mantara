import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { AttendanceForm } from "@/features/workers/attendance-form";

export default async function AttendancePage() {
  const [workspace, locale] = await Promise.all([getActiveWorkspace(), getLocale()]);
  if (!workspace.activeOrganization || !workspace.activeSite || !await hasPermission(workspace.activeOrganization.id, "worker.read")) redirect("/dashboard");
  const [{ data: workers, error: workersError }, { data: records, error: recordsError }] = await Promise.all([
    workspace.supabase.from("workers").select("id, full_name").eq("organization_id", workspace.activeOrganization.id).eq("mine_site_id", workspace.activeSite.id).eq("status", "active").is("deleted_at", null).order("full_name"),
    workspace.supabase.from("attendance_records").select("id, attendance_date, status, worker:workers(full_name)").eq("organization_id", workspace.activeOrganization.id).eq("mine_site_id", workspace.activeSite.id).order("attendance_date", { ascending: false }).limit(50),
  ]);
  if (workersError || recordsError) throw new Error("Unable to load attendance.");
  const canRecord = await hasPermission(workspace.activeOrganization.id, "worker.update");
  const today = new Date().toISOString().slice(0, 10);
  return <section><p className="text-sm font-semibold tracking-wider text-amber-700">{t(locale, "workforce").toUpperCase()}</p><h1 className="mt-2 text-3xl font-bold">{t(locale, "attendance")}</h1><p className="mt-2 text-stone-600">{t(locale, "attendanceDescription", { site: workspace.activeSite.name })}</p>{canRecord && workers?.length ? <div className="mt-8"><AttendanceForm locale={locale} workers={workers} today={today} /></div> : null}<div className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-200 px-5 py-4"><h2 className="font-bold">{t(locale, "attendance")}</h2></div>{records?.length ? <div className="divide-y divide-stone-100">{records.map((record) => { const worker = Array.isArray(record.worker) ? record.worker[0] : record.worker; return <article key={record.id} className="grid gap-1 p-5 md:grid-cols-[2fr_1fr_1fr]"><p className="font-semibold">{worker?.full_name ?? t(locale, "worker")}</p><p className="text-sm text-stone-600">{record.attendance_date}</p><p className="text-sm capitalize text-stone-600">{record.status}</p></article>; })}</div> : <p className="p-5 text-sm text-stone-600">{t(locale, "noAttendance")}</p>}</div></section>;
}
