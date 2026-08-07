import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allowedExpenseTransitions,
  budgetSchema,
  expenseReviewSchema,
  expenseSchema,
} from "@/features/expenses/schemas";

const expenseId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const expense = { description: "Diesel delivery", amount: "1500", currencyCode: "TZS", incurredOn: "2026-08-07" };

describe("expense validation", () => {
  it("accepts a valid expense", () => expect(expenseSchema.safeParse(expense).success).toBe(true));
  it("requires a description", () => expect(expenseSchema.safeParse({ ...expense, description: "" }).success).toBe(false));
  it("rejects a zero amount", () => expect(expenseSchema.safeParse({ ...expense, amount: "0" }).success).toBe(false));
  it("rejects a negative amount", () => expect(expenseSchema.safeParse({ ...expense, amount: "-5" }).success).toBe(false));
  it("rejects a malformed currency code", () => expect(expenseSchema.safeParse({ ...expense, currencyCode: "SHILLING" }).success).toBe(false));
  it("upper-cases the currency code", () => {
    const parsed = expenseSchema.safeParse({ ...expense, currencyCode: "usd" });
    expect(parsed.success && parsed.data.currencyCode).toBe("USD");
  });
});

describe("expense review validation", () => {
  it("accepts an approval", () => expect(expenseReviewSchema.safeParse({ expenseId, decision: "approved" }).success).toBe(true));
  it("rejects an unknown decision", () => expect(expenseReviewSchema.safeParse({ expenseId, decision: "deferred" }).success).toBe(false));
});

describe("budget validation", () => {
  const budget = { name: "Q3 fuel", period: "quarterly", startsOn: "2026-07-01", endsOn: "2026-09-30", amount: "50000", currencyCode: "TZS" };

  it("accepts a valid budget", () => expect(budgetSchema.safeParse(budget).success).toBe(true));
  it("rejects an end date before the start date", () => expect(budgetSchema.safeParse({ ...budget, endsOn: "2026-06-01" }).success).toBe(false));
  it("rejects a zero amount", () => expect(budgetSchema.safeParse({ ...budget, amount: "0" }).success).toBe(false));
  it("rejects an unknown period", () => expect(budgetSchema.safeParse({ ...budget, period: "weekly" }).success).toBe(false));
});

describe("expense transitions", () => {
  it("offers nothing from a submitted or paid expense", () => {
    // A submitted expense moves only through review_expense(); paid is terminal.
    expect(allowedExpenseTransitions.submitted).toEqual([]);
    expect(allowedExpenseTransitions.paid).toEqual([]);
  });

  it("never offers approve or reject as a plain status change", () => {
    for (const targets of Object.values(allowedExpenseTransitions)) {
      expect(targets).not.toContain("approved");
      expect(targets).not.toContain("rejected");
    }
  });

  // The UI must never offer a move the database trigger would reject.
  it("only offers transitions the migration permits", () => {
    const sql = readFileSync("supabase/migrations/0008_expenses.sql", "utf8");
    const clause = sql.slice(sql.indexOf("validate_expense_transition"), sql.indexOf("create trigger expenses_transition"));
    for (const [from, targets] of Object.entries(allowedExpenseTransitions)) {
      for (const to of targets) {
        const permitted = new RegExp(`old\\.status = '${from}' and new\\.status (?:=|in \\()[^)]*'${to}'`).test(clause);
        expect(permitted, `${from} -> ${to} must be permitted by the trigger`).toBe(true);
      }
    }
  });
});
