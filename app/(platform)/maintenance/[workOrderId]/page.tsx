import Link from "next/link";
import { Panel } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import {
  CompleteWorkOrderForm,
  MaintenanceCostForm,
  MaintenancePartForm,
  WorkOrderStatusForm,
} from "@/features/maintenance/maintenance-forms";
import {
  allowedWorkOrderTransitions,
  costTypeLabels,
  priorityLabels,
  workOrderStatusLabels,
} from "@/features/maintenance/schemas";

export default async function WorkOrderPage({ params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  const workspace = await getActiveWorkspace();
  const locale = await getLocale();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "maintenance.read")) redirect("/dashboard");

  const { data: order } = await workspace.supabase
    .from("maintenance_work_orders")
    .select("id, title, description, status, priority, scheduled_for, started_at, completed_at, meter_at_service, notes, equipment:equipment!maintenance_work_orders_equipment_id_fkey(name), assignee:workers!maintenance_work_orders_assigned_worker_id_fkey(full_name)")
    .eq("id", workOrderId)
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .maybeSingle();
  if (!order) notFound();

  const [parts, costs] = await Promise.all([
    workspace.supabase.from("maintenance_parts").select("id, part_name, quantity, unit_cost").eq("work_order_id", workOrderId).order("created_at"),
    workspace.supabase.from("maintenance_costs").select("id, cost_type, amount, description, incurred_on").eq("work_order_id", workOrderId).order("incurred_on", { ascending: false }),
  ]);

  const canUpdate = await hasPermission(organization.id, "maintenance.update");
  const equipment = Array.isArray(order.equipment) ? order.equipment[0] : order.equipment;
  const assignee = Array.isArray(order.assignee) ? order.assignee[0] : order.assignee;
  const today = new Date().toISOString().slice(0, 10);
  const totalCost = (costs.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const transitions = allowedWorkOrderTransitions[order.status as keyof typeof allowedWorkOrderTransitions] ?? [];

  const details: Array<[string, string]> = [
    ["Status", workOrderStatusLabels[order.status as keyof typeof workOrderStatusLabels] ?? order.status],
    ["Priority", priorityLabels[order.priority as keyof typeof priorityLabels] ?? order.priority],
    ["Equipment", equipment?.name ?? "—"],
    ["Assigned to", assignee?.full_name ?? "Unassigned"],
    ["Scheduled for", order.scheduled_for || "—"],
    ["Started", order.started_at ? new Date(order.started_at).toISOString().slice(0, 10) : "—"],
    ["Completed", order.completed_at ? new Date(order.completed_at).toISOString().slice(0, 10) : "—"],
    ["Meter at service", order.meter_at_service === null ? "—" : String(order.meter_at_service)],
  ];

  return <div className="space-y-6">
    <div>
      <Link href="/maintenance" className="text-sm font-semibold text-primary hover:underline">← Back to maintenance</Link>
      <h1 className="mt-2 text-3xl font-bold">{order.title}</h1>
      <p className="mt-1 text-muted-foreground">{workOrderStatusLabels[order.status as keyof typeof workOrderStatusLabels] ?? order.status} · {site.name}</p>
    </div>

    <Panel title={t(locale, "pWorkOrder")}>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {details.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
      </dl>
      {order.description && <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-foreground">{order.description}</p>}
      {order.notes && <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-foreground">{order.notes}</p>}
      {canUpdate && transitions.length > 0 && <div className="mt-5 border-t border-border pt-5"><WorkOrderStatusForm workOrderId={order.id} allowed={transitions} /></div>}
    </Panel>

    {canUpdate && order.status === "in_progress" && <Panel title={t(locale, "pComplete")} description={t(locale, "pRecordsServiceMeter")}>
      <CompleteWorkOrderForm workOrderId={order.id} />
    </Panel>}

    <Panel title={t(locale, "pParts")}>
      {canUpdate && <div className="mb-5 border-b border-border pb-5"><MaintenancePartForm workOrderId={order.id} /></div>}
      {parts.data?.length
        ? <ul className="divide-y divide-border">{parts.data.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
            <span className="font-medium">{row.part_name} × {row.quantity}</span>
            <span className="text-sm text-muted-foreground">{row.unit_cost === null ? "No unit cost" : `${row.unit_cost} each`}</span>
          </li>)}</ul>
        : <p className="text-sm text-muted-foreground">{t(locale, "uiNoPartsRecorded")}</p>}
    </Panel>

    <Panel title={t(locale, "pCosts")} description={`Total recorded: ${totalCost.toLocaleString()}`}>
      {canUpdate && <div className="mb-5 border-b border-border pb-5"><MaintenanceCostForm workOrderId={order.id} today={today} /></div>}
      {costs.data?.length
        ? <ul className="divide-y divide-border">{costs.data.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
            <span className="font-medium">{costTypeLabels[row.cost_type as keyof typeof costTypeLabels] ?? row.cost_type}{row.description ? ` · ${row.description}` : ""}</span>
            <span className="text-sm text-muted-foreground">{Number(row.amount).toLocaleString()} · {row.incurred_on}</span>
          </li>)}</ul>
        : <p className="text-sm text-muted-foreground">{t(locale, "uiNoCostsRecorded")}</p>}
    </Panel>
  </div>;
}
