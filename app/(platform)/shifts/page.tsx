import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { ShiftForm } from "@/features/production/production-forms";
import { shiftStatusLabels } from "@/features/production/schemas";

export default async function ShiftsPage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "production.read")) redirect("/dashboard");

  const { data: shifts, error } = await workspace.supabase
    .from("shifts")
    .select("id, name, shift_date, status, starts_at, ends_at, supervisor:workers(full_name)")
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .order("shift_date", { ascending: false })
    .limit(60);
  if (error) throw new Error("Unable to load shifts.");

  const canCreate = await hasPermission(organization.id, "production.create");
  const supervisors = canCreate
    ? (await workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")).data ?? []
    : [];
  const locale = await getLocale();

  return <section>
    <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "operations")}</p>
    <h1 className="mt-2 text-3xl font-bold">{t(locale, "shifts")}</h1>
    <p className="mt-2 text-muted-foreground">{t(locale, "shiftsDescription", { site: site.name })}</p>
    {canCreate && <div className="mt-8"><ShiftForm supervisors={supervisors.map((worker) => ({ id: worker.id, label: worker.full_name }))} today={new Date().toISOString().slice(0, 10)} /></div>}
    <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">{t(locale, "recentShifts")}</h2><p className="text-sm text-muted-foreground">{shifts?.length ?? 0} {t(locale, "shifts").toLowerCase()}</p></div>
      {shifts?.length
        ? <div className="divide-y divide-border">{shifts.map((shift) => {
            const supervisor = Array.isArray(shift.supervisor) ? shift.supervisor[0] : shift.supervisor;
            return <article key={shift.id} className="grid gap-2 p-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
              <p className="font-semibold">{shift.name}</p>
              <p className="text-sm text-muted-foreground">{shift.shift_date}</p>
              <p className="text-sm text-muted-foreground">{supervisor?.full_name ?? "No supervisor"}</p>
              <span className="justify-self-start rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">{shiftStatusLabels[shift.status as keyof typeof shiftStatusLabels] ?? shift.status}</span>
            </article>;
          })}</div>
        : <p className="p-5 text-sm text-muted-foreground">{t(locale, "noShifts")}</p>}
    </div>
  </section>;
}
