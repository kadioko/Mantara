"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rpcMessage } from "@/lib/auth/scope";
import { expenseCategoryEditSchema, expenseCategoryStatusSchema } from "./schemas";
import type { ExpenseState } from "./actions";

/**
 * Corrections to the expense category list.
 *
 * Categories carry no balance, so retiring one strands nothing: expenses already filed against it
 * keep pointing at it and keep reporting correctly. It simply stops being offered on new entries,
 * which is exactly what an organization wants when it reorganises its cost codes mid-year.
 */

const MANAGE_DENIED = "You do not have permission to manage expense categories.";

export async function updateExpenseCategory(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = expenseCategoryEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the category name." };
  const scope = await requireScope("expense.update", MANAGE_DENIED);
  if ("error" in scope) return scope;

  const { error } = await scope.workspace.supabase
    .from("expense_categories")
    .update({ name: parsed.data.name, updated_by: scope.workspace.user.id, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "Another category already uses that name." : rpcMessage(error, "Unable to save the category. Please try again.") };
  }
  revalidatePath("/expenses");
  return { success: "Category updated." };
}

export async function setExpenseCategoryStatus(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = expenseCategoryStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the category and try again." };
  const scope = await requireScope("expense.update", MANAGE_DENIED);
  if ("error" in scope) return scope;

  const { error } = await scope.workspace.supabase
    .from("expense_categories")
    .update({ is_active: parsed.data.isActive, updated_by: scope.workspace.user.id, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) return { error: rpcMessage(error, "Unable to change the category. Please try again.") };
  revalidatePath("/expenses");
  return { success: parsed.data.isActive ? "Category reinstated." : "Category retired." };
}
