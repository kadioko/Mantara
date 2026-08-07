import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

export default async function WorkerDetailPage({ params }: { params: Promise<{ workerId: string }> }) {
  const [{ workerId }, workspace, locale] = await Promise.all([params, getActiveWorkspace(), getLocale()]);
  if (!workspace.activeOrganization || !workspace.activeSite || !await hasPermission(workspace.activeOrganization.id, "worker.read")) redirect("/dashboard");
  const { data: worker, error } = await workspace.supabase.from("workers").select("id, full_name, employee_number, phone_number, job_title, employment_type, status, start_date, emergency_contact_name, emergency_contact_phone, notes").eq("id", workerId).eq("organization_id", workspace.activeOrganization.id).eq("mine_site_id", workspace.activeSite.id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("Unable to load worker.");
  if (!worker) notFound();
  const details = [[t(locale, "employeeNumber"), worker.employee_number], [t(locale, "jobTitle"), worker.job_title], [t(locale, "employmentType"), worker.employment_type], [t(locale, "startDate"), worker.start_date], [t(locale, "phoneNumber"), worker.phone_number], [t(locale, "emergencyContactName"), worker.emergency_contact_name], [t(locale, "emergencyContactPhone"), worker.emergency_contact_phone]];
  return <section><p className="text-sm font-semibold tracking-wider text-amber-700">{t(locale, "workerProfile").toUpperCase()}</p><h1 className="mt-2 text-3xl font-bold">{worker.full_name}</h1><p className="mt-2 capitalize text-stone-600">{worker.job_title || t(locale, "noJobTitle")} · {worker.status}</p><div className="mt-8 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-bold">{t(locale, "workerDetails")}</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2">{details.map(([label, value]) => <div key={label}><dt className="text-sm font-semibold text-stone-500">{label}</dt><dd className="mt-1">{value || t(locale, "notProvided")}</dd></div>)}</dl>{worker.notes && <div className="mt-5 border-t border-stone-100 pt-5"><p className="text-sm font-semibold text-stone-500">{t(locale, "notes")}</p><p className="mt-1 whitespace-pre-wrap">{worker.notes}</p></div>}</div></section>;
}
