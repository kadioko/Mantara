import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { likePattern, pageInfo, readPaging, type PageParams } from "@/lib/paging";
import { Pagination, SearchField } from "@/components/ui/pagination";
import { WorkerForm } from "@/features/workers/worker-form";

export default async function WorkersPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization || !workspace.activeSite || !await hasPermission(workspace.activeOrganization.id, "worker.read")) redirect("/dashboard");
  const locale = await getLocale();
  const paging = readPaging(await searchParams);

  let query = workspace.supabase
    .from("workers")
    .select("id, full_name, employee_number, job_title, employment_type, status", { count: "exact" })
    .eq("organization_id", workspace.activeOrganization.id)
    .eq("mine_site_id", workspace.activeSite.id)
    .is("deleted_at", null);
  if (paging.search) {
    const pattern = likePattern(paging.search);
    query = query.or(`full_name.ilike.${pattern},employee_number.ilike.${pattern},job_title.ilike.${pattern}`);
  }

  const { data: workers, count, error } = await query.order("full_name").range(paging.from, paging.to);
  if (error) throw new Error("Unable to load workers.");

  const canCreate = await hasPermission(workspace.activeOrganization.id, "worker.create");
  const info = pageInfo(paging, count ?? 0);

  return <section>
    <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "workforce").toUpperCase()}</p>
    <h1 className="mt-2 text-3xl font-bold">{t(locale, "workers")}</h1>
    <p className="mt-2 text-muted-foreground">{t(locale, "workersDescription", { site: workspace.activeSite.name })}</p>
    {canCreate && <div className="mt-8"><WorkerForm locale={locale} /></div>}
    <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-bold">{t(locale, "workerRegister")}</h2>
          <p className="text-sm text-muted-foreground">{info.total} {t(locale, "activeRecords")}</p>
        </div>
        <SearchField basePath="/workers" search={paging.search} placeholder="Name, number, or job title" />
      </div>
      {workers?.length
        ? <div className="divide-y divide-border">{workers.map((worker) => <article key={worker.id} className="grid gap-1 p-5 md:grid-cols-[2fr_1fr_1fr]">
            <p className="font-semibold"><Link className="text-primary hover:underline" href={`/workers/${worker.id}`}>{worker.full_name}</Link></p>
            <p className="text-sm text-muted-foreground">{worker.job_title || t(locale, "noJobTitle")}</p>
            <p className="text-sm capitalize text-muted-foreground">{worker.employment_type} · {worker.status}</p>
          </article>)}</div>
        : <p className="p-5 text-sm text-muted-foreground">{paging.search ? `No workers match “${paging.search}”.` : t(locale, "noWorkers")}</p>}
      <Pagination basePath="/workers" info={info} search={paging.search} />
    </div>
  </section>;
}
