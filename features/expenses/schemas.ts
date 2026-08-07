import { z } from "zod";

export const expenseStatuses = ["draft", "submitted", "approved", "rejected", "paid"] as const;
export const budgetPeriods = ["monthly", "quarterly", "annual"] as const;
export const approvalDecisions = ["approved", "rejected"] as const;

export const expenseStatusLabels: Record<(typeof expenseStatuses)[number], string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
};

export const budgetPeriodLabels: Record<(typeof budgetPeriods)[number], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

/**
 * Mirrors validate_expense_transition() in 0008_expenses.sql. Approve and reject are absent because
 * they go through review_expense(), which records the decision alongside the status change.
 */
export const allowedExpenseTransitions: Record<(typeof expenseStatuses)[number], string[]> = {
  draft: ["submitted"],
  submitted: [],
  approved: ["paid"],
  rejected: ["draft"],
  paid: [],
};

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(2, "Name the category.").max(120),
});

export const expenseCategoryEditSchema = expenseCategorySchema.extend({ id: z.string().uuid() });

export const expenseCategoryStatusSchema = z.object({
  id: z.string().uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const expenseSchema = z.object({
  categoryId: z.string().uuid().optional().or(z.literal("")),
  supplierId: z.string().uuid().optional().or(z.literal("")),
  workOrderId: z.string().uuid().optional().or(z.literal("")),
  description: z.string().trim().min(2, "Describe the expense.").max(200),
  amount: z.coerce.number().positive("Enter an amount greater than zero.").max(999_999_999),
  currencyCode: z.string().trim().length(3, "Use a three letter currency code.").toUpperCase(),
  incurredOn: z.string().date(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const expenseStatusSchema = z.object({
  expenseId: z.string().uuid(),
  status: z.enum(expenseStatuses),
});

export const expenseReviewSchema = z.object({
  expenseId: z.string().uuid(),
  decision: z.enum(approvalDecisions),
  notes: z.string().trim().max(500).optional(),
});

export const budgetSchema = z
  .object({
    name: z.string().trim().min(2, "Name the budget.").max(120),
    categoryId: z.string().uuid().optional().or(z.literal("")),
    period: z.enum(budgetPeriods),
    startsOn: z.string().date(),
    endsOn: z.string().date(),
    amount: z.coerce.number().positive("Enter a budget greater than zero.").max(999_999_999),
    currencyCode: z.string().trim().length(3, "Use a three letter currency code.").toUpperCase(),
    siteScoped: z.preprocess(blankToUndefined, z.coerce.boolean().optional()),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The budget cannot end before it starts.",
    path: ["endsOn"],
  });
