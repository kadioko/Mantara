import Link from "next/link";
import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CorrectiveActionForm,
  CorrectiveActionStatusForm,
  IncidentForm,
  InspectionForm,
  type Option,
} from "@/features/safety/safety-forms";
import { actionStatusLabels, categoryLabels, severityLabels, statusLabels } from "@/features/safety/schemas";

const severityTone: Record<string, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
  critical: "destructive",
};

export default async function SafetyPage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "safety.read")) redirect("/dashboard");

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission(organization.id, "safety.create"),
    hasPermission(organization.id, "safety.update"),
  ]);

  const [incidentsResult, inspectionsResult, actionsResult, workersResult, equipmentResult] = await Promise.all([
    workspace.supabase.from("safety_incidents").select("id, title, category, severity, status, occurred_at, location").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("occurred_at", { ascending: false }).limit(50),
    workspace.supabase.from("safety_inspections").select("id, title, area, inspected_on, is_satisfactory").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("inspected_on", { ascending: false }).limit(25),
    workspace.supabase.from("corrective_actions").select("id, description, due_on, status, assignee:workers(full_name)").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("due_on", { nullsFirst: false }).limit(50),
    canCreate
      ? workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
    canCreate
      ? workspace.supabase.from("equipment").select("id, name").eq("organization_id", organization.id).eq("mine_site_id", site.id).is("deleted_at", null).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  if (incidentsResult.error) throw new Error("Unable to load safety incidents.");

  const incidents = incidentsResult.data ?? [];
  const inspections = inspectionsResult.data ?? [];
  const actions = actionsResult.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const openIncidents = incidents.filter((incident) => incident.status !== "closed");
  const openActions = actions.filter((action) => action.status === "open" || action.status === "in_progress");
  const overdueActions = openActions.filter((action) => action.due_on && action.due_on < today);

  const workerOptions: Option[] = (workersResult.data ?? []).map((row) => ({ id: row.id, label: row.full_name }));
  const equipmentOptions: Option[] = (equipmentResult.data ?? []).map((row) => ({ id: row.id, label: row.name }));
  const incidentOptions: Option[] = incidents.map((row) => ({ id: row.id, label: row.title }));
  const inspectionOptions: Option[] = inspections.map((row) => ({ id: row.id, label: `${row.inspected_on} · ${row.title}` }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk and insight"
        title="Safety"
        description={`Incidents, inspections, and corrective actions at ${site.name}.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open incidents" value={openIncidents.length} tone={openIncidents.length ? "warning" : "default"} />
        <StatCard label="Open corrective actions" value={openActions.length} />
        <StatCard label="Actions overdue" value={overdueActions.length} tone={overdueActions.length ? "destructive" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
          <CardDescription>Personal and medical information is held separately, behind a restricted and logged view.</CardDescription>
        </CardHeader>
        {incidents.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incident</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell>
                    <Link href={`/safety/${incident.id}`} className="font-medium text-primary hover:underline">{incident.title}</Link>
                    {incident.location && <p className="text-xs text-muted-foreground">{incident.location}</p>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{categoryLabels[incident.category as keyof typeof categoryLabels] ?? incident.category}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(incident.occurred_at).toISOString().slice(0, 10)}</TableCell>
                  <TableCell><Badge variant={severityTone[incident.severity] ?? "secondary"}>{severityLabels[incident.severity as keyof typeof severityLabels] ?? incident.severity}</Badge></TableCell>
                  <TableCell><Badge variant={incident.status === "closed" ? "success" : "secondary"}>{statusLabels[incident.status as keyof typeof statusLabels] ?? incident.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent><EmptyState icon={<HardHat className="size-6" aria-hidden />} title="No incidents recorded" description="Reporting near misses as well as injuries gives the clearest picture of site risk." /></CardContent>
        )}
        {canCreate && <CardContent className="border-t"><IncidentForm workers={workerOptions} equipment={equipmentOptions} today={today} /></CardContent>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inspections</CardTitle>
          <CardDescription>Planned and ad-hoc safety inspections.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inspections.length ? (
            <ul className="divide-y">
              {inspections.map((inspection) => (
                <li key={inspection.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium">{inspection.title}{inspection.area && <span className="ml-2 text-sm font-normal text-muted-foreground">{inspection.area}</span>}</span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    {inspection.inspected_on}
                    {inspection.is_satisfactory === null
                      ? <Badge variant="secondary">Not assessed</Badge>
                      : <Badge variant={inspection.is_satisfactory ? "success" : "destructive"}>{inspection.is_satisfactory ? "Satisfactory" : "Not satisfactory"}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No inspections recorded.</p>
          )}
          {canCreate && <div className="border-t pt-4"><InspectionForm workers={workerOptions} today={today} /></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corrective actions</CardTitle>
          <CardDescription>What is being done in response, and by when.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.length ? (
            <ul className="divide-y">
              {actions.map((action) => {
                const assignee = Array.isArray(action.assignee) ? action.assignee[0] : action.assignee;
                const open = action.status === "open" || action.status === "in_progress";
                const overdue = open && action.due_on && action.due_on < today;
                return (
                  <li key={action.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{action.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {action.due_on ? `Due ${action.due_on}` : "No due date"}
                        {overdue && <span className="ml-2 font-semibold text-destructive">overdue</span>}
                        {assignee?.full_name ? ` · ${assignee.full_name}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={action.status === "completed" ? "success" : overdue ? "destructive" : "secondary"}>
                        {actionStatusLabels[action.status as keyof typeof actionStatusLabels] ?? action.status}
                      </Badge>
                      {canUpdate && <CorrectiveActionStatusForm actionId={action.id} status={action.status} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No corrective actions raised.</p>
          )}
          {canUpdate && (
            <div className="border-t pt-4">
              <CorrectiveActionForm incidents={incidentOptions} inspections={inspectionOptions} workers={workerOptions} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
