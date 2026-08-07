import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Several actions are recorded but were previously unreadable — most importantly, every time someone
 * opens the personal or medical details attached to a safety incident. Recording an access nobody can
 * review is not accountability, so this screen closes that gap.
 */
const sensitiveActions = new Set(["safety_incident_details.viewed", "safety_incident_details.recorded"]);

export default async function AuditLogsPage() {
  const [workspace, locale] = await Promise.all([getActiveWorkspace(), getLocale()]);
  const organization = workspace.activeOrganization;
  if (!organization || !await hasPermission(organization.id, "audit_log.read")) redirect("/dashboard");

  const { data: entries, error } = await workspace.supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, new_values, created_at, actor:profiles(full_name)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Unable to load the audit log.");

  const rows = entries ?? [];
  const sensitiveCount = rows.filter((row) => sensitiveActions.has(row.action)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t(locale, "settings")}
        title={t(locale, "auditLog")}
        description={t(locale, "auditLogDescription", { organization: organization.name })}
      />

      {sensitiveCount > 0 && (
        <Alert variant="warning">
          {sensitiveCount} of the entries below record access to personal or medical information held against a safety
          incident. Reviewing who opened those records, and why, is part of keeping that information trustworthy.
        </Alert>
      )}

      <Card>
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "auditWhen")}</TableHead>
                <TableHead>{t(locale, "auditAction")}</TableHead>
                <TableHead>{t(locale, "auditRecord")}</TableHead>
                <TableHead>{t(locale, "auditBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => {
                const actor = Array.isArray(entry.actor) ? entry.actor[0] : entry.actor;
                const values = (entry.new_values ?? {}) as Record<string, unknown>;
                const name = typeof values.name === "string" ? values.name : null;
                const sensitive = sensitiveActions.has(entry.action);
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(entry.created_at).toISOString().replace("T", " ").slice(0, 16)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sensitive ? "warning" : "secondary"}>{entry.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{name ?? entry.entity_type}</p>
                      {entry.entity_id && <p className="font-mono text-xs text-muted-foreground">{entry.entity_id.slice(0, 8)}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{actor?.full_name || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState icon={<ScrollText className="size-6" aria-hidden />} title={t(locale, "noAuditEntries")} />
          </div>
        )}
      </Card>
    </div>
  );
}
