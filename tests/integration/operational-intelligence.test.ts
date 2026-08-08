import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, createTestDatabase, createWorkspace, type TestDatabase } from "./harness";

let db: TestDatabase;

beforeAll(async () => { db = await createTestDatabase(); }, 180_000);
afterAll(async () => { await db?.close(); });

describe("operational intelligence", () => {
  it("uses approved figures, preserves currencies, and converts PPM tonnes to contained metal", async () => {
    const ws = await createWorkspace(db, "intelligence@example.com", "Intelligence Mine");
    await actAs(db, ws.userId);
    await db.query(`insert into public.production_entries
      (organization_id, mine_site_id, entry_date, material, quantity, unit, grade, status, created_by, updated_by)
      values ($1,$2,'2026-08-01','Gold ore',10,'tonnes',2,'approved',$3,$3),
             ($1,$2,'2026-08-01','Draft ore',90,'tonnes',20,'draft',$3,$3)`, [ws.organizationId, ws.siteId, ws.userId]);
    await db.query(`insert into public.expenses
      (organization_id, mine_site_id, description, amount, currency_code, incurred_on, status, created_by, updated_by)
      values ($1,$2,'Approved cost',1000,'TZS','2026-08-01','approved',$3,$3),
             ($1,$2,'Draft cost',9000,'TZS','2026-08-01','draft',$3,$3),
             ($1,$2,'Dollar cost',5,'USD','2026-08-01','paid',$3,$3)`, [ws.organizationId, ws.siteId, ws.userId]);

    const { rows } = await db.query<Record<string, string>>(
      `select * from public.site_operational_intelligence($1,'2026-08-01','2026-08-01')`, [ws.siteId]);
    expect(rows.map((row) => row.currency_code)).toEqual(["TZS", "USD"]);
    expect(Number(rows[0].production_tonnes)).toBe(10);
    expect(Number(rows[0].contained_grams)).toBe(20);
    expect(Number(rows[0].approved_spend)).toBe(1000);
    expect(Number(rows[0].cost_per_tonne)).toBe(100);
    expect(Number(rows[1].approved_spend)).toBe(5);
  });
});

