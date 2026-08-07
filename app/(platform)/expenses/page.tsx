import Link from "next/link";
import { Panel } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { pageInfo, readPaging, type PageParams } from "@/lib/paging";
import { Pagination } from "@/components/ui/pagination";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import {
  BudgetForm,
  ExpenseCategoryForm,
  ExpenseForm,
  type Option,
} from "@/features/expenses/expense-forms";
import { budgetPeriodLabels, expenseStatusLabels } from "@/features/expenses/schemas";

export const metadata = { title: "Expenses" };

const statusTone: Record<string, string> = {
  draft: "bg-muted text-foreground",
  submitted: "bg-warning/15 text-warning-foreground",
  approved: "bg-success/12 text-primary",
  rejected: "bg-destructive/12 text-destructive",
  paid: "bg-success/20 text-success",
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "expense.read")) redirect("/dashboard");

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission(organization.id, "expense.create"),
    hasPermission(organization.id, "expense.update"),
  ]);

  const paging = readPaging(await searchParams);
  const [expensesResult, categoriesResult, suppliersResult, workOrdersResult, budgetsResult] = await Promise.all([
    workspace.supabase.from("expenses").select("id, description, amount, currency_code, incurred_on, status, category:expense_categories!expenses_category_id_fkey(name)", { count: "exact" }).eq("organization_id", organization.id).eq("mine_site_id", site.id).order("incurred_on", { ascending: false }).range(paging.from, paging.to),
    workspace.supabase.from("expense_categories").select("id, name").eq("organization_id", organization.id).eq("is_active", true).order("name"),
    canCreate
      ? workspace.supabase.from("suppliers").select("id, name").eq("organization_id", organization.id).eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    canCreate
      ? workspace.supabase.from("maintenance_work_orders").select("id, title").eq("organization_id", organization.id).eq("mine_site_id", site.id).order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    workspace.supabase.from("budgets").select("id, name, period, starts_on, ends_on, amount, currency_code, category:expense_categories!budgets_category_id_fkey(name)").eq("organization_id", organization.id).order("starts_on", { ascending: false }),
  ]);
  if (expensesResult.error) throw new Error("Unable to load expenses.");

  const expenses = expensesResult.data ?? [];
  const expensesInfo = pageInfo(paging, expensesResult.count ?? 0);
  const budgets = budgetsResult.data ?? [];
  const categoryOptions: Option[] = (categoriesResult.data ?? []).map((row) => ({ id: row.id, label: row.name }));
  const today = new Date().toISOString().slice(0, 10);
  const currency = expenses[0]?.currency_code ?? "TZS";

  // Budget consumption is computed by the database so drafts never count against a budget.
  const consumption = new Map<string, number>();
  await Promise.all(budgets.map(async (budget) => {
    const { data } = await workspace.supabase.rpc("budget_consumption", { requested_budget_id: budget.id });
    consumption.set(budget.id, Number(data ?? 0));
  }));

  const awaiting = expenses.filter((expense) => expense.status === "submitted");
  const approvedTotal = expenses.filter((expense) => expense.status === "approved" || expense.status === "paid").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const locale = await getLocale();

  return <div className="space-y-6">
    <div>
      <p className="text-sm font-semibold tracking-wider text-accent-foreground">{t(locale, "controls")}</p>
      <h1 className="mt-2 text-3xl font-bold">{t(locale, "expenses")}</h1>
      <p className="mt-2 text-muted-foreground">{t(locale, "expensesDescription", { site: site.name })}</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "approvedSpend")}</p><p className="mt-1 text-2xl font-bold">{approvedTotal.toLocaleString()}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "awaitingApproval")}</p><p className="mt-1 text-2xl font-bold">{awaiting.length}</p></div>
      <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, "activeBudgets")}</p><p className="mt-1 text-2xl font-bold">{budgets.length}</p></div>
    </div>

    {canCreate && <ExpenseForm
      categories={categoryOptions}
      suppliers={(suppliersResult.data ?? []).map((row) => ({ id: row.id, label: row.name }))}
      workOrders={(workOrdersResult.data ?? []).map((row) => ({ id: row.id, label: row.title }))}
      currency={currency}
      today={today}
    />}

    <Panel title={t(locale, "expenses")} description={t(locale, "mostRecentFirst")}>
      {expenses.length
        ? <ul className="divide-y divide-border">{expenses.map((expense) => {
            const category = Array.isArray(expense.category) ? expense.category[0] : expense.category;
            return <li key={expense.id} className="grid gap-2 py-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-center">
              <span className="font-semibold"><Link className="text-primary hover:underline" href={`/expenses/${expense.id}`}>{expense.description}</Link></span>
              <span className="text-sm text-muted-foreground">{category?.name ?? "Uncategorised"}</span>
              <span className="text-sm text-muted-foreground">{Number(expense.amount).toLocaleString()} {expense.currency_code} · {expense.incurred_on}</span>
              <span className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ${statusTone[expense.status] ?? "bg-muted text-foreground"}`}>{expenseStatusLabels[expense.status as keyof typeof expenseStatusLabels] ?? expense.status}</span>
            </li>;
          })}</ul>
        : <p className="text-sm text-muted-foreground">No expenses recorded at this site yet.</p>}
      <Pagination basePath="/expenses" info={expensesInfo} search="" />
    </Panel>

    <Panel title={t(locale, "budgets")} description="Only approved and paid expenses count against a budget.">
      {canUpdate && <div className="mb-5 border-b border-border pb-5"><BudgetForm categories={categoryOptions} currency={currency} today={today} /></div>}
      {budgets.length
        ? <ul className="divide-y divide-border">{budgets.map((budget) => {
            const category = Array.isArray(budget.category) ? budget.category[0] : budget.category;
            const spent = consumption.get(budget.id) ?? 0;
            const limit = Number(budget.amount);
            const share = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
            const over = spent > limit;
            return <li key={budget.id} className="py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{budget.name}<span className="ml-2 text-sm font-normal text-muted-foreground">{budgetPeriodLabels[budget.period as keyof typeof budgetPeriodLabels] ?? budget.period}{category?.name ? ` · ${category.name}` : ""}</span></span>
                <span className={`text-sm ${over ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{spent.toLocaleString()} of {limit.toLocaleString()} {budget.currency_code}{over ? " · over budget" : ""}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${over ? 100 : share}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{budget.starts_on} → {budget.ends_on}</p>
            </li>;
          })}</ul>
        : <p className="text-sm text-muted-foreground">No budgets set.</p>}
    </Panel>

    {canUpdate && <Panel title="Categories"><ExpenseCategoryForm /></Panel>}
  </div>;
}
