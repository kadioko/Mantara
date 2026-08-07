import { redirect } from "next/navigation";
import { Download, FileBarChart } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isReportKind, reportKinds, reportLabels, runReport, type ReportKind } from "@/features/reports/queries";
import { cn } from "@/lib/utils";

function defaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string; to?: string }> }) {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site) redirect("/dashboard");

  // Only offer reports the reader is allowed to run.
  const permitted: ReportKind[] = [];
  for (const kind of reportKinds) {
    const permission = kind === "production" ? "production.read" : kind === "fuel" ? "fuel.read" : kind === "stock" ? "inventory.read" : "expense.read";
    if (await hasPermission(organization.id, permission)) permitted.push(kind);
  }
  if (permitted.length === 0) redirect("/dashboard");

  const params = await searchParams;
  const range = defaultRange();
  const kind: ReportKind = isReportKind(params.kind) && permitted.includes(params.kind) ? params.kind : permitted[0];
  const from = params.from || range.from;
  const to = params.to || range.to;

  const result = await runReport(kind, from, to);
  const exportHref = `/reports/export?kind=${kind}&from=${from}&to=${to}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk and insight"
        title="Reports"
        description={`Movements at ${site.name} between ${from} and ${to}.`}
        actions={
          "error" in result ? undefined : (
            <a href={exportHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} download>
              <Download aria-hidden />Download CSV
            </a>
          )
        }
      />

      <Card>
        <CardHeader><CardTitle>Choose a report</CardTitle></CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="kind">Report</Label>
              <select id="kind" name="kind" defaultValue={kind} className="mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm">
                {permitted.map((option) => <option key={option} value={option}>{reportLabels[option]}</option>)}
              </select>
            </div>
            <div><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={from} className="mt-1" /></div>
            <div><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={to} className="mt-1" /></div>
            <Button variant="secondary">Run</Button>
          </form>
        </CardContent>
      </Card>

      {"error" in result ? (
        <Alert variant="destructive">{result.error}</Alert>
      ) : (
        <Card>
          <CardHeader><CardTitle>{reportLabels[kind]} — {result.rows.length} row{result.rows.length === 1 ? "" : "s"}</CardTitle></CardHeader>
          {result.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>{result.columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.slice(0, 200).map((row, index) => (
                  <TableRow key={index}>
                    {result.columns.map((column) => (
                      <TableCell key={column} className={typeof row[column] === "number" ? "tabular-nums" : undefined}>
                        {row[column] === null || row[column] === "" ? "—" : String(row[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <CardContent>
              <EmptyState
                icon={<FileBarChart className="size-6" aria-hidden />}
                title="Nothing in this period"
                description="Widen the date range, or choose another report."
              />
            </CardContent>
          )}
          {result.rows.length > 200 && (
            <CardContent className="border-t text-sm text-muted-foreground">
              Showing the first 200 rows. The CSV download contains all {result.rows.length}.
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
