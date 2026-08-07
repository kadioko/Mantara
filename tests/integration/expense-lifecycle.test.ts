import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createWorkspace,
  expectRejection,
  type TestDatabase,
  type Workspace,
} from "./harness";

let db: TestDatabase;
let acme: Workspace;

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
}, 120_000);

afterAll(async () => { await db?.close(); });

async function newExpense(description: string, amount = 1000, incurredOn = "2026-08-07", categoryId: string | null = null) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.expenses (organization_id, mine_site_id, category_id, description, amount, incurred_on, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $7) returning id`,
    [acme.organizationId, acme.siteId, categoryId, description, amount, incurredOn, acme.userId],
  );
  return rows[0].id;
}
const setStatus = (id: string, status: string) =>
  db.query(`update public.expenses set status = '${status}', updated_by = $2 where id = $1`, [id, acme.userId]);
const statusOf = async (id: string) => {
  const { rows } = await db.query<{ status: string }>("select status from public.expenses where id = $1", [id]);
  return rows[0].status;
};

describe("expense approval lifecycle", () => {
  it("creates expenses as drafts", async () => expect(await statusOf(await newExpense("Fuel"))).toBe("draft"));

  it("stamps submitted_at on submission", async () => {
    const id = await newExpense("Spares");
    await setStatus(id, "submitted");
    const { rows } = await db.query<{ submitted_at: string | null }>("select submitted_at from public.expenses where id = $1", [id]);
    expect(rows[0].submitted_at).not.toBeNull();
  });

  it("rejects a jump straight from draft to approved", async () => {
    const id = await newExpense("Tyres");
    const message = await expectRejection(() => setStatus(id, "approved"));
    expect(message).toMatch(/cannot move an expense from draft to approved/i);
  });

  it("rejects paying an expense that was never approved", async () => {
    const id = await newExpense("Contractor");
    const message = await expectRejection(() => setStatus(id, "paid"));
    expect(message).toMatch(/cannot move an expense from draft to paid/i);
  });

  it("records the decision and moves the expense", async () => {
    const id = await newExpense("Oil");
    await setStatus(id, "submitted");
    await db.query("select public.review_expense($1, 'approved', $2)", [id, "Invoice checked"]);
    expect(await statusOf(id)).toBe("approved");
    const { rows } = await db.query<{ decision: string }>("select decision from public.expense_approvals where expense_id = $1", [id]);
    expect(rows).toEqual([{ decision: "approved" }]);
  });

  it("refuses to review the same expense twice", async () => {
    const id = await newExpense("Filters");
    await setStatus(id, "submitted");
    await db.query("select public.review_expense($1, 'approved')", [id]);
    const message = await expectRejection(() => db.query("select public.review_expense($1, 'rejected')", [id]));
    expect(message).toMatch(/only a submitted expense can be reviewed/i);
  });

  it("freezes the amount once approved", async () => {
    const id = await newExpense("Freight");
    await setStatus(id, "submitted");
    await db.query("select public.review_expense($1, 'approved')", [id]);
    const message = await expectRejection(() => db.query("update public.expenses set amount = 99999, updated_by = $2 where id = $1", [id, acme.userId]));
    expect(message).toMatch(/approved expense cannot be edited/i);
  });

  it("stamps paid_on when an approved expense is paid", async () => {
    const id = await newExpense("Cement");
    await setStatus(id, "submitted");
    await db.query("select public.review_expense($1, 'approved')", [id]);
    await setStatus(id, "paid");
    const { rows } = await db.query<{ paid_on: string | null }>("select paid_on from public.expenses where id = $1", [id]);
    expect(rows[0].paid_on).not.toBeNull();
  });

  it("allows a rejected expense to return to draft", async () => {
    const id = await newExpense("Rework");
    await setStatus(id, "submitted");
    await db.query("select public.review_expense($1, 'rejected')", [id]);
    await setStatus(id, "draft");
    expect(await statusOf(id)).toBe("draft");
  });
});

describe("budget consumption", () => {
  // An organization-wide budget counts every expense in its window, so each test below uses its own
  // month. Sharing one window would let these tests accumulate each other's spending.
  async function newBudget(name: string, amount: number, startsOn: string, endsOn: string, categoryId: string | null = null) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.budgets (organization_id, category_id, name, period, starts_on, ends_on, amount, created_by, updated_by)
       values ($1, $2, $3, 'monthly', $4, $5, $6, $7, $7) returning id`,
      [acme.organizationId, categoryId, name, startsOn, endsOn, amount, acme.userId],
    );
    return rows[0].id;
  }
  const consumptionOf = async (budgetId: string) => {
    const { rows } = await db.query<{ budget_consumption: string }>("select public.budget_consumption($1)", [budgetId]);
    return Number(rows[0].budget_consumption);
  };
  async function approve(id: string) {
    await setStatus(id, "submitted");
    await db.query("select public.review_expense($1, 'approved')", [id]);
  }

  it("counts nothing while expenses are still drafts", async () => {
    const budget = await newBudget("January", 10_000, "2026-01-01", "2026-01-31");
    await newExpense("Draft only", 500, "2026-01-10");
    expect(await consumptionOf(budget)).toBe(0);
  });

  it("counts an approved expense inside the period", async () => {
    const budget = await newBudget("February", 10_000, "2026-02-01", "2026-02-28");
    await approve(await newExpense("Approved spend", 750, "2026-02-12"));
    expect(await consumptionOf(budget)).toBe(750);
  });

  it("ignores an approved expense outside the budget period", async () => {
    const budget = await newBudget("March", 10_000, "2026-03-01", "2026-03-31");
    await approve(await newExpense("April spend", 400, "2026-04-15"));
    expect(await consumptionOf(budget)).toBe(0);
  });

  it("only counts its own category when the budget is category-scoped", async () => {
    const { rows: categoryRows } = await db.query<{ id: string }>(
      "insert into public.expense_categories (organization_id, name, created_by, updated_by) values ($1, 'Fuel', $2, $2) returning id",
      [acme.organizationId, acme.userId],
    );
    const categoryId = categoryRows[0].id;
    const budget = await newBudget("May fuel only", 10_000, "2026-05-01", "2026-05-31", categoryId);

    await approve(await newExpense("Fuel spend", 300, "2026-05-14", categoryId));
    await approve(await newExpense("Other spend", 900, "2026-05-14"));

    expect(await consumptionOf(budget)).toBe(300);
  });

  it("counts a paid expense as consumed", async () => {
    const budget = await newBudget("June", 10_000, "2026-06-01", "2026-06-30");
    const id = await newExpense("Paid spend", 250, "2026-06-20");
    await approve(id);
    await setStatus(id, "paid");
    expect(await consumptionOf(budget)).toBe(250);
  });
});
