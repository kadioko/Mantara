import Link from "next/link";
import { Panel } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import {
  MaintenanceRequestForm,
  MaintenanceScheduleForm,
  WorkOrderForm,
  type Option,
} from "@/features/maintenance/maintenance-forms";
import { priorityLabels, requestStatusLabels, workOrderStatusLabels } from "@/features/maintenance/schemas";

const statusTone: Record<string, string> = {
  planned: "bg-muted text-foreground",
  in_progress: "bg-warning/15 text-warning-foreground",
  on_hold: "bg-orange-50 text-orange-800",
  completed: "bg-success/12 text-primary",
  cancelled: "bg-muted text-muted-foreground",
};

const priorityTone: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-accent-foreground",
  critical: "text-destructive",
};

export default async function MaintenancePage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "maintenance.read")) redirect("/dashboard");

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission(organization.id, "maintenance.create"),
    hasPermission(organization.id, "maintenance.update"),
  ]);

  const [ordersResult, requestsResult, schedulesResult, equipmentResult, workersResult] = await Promise.all([
    workspace.supabase.from("maintenance_work_orders").select("id, title, status, priority, scheduled_for, equipment:equipment(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("created_at", { ascending: false }).limit(50),
    workspace.supabase.from("maintenance_requests").select("id, title, status, priority, reported_on, equipment:equipment(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("reported_on", { ascending: false }).limit(50),
    workspace.supabase.from("maintenance_schedules").select("id, name, next_due_on, next_due_meter, interval_meter, interval_days, equipment:equipment(name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("is_active", true).order("next_due_on", { nullsFirst: false }),
    canCreate || canUpdate
      ? workspace.supabase.from("equipment").select("id, name").eq("organization_id", organization.id).eq("mine_site_id", site.id).is("deleted_at", null).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    canCreate
      ? workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);
  if (ordersResult.error) throw new Error("Unable to load work orders.");

  const orders = ordersResult.data ?? [];
  const requests = requestsResult.data ?? [];
  const equipmentOptions: Option[] = (equipmentResult.data ?? []).map((item) => ({ id: item.id, label: item.name }));
  const workerOptions: Option[] = (workersResult.data ?? []).map((worker) => ({ id: worker.id, label: worker.full_name }));
  const openRequestOptions: Option[] = requests.filter((request) => request.status === "open").map((request) => ({ id: request.id, label: request.title }));
  const today = new Date().toISOString().slice(0, 10);
  const openOrders = orders.filter((order) => order.status === "planned" || order.status === "in_progress" || order.status === "on_hold").length;
  const overdue = (schedulesResult.data ?? []).filter((schedule) => schedule.next_due_on && schedule.next_due_on < today).length;
  const locale = await getLocale();

  return <div className="space-y-6">
    <div>
      <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "controls")}</p>
      <h1 className="mt-2 text-3xl font-bold">{t(locale, "maintenance")}</h1>
      <p className="mt-2 text-muted-foreground">{t(locale, "maintenanceDescription", { site: site.name })}</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "openWorkOrders")}</p><p className="mt-1 text-2xl font-bold">{openOrders}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "openRequests")}</p><p className="mt-1 text-2xl font-bold">{requests.filter((request) => request.status === "open").length}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "servicesOverdue")}</p><p className="mt-1 text-2xl font-bold">{overdue}</p></div>
    </div>

    {canCreate && <MaintenanceRequestForm equipment={equipmentOptions} workers={workerOptions} today={today} />}
    {canCreate && <WorkOrderForm equipment={equipmentOptions} workers={workerOptions} requests={openRequestOptions} />}

    <Panel title={t(locale, "workOrders")} description={t(locale, "mostRecentFirst")}>
      {orders.length
        ? <ul className="divide-y divide-border">{orders.map((order) => {
            const equipment = Array.isArray(order.equipment) ? order.equipment[0] : order.equipment;
            return <li key={order.id} className="grid gap-2 py-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-center">
              <span className="font-semibold"><Link className="text-primary hover:underline" href={`/maintenance/${order.id}`}>{order.title}</Link></span>
              <span className="text-sm text-muted-foreground">{equipment?.name ?? "No equipment"}</span>
              <span className={`text-sm font-medium ${priorityTone[order.priority] ?? "text-foreground"}`}>{priorityLabels[order.priority as keyof typeof priorityLabels] ?? order.priority}</span>
              <span className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ${statusTone[order.status] ?? "bg-muted text-foreground"}`}>{workOrderStatusLabels[order.status as keyof typeof workOrderStatusLabels] ?? order.status}</span>
            </li>;
          })}</ul>
        : <p className="text-sm text-muted-foreground">No work orders have been created at this site yet.</p>}
    </Panel>

    <Panel title={t(locale, "requests")}>
      {requests.length
        ? <ul className="divide-y divide-border">{requests.map((request) => {
            const equipment = Array.isArray(request.equipment) ? request.equipment[0] : request.equipment;
            return <li key={request.id} className="grid gap-2 py-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-center">
              <span className="font-medium">{request.title}</span>
              <span className="text-sm text-muted-foreground">{equipment?.name ?? "No equipment"}</span>
              <span className={`text-sm font-medium ${priorityTone[request.priority] ?? "text-foreground"}`}>{priorityLabels[request.priority as keyof typeof priorityLabels] ?? request.priority}</span>
              <span className="justify-self-start text-sm text-muted-foreground">{requestStatusLabels[request.status as keyof typeof requestStatusLabels] ?? request.status} · {request.reported_on}</span>
            </li>;
          })}</ul>
        : <p className="text-sm text-muted-foreground">No maintenance requests raised.</p>}
    </Panel>

    <Panel title="Service schedules" description="Completing a work order rolls the matching schedule forward.">
      {canUpdate && <div className="mb-5 border-b border-border pb-5"><MaintenanceScheduleForm equipment={equipmentOptions} /></div>}
      {schedulesResult.data?.length
        ? <ul className="divide-y divide-border">{schedulesResult.data.map((schedule) => {
            const equipment = Array.isArray(schedule.equipment) ? schedule.equipment[0] : schedule.equipment;
            const isOverdue = Boolean(schedule.next_due_on && schedule.next_due_on < today);
            return <li key={schedule.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="font-medium">{schedule.name}<span className="ml-2 text-sm font-normal text-muted-foreground">{equipment?.name ?? ""}</span></span>
              <span className={`text-sm ${isOverdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                {schedule.next_due_on ? `Due ${schedule.next_due_on}` : "No date set"}
                {schedule.next_due_meter === null ? "" : ` · at ${schedule.next_due_meter}`}
                {isOverdue ? " · overdue" : ""}
              </span>
            </li>;
          })}</ul>
        : <p className="text-sm text-muted-foreground">No active service schedules.</p>}
    </Panel>
  </div>;
}
