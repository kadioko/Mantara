import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { EquipmentForm } from "@/features/equipment/equipment-forms";
import { categoryLabels, statusLabels } from "@/features/equipment/schemas";

const statusTone: Record<string, string> = {
  operational: "bg-emerald-50 text-emerald-800",
  standby: "bg-stone-100 text-stone-700",
  maintenance: "bg-amber-50 text-amber-800",
  breakdown: "bg-red-50 text-red-700",
  retired: "bg-stone-100 text-stone-500",
};

export default async function EquipmentPage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "equipment.read")) redirect("/dashboard");

  const { data: equipment, error } = await workspace.supabase
    .from("equipment")
    .select("id, name, asset_code, category, status, meter_type, current_meter")
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error("Unable to load equipment.");

  const canCreate = await hasPermission(organization.id, "equipment.create");

  return <section>
    <p className="text-sm font-semibold tracking-wider text-amber-700">ASSETS</p>
    <h1 className="mt-2 text-3xl font-bold">Equipment</h1>
    <p className="mt-2 text-stone-600">Machines and vehicles registered to {site.name}.</p>
    {canCreate && <div className="mt-8"><EquipmentForm /></div>}
    <div className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-5 py-4">
        <h2 className="font-bold">Equipment register</h2>
        <p className="text-sm text-stone-600">{equipment?.length ?? 0} asset{equipment?.length === 1 ? "" : "s"}</p>
      </div>
      {equipment?.length
        ? <div className="divide-y divide-stone-100">{equipment.map((item) => <article key={item.id} className="grid gap-2 p-5 md:grid-cols-[2fr_1fr_1fr_auto] md:items-center">
            <div>
              <p className="font-semibold"><Link className="text-emerald-900 hover:underline" href={`/equipment/${item.id}`}>{item.name}</Link></p>
              {item.asset_code && <p className="text-sm text-stone-500">{item.asset_code}</p>}
            </div>
            <p className="text-sm text-stone-600">{categoryLabels[item.category as keyof typeof categoryLabels] ?? item.category}</p>
            <p className="text-sm text-stone-600">{item.current_meter === null ? "No meter reading" : `${item.current_meter} ${item.meter_type}`}</p>
            <span className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ${statusTone[item.status] ?? "bg-stone-100 text-stone-700"}`}>{statusLabels[item.status as keyof typeof statusLabels] ?? item.status}</span>
          </article>)}</div>
        : <p className="p-5 text-sm text-stone-600">No equipment is registered at this site yet.</p>}
    </div>
  </section>;
}
