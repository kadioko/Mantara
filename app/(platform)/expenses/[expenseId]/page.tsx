import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { ExpenseReviewForm, ExpenseStatusForm } from "@/features/expenses/expense-forms";
import { allowedExpenseTransitions, expenseStatusLabels } from "@/features/expenses/schemas";

const transitionLabels: Record<string, string> = {
  submitted: "Submit for approval",
  draft: "Return to draft",
  paid: "Mark as paid",
};

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
    <div className="border-b border-stone-200 px-5 py-4"><h2 className="font-bold">{title}</h2>{description && <p className="text-sm text-stone-600">{description}</p>}</div>
    <div className="p-5">{children}</div>
  </section>;
}

export default async function ExpenseDetailPage({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params;
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "expense.read")) redirect("/dashboard");

  const { data: expense } = await workspace.supabase
    .from("expenses")
    .select("id, description, amount, currency_code, incurred_on, reference, status, notes, submitted_at, paid_on, category:expense_categories(name), supplier:suppliers(name), work_order:maintenance_work_orders(title)")
    .eq("id", expenseId)
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .maybeSingle();
  if (!expense) notFound();

  const { data: approvals } = await workspace.supabase
    .from("expense_approvals")
    .select("id, decision, notes, decided_at")
    .eq("expense_id", expenseId)
    .order("decided_at", { ascending: false });

  const [canCreate, canApprove] = await Promise.all([
    hasPermission(organization.id, "expense.create"),
    hasPermission(organization.id, "expense.approve"),
  ]);
  const category = Array.isArray(expense.category) ? expense.category[0] : expense.category;
  const supplier = Array.isArray(expense.supplier) ? expense.supplier[0] : expense.supplier;
  const workOrder = Array.isArray(expense.work_order) ? expense.work_order[0] : expense.work_order;
  const transitions = allowedExpenseTransitions[expense.status as keyof typeof allowedExpenseTransitions] ?? [];

  const details: Array<[string, string]> = [
    ["Amount", `${Number(expense.amount).toLocaleString()} ${expense.currency_code}`],
    ["Incurred on", expense.incurred_on],
    ["Category", category?.name ?? "Uncategorised"],
    ["Supplier", supplier?.name ?? "—"],
    ["Work order", workOrder?.title ?? "—"],
    ["Reference", expense.reference || "—"],
    ["Status", expenseStatusLabels[expense.status as keyof typeof expenseStatusLabels] ?? expense.status],
    ["Paid on", expense.paid_on || "—"],
  ];

  return <div className="space-y-6">
    <div>
      <Link href="/expenses" className="text-sm font-semibold text-emerald-800 hover:underline">← Back to expenses</Link>
      <h1 className="mt-2 text-3xl font-bold">{expense.description}</h1>
      <p className="mt-1 text-stone-600">{expenseStatusLabels[expense.status as keyof typeof expenseStatusLabels] ?? expense.status} · {site.name}</p>
    </div>

    <Panel title="Expense">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {details.map(([label, value]) => <div key={label}><dt className="text-sm text-stone-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}
      </dl>
      {expense.notes && <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">{expense.notes}</p>}
      {canCreate && transitions.length > 0 && <div className="mt-5 border-t border-stone-100 pt-5">
        <ExpenseStatusForm expenseId={expense.id} allowed={transitions} label={transitionLabels[transitions[0]] ?? "Update"} />
      </div>}
    </Panel>

    {expense.status === "submitted" && canApprove && <Panel title="Review" description="Approve or reject this submitted expense.">
      <ExpenseReviewForm expenseId={expense.id} />
    </Panel>}

    {expense.status === "submitted" && !canApprove && <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">This expense is awaiting approval by someone with approval permission.</p>}

    <Panel title="Approval history">
      {approvals?.length
        ? <ul className="divide-y divide-stone-100">{approvals.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
            <span className="font-medium capitalize">{row.decision}</span>
            <span className="text-sm text-stone-600">{new Date(row.decided_at).toISOString().slice(0, 10)}{row.notes ? ` · ${row.notes}` : ""}</span>
          </li>)}</ul>
        : <p className="text-sm text-stone-600">No decision has been recorded yet.</p>}
    </Panel>
  </div>;
}
