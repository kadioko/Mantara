import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { ReviewForm, SubmitEntryForm } from "@/features/production/production-forms";
import { productionStatusLabels } from "@/features/production/schemas";

export default async function ProductionEntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "production.read")) redirect("/dashboard");

  const { data: entry } = await workspace.supabase
    .from("production_entries")
    .select("id, entry_date, material, quantity, unit, grade, location, status, notes, submitted_at, shift:shifts(name, shift_date)")
    .eq("id", entryId)
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .maybeSingle();
  if (!entry) notFound();

  const { data: approvals } = await workspace.supabase
    .from("production_approvals")
    .select("id, decision, notes, decided_at")
    .eq("production_entry_id", entryId)
    .order("decided_at", { ascending: false });

  const [canUpdate, canApprove] = await Promise.all([
    hasPermission(organization.id, "production.update"),
    hasPermission(organization.id, "production.approve"),
  ]);
  const shift = Array.isArray(entry.shift) ? entry.shift[0] : entry.shift;
  const details: Array<[string, string]> = [
    ["Date", entry.entry_date],
    ["Shift", shift?.name ? `${shift.name} (${shift.shift_date})` : "—"],
    ["Quantity", `${entry.quantity} ${entry.unit}`],
    ["Grade", entry.grade === null ? "—" : String(entry.grade)],
    ["Location", entry.location || "—"],
    ["Status", productionStatusLabels[entry.status as keyof typeof productionStatusLabels] ?? entry.status],
  ];

  return <div className="space-y-6">
    <div>
      <Link href="/production" className="text-sm font-semibold text-primary hover:underline">← Back to production</Link>
      <h1 className="mt-2 text-3xl font-bold">{entry.material}</h1>
      <p className="mt-1 text-muted-foreground">{productionStatusLabels[entry.status as keyof typeof productionStatusLabels] ?? entry.status} · {site.name}</p>
    </div>

    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">Entry</h2></div>
      <div className="p-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {details.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
        </dl>
        {entry.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-foreground">{entry.notes}</p>}
      </div>
    </section>

    {(entry.status === "draft" || entry.status === "rejected") && canUpdate && <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-bold">Submit</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Send this entry for approval. Figures are frozen once approved.</p>
      <SubmitEntryForm entryId={entry.id} />
    </section>}

    {entry.status === "submitted" && canApprove && <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-bold">Review</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Approve or reject this submitted entry.</p>
      <ReviewForm entryId={entry.id} />
    </section>}

    {entry.status === "submitted" && !canApprove && <p className="rounded-xl border border-warning/40 bg-warning/15 p-5 text-sm text-warning-foreground">This entry is awaiting approval by someone with approval permission.</p>}

    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-bold">Approval history</h2></div>
      <div className="p-5">
        {approvals?.length
          ? <ul className="divide-y divide-border">{approvals.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="font-medium capitalize">{row.decision}</span>
              <span className="text-sm text-muted-foreground">{new Date(row.decided_at).toISOString().slice(0, 10)}{row.notes ? ` · ${row.notes}` : ""}</span>
            </li>)}</ul>
          : <p className="text-sm text-muted-foreground">No decision has been recorded yet.</p>}
      </div>
    </section>
  </div>;
}
