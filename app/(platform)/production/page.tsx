import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { DowntimeForm, ProductionEntryForm } from "@/features/production/production-forms";
import { productionStatusLabels } from "@/features/production/schemas";

const statusTone: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  submitted: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
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

  return <section>
    <p className="text-sm font-semibold tracking-wider text-amber-700">OPERATIONS</p>
    <h1 className="mt-2 text-3xl font-bold">Production</h1>
    <p className="mt-2 text-stone-600">Production capture and approvals for {site.name}.</p>

    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-stone-500">Approved quantity (last 50)</p><p className="mt-1 text-2xl font-bold">{approvedTotal.toLocaleString()}</p></div>
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-stone-500">Awaiting approval</p><p className="mt-1 text-2xl font-bold">{awaiting}</p></div>
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-stone-500">Entries shown</p><p className="mt-1 text-2xl font-bold">{entries.length}</p></div>
    </div>

    {canCreate && <div className="mt-8"><ProductionEntryForm shifts={shiftOptions} today={new Date().toISOString().slice(0, 10)} /></div>}

    <div className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-5 py-4"><h2 className="font-bold">Production entries</h2><p className="text-sm text-stone-600">Most recent first</p></div>
      {entries.length
        ? <div className="divide-y divide-stone-100">{entries.map((entry) => <article key={entry.id} className="grid gap-2 p-5 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-center">
            <p className="text-sm text-stone-600">{entry.entry_date}</p>
            <p className="font-semibold"><Link className="text-emerald-900 hover:underline" href={`/production/${entry.id}`}>{entry.material}</Link>{entry.location ? <span className="font-normal text-stone-500"> · {entry.location}</span> : null}</p>
            <p className="text-sm text-stone-600">{entry.quantity} {entry.unit}{entry.grade === null ? "" : ` · grade ${entry.grade}`}</p>
            <span className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ${statusTone[entry.status] ?? "bg-stone-100 text-stone-700"}`}>{productionStatusLabels[entry.status as keyof typeof productionStatusLabels] ?? entry.status}</span>
          </article>)}</div>
        : <p className="p-5 text-sm text-stone-600">No production has been captured at this site yet.</p>}
    </div>

    <div className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-5 py-4"><h2 className="font-bold">Downtime</h2><p className="text-sm text-stone-600">Lost operating time recorded against shifts and equipment.</p></div>
      <div className="p-5">
        {canCreate && <div className="mb-5 border-b border-stone-100 pb-5"><DowntimeForm shifts={shiftOptions} equipment={equipmentOptions} /></div>}
        {downtimeResult.data?.length
          ? <ul className="divide-y divide-stone-100">{downtimeResult.data.map((row) => {
              const equipment = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
              return <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span className="font-medium">{row.reason}{equipment?.name ? ` · ${equipment.name}` : ""}</span>
                <span className="text-sm text-stone-600">{row.minutes} min</span>
              </li>;
            })}</ul>
          : <p className="text-sm text-stone-600">No downtime recorded.</p>}
      </div>
    </div>
  </section>;
}
