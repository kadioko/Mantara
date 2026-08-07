import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { DowntimeForm, ProductionEntryForm } from "@/features/production/production-forms";
import { productionStatusLabels } from "@/features/production/schemas";

const statusTone: Record<string, string> = {
  draft: "bg-muted text-foreground",
  submitted: "bg-warning/15 text-warning-foreground",
  approved: "bg-success/12 text-primary",
  rejected: "bg-destructive/12 text-destructive",
};

export default async function ProductionPage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "production.read")) redirect("/dashboard");

  const canCreate = await hasPermission(organization.id, "production.create");
  const [entriesResult, shiftsResult, downtimeResult, equipmentResult] = await Promise.all([
    workspace.supabase.from("production_entries").select("id, entry_date, material, quantity, unit, grade, status, location").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("entry_date", { ascending: false }).limit(50),
    workspace.supabase.from("shifts").select("id, name, shift_date").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("shift_date", { ascending: false }).limit(30),
    workspace.supabase.from("downtime_records").select("id, reason, minutes, created_at, equipment:equipment(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("created_at", { ascending: false }).limit(15),
    canCreate
      ? workspace.supabase.from("equipment").select("id, name").eq("organization_id", organization.id).eq("mine_site_id", site.id).is("deleted_at", null).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  if (entriesResult.error) throw new Error("Unable to load production entries.");

  const entries = entriesResult.data ?? [];
  const shiftOptions = (shiftsResult.data ?? []).map((shift) => ({ id: shift.id, label: `${shift.shift_date} · ${shift.name}` }));
  const equipmentOptions = (equipmentResult.data ?? []).map((item) => ({ id: item.id, label: item.name }));
  const approvedTotal = entries.filter((entry) => entry.status === "approved").reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const awaiting = entries.filter((entry) => entry.status === "submitted").length;
  const locale = await getLocale();

  return <section>
    <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "operations")}</p>
    <h1 className="mt-2 text-3xl font-bold">{t(locale, "production")}</h1>
    <p className="mt-2 text-muted-foreground">{t(locale, "productionDescription", { site: site.name })}</p>

    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Approved quantity (last 50)</p><p className="mt-1 text-2xl font-bold">{approvedTotal.toLocaleString()}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Awaiting approval</p><p className="mt-1 text-2xl font-bold">{awaiting}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Entries shown</p><p className="mt-1 text-2xl font-bold">{entries.length}</p></div>
    </div>

    {canCreate && <div className="mt-8"><ProductionEntryForm shifts={shiftOptions} today={new Date().toISOString().slice(0, 10)} /></div>}

    <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">{t(locale, "productionEntries")}</h2><p className="text-sm text-muted-foreground">{t(locale, "mostRecentFirst")}</p></div>
      {entries.length
        ? <div className="divide-y divide-border">{entries.map((entry) => <article key={entry.id} className="grid gap-2 p-5 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-center">
            <p className="text-sm text-muted-foreground">{entry.entry_date}</p>
            <p className="font-semibold"><Link className="text-primary hover:underline" href={`/production/${entry.id}`}>{entry.material}</Link>{entry.location ? <span className="font-normal text-muted-foreground"> · {entry.location}</span> : null}</p>
            <p className="text-sm text-muted-foreground">{entry.quantity} {entry.unit}{entry.grade === null ? "" : ` · grade ${entry.grade}`}</p>
            <span className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ${statusTone[entry.status] ?? "bg-muted text-foreground"}`}>{productionStatusLabels[entry.status as keyof typeof productionStatusLabels] ?? entry.status}</span>
          </article>)}</div>
        : <p className="p-5 text-sm text-muted-foreground">No production has been captured at this site yet.</p>}
    </div>

    <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">{t(locale, "downtime")}</h2><p className="text-sm text-muted-foreground">{t(locale, "downtimeDescription")}</p></div>
      <div className="p-5">
        {canCreate && <div className="mb-5 border-b border-border pb-5"><DowntimeForm shifts={shiftOptions} equipment={equipmentOptions} /></div>}
        {downtimeResult.data?.length
          ? <ul className="divide-y divide-border">{downtimeResult.data.map((row) => {
              const equipment = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
              return <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span className="font-medium">{row.reason}{equipment?.name ? ` · ${equipment.name}` : ""}</span>
                <span className="text-sm text-muted-foreground">{row.minutes} min</span>
              </li>;
            })}</ul>
          : <p className="text-sm text-muted-foreground">No downtime recorded.</p>}
      </div>
    </div>
  </section>;
}
