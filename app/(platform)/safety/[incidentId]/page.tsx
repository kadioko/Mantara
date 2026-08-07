import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import {
  IncidentStatusForm,
  SensitiveDetailsForm,
  SensitiveDetailsPanel,
  type Option,
} from "@/features/safety/safety-forms";
import { categoryLabels, severityLabels, statusLabels } from "@/features/safety/schemas";

export default async function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "safety.read")) redirect("/dashboard");

  const { data: incident } = await workspace.supabase
    .from("safety_incidents")
    .select("id, reference, title, category, severity, status, occurred_at, reported_on, location, summary, people_involved, lost_time_hours, closed_on, reporter:workers(full_name), equipment:equipment(name)")
    .eq("id", incidentId)
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .maybeSingle();
  if (!incident) notFound();

  const [canUpdate, canReadSensitive] = await Promise.all([
    hasPermission(organization.id, "safety.update"),
    hasPermission(organization.id, "safety.read_sensitive"),
  ]);

  // Whether details exist is not itself sensitive; their contents are. This lets the page explain the
  // restriction without disclosing anything to someone who lacks the permission.
  const { data: hasDetails } = await workspace.supabase.rpc("safety_incident_has_details", {
    requested_incident_id: incidentId,
  });

  const [actionsResult, workersResult] = await Promise.all([
    workspace.supabase.from("corrective_actions").select("id, description, due_on, status").eq("incident_id", incidentId).order("due_on", { nullsFirst: false }),
    canReadSensitive
      ? workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);

  const reporter = Array.isArray(incident.reporter) ? incident.reporter[0] : incident.reporter;
  const equipment = Array.isArray(incident.equipment) ? incident.equipment[0] : incident.equipment;
  const workerOptions: Option[] = (workersResult.data ?? []).map((row) => ({ id: row.id, label: row.full_name }));

  const details: Array<[string, string]> = [
    ["Reference", incident.reference || "—"],
    ["Category", categoryLabels[incident.category as keyof typeof categoryLabels] ?? incident.category],
    ["Severity", severityLabels[incident.severity as keyof typeof severityLabels] ?? incident.severity],
    ["Occurred", new Date(incident.occurred_at).toISOString().replace("T", " ").slice(0, 16)],
    ["Location", incident.location || "—"],
    ["Reported by", reporter?.full_name ?? "—"],
    ["Equipment", equipment?.name ?? "—"],
    ["People involved", String(incident.people_involved)],
    ["Lost time (hours)", incident.lost_time_hours === null ? "—" : String(incident.lost_time_hours)],
    ["Closed", incident.closed_on || "—"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/safety" className="text-sm font-semibold text-primary hover:underline">← Back to safety</Link>
        <PageHeader
          title={incident.title}
          description={`${statusLabels[incident.status as keyof typeof statusLabels] ?? incident.status} · ${site.name}`}
          actions={<Badge variant={incident.severity === "low" ? "secondary" : "destructive"}>{severityLabels[incident.severity as keyof typeof severityLabels] ?? incident.severity}</Badge>}
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Incident</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {incident.summary && <p className="mt-4 rounded-lg bg-muted p-3 text-sm">{incident.summary}</p>}
          {canUpdate && <div className="mt-5 border-t pt-5"><IncidentStatusForm incidentId={incident.id} status={incident.status} /></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sensitive details</CardTitle>
          <CardDescription>Personal and medical information, restricted and logged on every access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SensitiveDetailsPanel incidentId={incident.id} hasDetails={hasDetails === true} canRead={canReadSensitive} />
          {canReadSensitive && canUpdate && (
            <div className="border-t pt-5">
              <SensitiveDetailsForm incidentId={incident.id} workers={workerOptions} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Corrective actions</CardTitle></CardHeader>
        <CardContent>
          {actionsResult.data?.length ? (
            <ul className="divide-y">
              {actionsResult.data.map((action) => (
                <li key={action.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium">{action.description}</span>
                  <span className="text-sm text-muted-foreground">{action.due_on ? `Due ${action.due_on}` : "No due date"} · {action.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No corrective actions raised for this incident.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
