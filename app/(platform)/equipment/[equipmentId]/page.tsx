import Link from "next/link";
import { Panel } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import {
  EquipmentAssignmentForm,
  EquipmentStatusForm,
  MeterReadingForm,
} from "@/features/equipment/equipment-forms";
import { categoryLabels, statusLabels } from "@/features/equipment/schemas";
import { EditEquipmentForm, RemoveEquipmentForm } from "@/features/equipment/equipment-edit-forms";

export default async function EquipmentDetailPage({ params }: { params: Promise<{ equipmentId: string }> }) {
  const { equipmentId } = await params;
  const workspace = await getActiveWorkspace();
  const locale = await getLocale();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "equipment.read")) redirect("/dashboard");

  const { data: item } = await workspace.supabase
    .from("equipment")
    .select("id, name, asset_code, category, make, model, serial_number, year_of_manufacture, status, meter_type, current_meter, acquired_on, notes")
    .eq("id", equipmentId)
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) notFound();

  const canManage = await hasPermission(organization.id, "equipment.update");
  const [readings, history, assignments, workers] = await Promise.all([
    workspace.supabase.from("equipment_meter_readings").select("id, reading_value, reading_at, notes").eq("equipment_id", equipmentId).order("reading_at", { ascending: false }).limit(15),
    workspace.supabase.from("equipment_status_history").select("id, previous_status, new_status, reason, changed_at").eq("equipment_id", equipmentId).order("changed_at", { ascending: false }).limit(15),
    workspace.supabase.from("equipment_assignments").select("id, assignment_name, starts_on, ends_on, worker:workers(full_name)").eq("equipment_id", equipmentId).order("starts_on", { ascending: false }),
    canManage
      ? workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const operators = (workers.data ?? []).map((worker) => ({ id: worker.id, fullName: worker.full_name }));
  const details: Array<[string, string]> = [
    ["Asset code", item.asset_code || "—"],
    ["Category", categoryLabels[item.category as keyof typeof categoryLabels] ?? item.category],
    ["Make and model", [item.make, item.model].filter(Boolean).join(" ") || "—"],
    ["Serial number", item.serial_number || "—"],
    ["Year", item.year_of_manufacture ? String(item.year_of_manufacture) : "—"],
    ["Current meter", item.current_meter === null ? "Not recorded" : `${item.current_meter} ${item.meter_type}`],
    ["Acquired", item.acquired_on || "—"],
    ["Status", statusLabels[item.status as keyof typeof statusLabels] ?? item.status],
  ];

  return <div className="space-y-6">
    <div>
      <Link href="/equipment" className="text-sm font-semibold text-primary hover:underline">← Back to equipment</Link>
      <h1 className="mt-2 text-3xl font-bold">{item.name}</h1>
      <p className="mt-1 text-muted-foreground">{statusLabels[item.status as keyof typeof statusLabels] ?? item.status} · {site.name}</p>
    </div>

    <Panel title={t(locale, "pDetails")}>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {details.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
      </dl>
      {item.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-foreground">{item.notes}</p>}
      {canManage && <div className="mt-5 space-y-5 border-t border-border pt-5">
        <EditEquipmentForm equipment={item} />
        <div className="border-t border-border pt-5"><RemoveEquipmentForm equipmentId={item.id} equipmentName={item.name} /></div>
      </div>}
    </Panel>

    <Panel title={t(locale, "pMeterReadings")} description={t(locale, "pMeterForward")}>
      {canManage && <div className="mb-5 border-b border-border pb-5"><MeterReadingForm equipmentId={item.id} meterType={item.meter_type} currentMeter={item.current_meter} today={today} /></div>}
      {readings.data?.length
        ? <ul className="divide-y divide-border">{readings.data.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-medium">{row.reading_value} {item.meter_type}</span><span className="text-sm text-muted-foreground">{new Date(row.reading_at).toISOString().slice(0, 10)}{row.notes ? ` · ${row.notes}` : ""}</span></li>)}</ul>
        : <p className="text-sm text-muted-foreground">No meter readings recorded.</p>}
    </Panel>

    <Panel title={t(locale, "pStatus")} description={t(locale, "pStatusRecorded")}>
      {canManage && <div className="mb-5 border-b border-border pb-5"><EquipmentStatusForm equipmentId={item.id} status={item.status} /></div>}
      {history.data?.length
        ? <ul className="divide-y divide-border">{history.data.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-medium">{row.previous_status ? `${statusLabels[row.previous_status as keyof typeof statusLabels] ?? row.previous_status} → ` : ""}{statusLabels[row.new_status as keyof typeof statusLabels] ?? row.new_status}</span><span className="text-sm text-muted-foreground">{new Date(row.changed_at).toISOString().slice(0, 10)}{row.reason ? ` · ${row.reason}` : ""}</span></li>)}</ul>
        : <p className="text-sm text-muted-foreground">No status changes recorded.</p>}
    </Panel>

    <Panel title={t(locale, "pAssignments")} description={t(locale, "pWhereAssetDeployed")}>
      {canManage && <div className="mb-5 border-b border-border pb-5"><EquipmentAssignmentForm equipmentId={item.id} workers={operators} today={today} /></div>}
      {assignments.data?.length
        ? <ul className="divide-y divide-border">{assignments.data.map((row) => {
            const worker = Array.isArray(row.worker) ? row.worker[0] : row.worker;
            return <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="font-medium">{row.assignment_name || "Assignment"}{worker?.full_name ? ` · ${worker.full_name}` : ""}</span>
              <span className="text-sm text-muted-foreground">{row.starts_on} → {row.ends_on || "ongoing"}</span>
            </li>;
          })}</ul>
        : <p className="text-sm text-muted-foreground">No assignments recorded.</p>}
    </Panel>
  </div>;
}
