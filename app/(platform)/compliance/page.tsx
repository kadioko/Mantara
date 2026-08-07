import { redirect } from "next/navigation";
import { FileCheck2 } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ComplianceTaskForm,
  CompleteTaskForm,
  LicenceForm,
  RequirementForm,
  type Option,
} from "@/features/compliance/compliance-forms";
import { licenceStatusLabels, recurrenceLabels, taskStatusLabels } from "@/features/compliance/schemas";

const EXPIRING_WINDOW_DAYS = 60;

export default async function CompliancePage() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "compliance.read")) redirect("/dashboard");

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission(organization.id, "compliance.create"),
    hasPermission(organization.id, "compliance.update"),
  ]);

  const [licencesResult, requirementsResult, tasksResult, workersResult] = await Promise.all([
    workspace.supabase.from("mineral_licences").select("id, licence_number, licence_type, issuing_authority, expires_on, status, mine_site_id").eq("organization_id", organization.id).is("deleted_at", null).order("expires_on", { nullsFirst: false }),
    workspace.supabase.from("compliance_requirements").select("id, name, category, recurrence").eq("organization_id", organization.id).eq("is_active", true).order("name"),
    workspace.supabase.from("compliance_tasks").select("id, title, due_on, status, completed_on, requirement:compliance_requirements(name, recurrence), assignee:workers(full_name)").eq("organization_id", organization.id).order("due_on"),
    canCreate
      ? workspace.supabase.from("workers").select("id, full_name").eq("organization_id", organization.id).eq("mine_site_id", site.id).eq("status", "active").is("deleted_at", null).order("full_name")
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);
  if (licencesResult.error) throw new Error("Unable to load licences.");

  const licences = licencesResult.data ?? [];
  const requirements = requirementsResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const expiringLicences = licences.filter((licence) => licence.expires_on && licence.expires_on <= horizon);
  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const overdueTasks = openTasks.filter((task) => task.due_on < today);

  const requirementOptions: Option[] = requirements.map((row) => ({ id: row.id, label: row.name }));
  const licenceOptions: Option[] = licences.map((row) => ({ id: row.id, label: `${row.licence_number} — ${row.licence_type}` }));
  const workerOptions: Option[] = (workersResult.data ?? []).map((row) => ({ id: row.id, label: row.full_name }));
  const locale = await getLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t(locale, "riskAndInsight")}
        title={t(locale, "compliance")}
        description={t(locale, "complianceDescription", { organization: organization.name })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t(locale, "licencesHeld")} value={licences.length} />
        <StatCard label={t(locale, "expiringWithin", { days: String(EXPIRING_WINDOW_DAYS) })} value={expiringLicences.length} tone={expiringLicences.length ? "warning" : "default"} />
        <StatCard label={t(locale, "tasksOverdue")} value={overdueTasks.length} tone={overdueTasks.length ? "destructive" : "default"} />
      </div>

      <Alert variant="info">
        Mantara records and organizes the compliance information you enter. It does not interpret regulations or tell
        you what your obligations are — requirements and their timing are authored by your organization.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "licences")}</CardTitle>
          <CardDescription>Permits and licences held, with their recorded expiry.</CardDescription>
        </CardHeader>
        {licences.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Licence</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Authority</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licences.map((licence) => {
                const expiringSoon = Boolean(licence.expires_on && licence.expires_on <= horizon);
                const expired = Boolean(licence.expires_on && licence.expires_on < today);
                return (
                  <TableRow key={licence.id}>
                    <TableCell className="font-medium">{licence.licence_number}</TableCell>
                    <TableCell className="text-muted-foreground">{licence.licence_type}</TableCell>
                    <TableCell className="text-muted-foreground">{licence.issuing_authority || "—"}</TableCell>
                    <TableCell className={expired ? "font-semibold text-destructive" : expiringSoon ? "font-semibold text-warning-foreground" : "text-muted-foreground"}>
                      {licence.expires_on || "No expiry recorded"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={licence.status === "active" ? "success" : licence.status === "suspended" || licence.status === "expired" ? "destructive" : "secondary"}>
                        {licenceStatusLabels[licence.status as keyof typeof licenceStatusLabels] ?? licence.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <CardContent><EmptyState icon={<FileCheck2 className="size-6" aria-hidden />} title="No licences recorded" description="Add the permits this organization holds so their expiry can be tracked." /></CardContent>
        )}
        {canCreate && <CardContent className="border-t"><LicenceForm /></CardContent>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "obligations")}</CardTitle>
          <CardDescription>Recurring duties your organization has defined for itself.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {requirements.length ? (
            <ul className="divide-y">
              {requirements.map((requirement) => (
                <li key={requirement.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium">{requirement.name}{requirement.category && <span className="ml-2 text-sm font-normal text-muted-foreground">{requirement.category}</span>}</span>
                  <Badge variant="secondary">{recurrenceLabels[requirement.recurrence as keyof typeof recurrenceLabels] ?? requirement.recurrence}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No requirements defined yet.</p>
          )}
          {canCreate && <div className="border-t pt-4"><RequirementForm /></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "tasksAndDeadlines")}</CardTitle>
          <CardDescription>Completing a recurring task schedules the next one automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tasks.length ? (
            <ul className="divide-y">
              {tasks.map((task) => {
                const requirement = Array.isArray(task.requirement) ? task.requirement[0] : task.requirement;
                const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
                const open = task.status === "open" || task.status === "in_progress";
                const overdue = open && task.due_on < today;
                return (
                  <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Due {task.due_on}
                        {overdue && <span className="ml-2 font-semibold text-destructive">overdue</span>}
                        {assignee?.full_name ? ` · ${assignee.full_name}` : ""}
                        {requirement?.name ? ` · ${requirement.name}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={task.status === "completed" ? "success" : overdue ? "destructive" : "secondary"}>
                        {taskStatusLabels[task.status as keyof typeof taskStatusLabels] ?? task.status}
                      </Badge>
                      {open && canUpdate && (
                        <CompleteTaskForm taskId={task.id} today={today} recurring={Boolean(requirement && requirement.recurrence !== "none")} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No compliance tasks scheduled.</p>
          )}
          {canCreate && (
            <div className="border-t pt-4">
              <ComplianceTaskForm requirements={requirementOptions} licences={licenceOptions} workers={workerOptions} today={today} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
