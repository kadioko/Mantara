import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { WorkerForm } from "@/features/workers/worker-form";

export default async function WorkersPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization || !workspace.activeSite || !await hasPermission(workspace.activeOrganization.id, "worker.read")) redirect("/dashboard");
  const locale = await getLocale();
  const { data: workers, error } = await workspace.supabase.from("workers").select("id, full_name, employee_number, job_title, employment_type, status").eq("organization_id", workspace.activeOrganization.id).eq("mine_site_id", workspace.activeSite.id).is("deleted_at", null).order("full_name");
  if (error) throw new Error("Unable to load workers.");
  const canCreate = await hasPermission(workspace.activeOrganization.id, "worker.create");
  return <section>
    <p className="text-sm font-semibold tracking-wider text-amber-700">{t(locale, "workforce").toUpperCase()}</p>
    <h1 className="mt-2 text-3xl font-bold">{t(locale, "workers")}</h1>
    <p className="mt-2 text-stone-600">{t(locale, "workersDescription", { site: workspace.activeSite.name })}</p>
    {canCreate && <div className="mt-8"><WorkerForm locale={locale} /></div>}
    <div className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-5 py-4">
        <h2 className="font-bold">{t(locale, "workerRegister")}</h2>
        <p className="text-sm text-stone-600">{workers?.length ?? 0} {t(locale, "activeRecords")}</p>
      </div>
      {workers?.length
        ? <div className="divide-y divide-stone-100">{workers.map((worker) => <article key={worker.id} className="grid gap-1 p-5 md:grid-cols-[2fr_1fr_1fr]">
            <p className="font-semibold"><Link className="text-emerald-900 hover:underline" href={`/workers/${worker.id}`}>{worker.full_name}</Link></p>
            <p className="text-sm text-stone-600">{worker.job_title || t(locale, "noJobTitle")}</p>
            <p className="text-sm capitalize text-stone-600">{worker.employment_type} · {worker.status}</p>
          </article>)}</div>
        : <p className="p-5 text-sm text-stone-600">{t(locale, "noWorkers")}</p>}
    </div>
  </section>;
}
