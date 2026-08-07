"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScopeHard, rpcMessage, type ActiveScope } from "@/lib/auth/scope";
import {
  budgetSchema,
  expenseCategorySchema,
  expenseReviewSchema,
  expenseSchema,
  expenseStatusSchema,
} from "./schemas";

export type ExpenseState = { error?: string; success?: string };

const categoryInScope = (scope: ActiveScope, id: string) => rowInScopeHard(scope, "expense_categories", id, { siteScoped: false });

export async function createExpenseCategory(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = expenseCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the category name." };
  const scope = await requireScope("expense.update", "You do not have permission to manage expense categories.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.from("expense_categories").insert({
    organization_id: scope.organizationId,
    name: parsed.data.name,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: error.code === "23505" ? "That category already exists." : "Unable to save the category. Please try again." };
  revalidatePath("/expenses");
  return { success: "Category created." };
}

export async function createExpense(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the expense details." };
  const scope = await requireScope("expense.create", "You do not have permission to record expenses.");
  if ("error" in scope) return scope;
  if (parsed.data.categoryId && !await categoryInScope(scope, parsed.data.categoryId)) return { error: "That category does not belong to this organization." };
  if (parsed.data.supplierId && !await rowInScopeHard(scope, "suppliers", parsed.data.supplierId, { siteScoped: false })) return { error: "That supplier does not belong to this organization." };
  if (parsed.data.workOrderId && !await rowInScopeHard(scope, "maintenance_work_orders", parsed.data.workOrderId)) return { error: "That work order does not belong to the active mine site." };
  const { error } = await scope.workspace.supabase.from("expenses").insert({
    organization_id: scope.organizationId,
    mine_site_id: scope.siteId,
    category_id: parsed.data.categoryId || null,
    supplier_id: parsed.data.supplierId || null,
    work_order_id: parsed.data.workOrderId || null,
    description: parsed.data.description,
    amount: parsed.data.amount,
    currency_code: parsed.data.currencyCode,
    incurred_on: parsed.data.incurredOn,
    reference: parsed.data.reference || null,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the expense. Please try again." };
  revalidatePath("/expenses");
  return { success: "Expense saved as a draft." };
}

export async function updateExpenseStatus(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = expenseStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the expense status." };
  const scope = await requireScope("expense.create", "You do not have permission to update expenses.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase
    .from("expenses")
    .update({ status: parsed.data.status, updated_by: scope.workspace.user.id })
    .eq("id", parsed.data.expenseId)
    .eq("organization_id", scope.organizationId)
    .eq("mine_site_id", scope.siteId);
  if (error) return { error: rpcMessage(error, "Unable to update the expense. Please try again.") };
  revalidatePath(`/expenses/${parsed.data.expenseId}`);
  revalidatePath("/expenses");
  return { success: "Expense updated." };
}

export async function reviewExpense(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = expenseReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the review details." };
  const scope = await requireScope("expense.approve", "You do not have permission to approve expenses.");
  if ("error" in scope) return scope;
  const { error } = await scope.workspace.supabase.rpc("review_expense", {
    requested_expense_id: parsed.data.expenseId,
    decision: parsed.data.decision,
    review_notes: parsed.data.notes || null,
  });
  if (error) return { error: rpcMessage(error, "Unable to record the decision. Please try again.") };
  revalidatePath(`/expenses/${parsed.data.expenseId}`);
  revalidatePath("/expenses");
  return { success: parsed.data.decision === "approved" ? "Expense approved." : "Expense rejected." };
}

export async function createBudget(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the budget details." };
  const scope = await requireScope("expense.update", "You do not have permission to manage budgets.");
  if ("error" in scope) return scope;
  if (parsed.data.categoryId && !await categoryInScope(scope, parsed.data.categoryId)) return { error: "That category does not belong to this organization." };
  const { error } = await scope.workspace.supabase.from("budgets").insert({
    organization_id: scope.organizationId,
    // A budget with no site covers the whole organization; the consumption function honours both.
    mine_site_id: parsed.data.siteScoped ? scope.siteId : null,
    category_id: parsed.data.categoryId || null,
    name: parsed.data.name,
    period: parsed.data.period,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
    amount: parsed.data.amount,
    currency_code: parsed.data.currencyCode,
    notes: parsed.data.notes || null,
    created_by: scope.workspace.user.id,
    updated_by: scope.workspace.user.id,
  });
  if (error) return { error: "Unable to save the budget. Please try again." };
  revalidatePath("/expenses");
  return { success: "Budget created." };
}
