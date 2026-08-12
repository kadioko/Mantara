import { t } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/locale";
import { ScrollText } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Platform audit log" };

const actionTone: Record<string, "destructive" | "success" | "secondary"> = {
  "organization.suspended": "destructive",
  "organization.restored": "success",
  "platform_admin.granted": "secondary",
  "platform_admin.revoked": "destructive",
};

export default async function AdminAuditPage() {
  const locale = await getLocale();
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase
    .from("platform_audit_logs")
    .select("id, action, target_type, target_id, details, created_at, actor:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const entries = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow={t(locale, "uiPlatform")}
        title={t(locale, "auditLog")}
        description={t(locale, "uiEveryPlatformAdministrationActionWrittenByTheDatabaseAndAppend")}
      />

      <Card>
        {entries.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>{t(locale, "auditAction")}</TableHead>
                <TableHead>{t(locale, "uiTarget")}</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const actor = Array.isArray(entry.actor) ? entry.actor[0] : entry.actor;
                const details = (entry.details ?? {}) as Record<string, unknown>;
                const name = typeof details.name === "string" ? details.name : null;
                const email = typeof details.email === "string" ? details.email : null;
                const reason = typeof details.reason === "string" ? details.reason : null;
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(entry.created_at).toISOString().replace("T", " ").slice(0, 16)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionTone[entry.action] ?? "secondary"}>{entry.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{name ?? email ?? entry.target_type}</p>
                      {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{actor?.full_name || "Unknown"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={<ScrollText className="size-6" aria-hidden />}
              title={t(locale, "uiNothingRecordedYet")}
              description={t(locale, "uiSuspensionsAndAdministratorChangesWillAppearHereAsTheyHappen")}
            />
          </div>
        )}
      </Card>
    </>
  );
}
