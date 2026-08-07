import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  createTestDatabase,
  createUser,
  createWorkspace,
  expectRejection,
  type TestDatabase,
  type Workspace,
} from "./harness";

let db: TestDatabase;
let acme: Workspace;
let rival: Workspace;
let outsider: string;
let restricted: string;

const call = async <T>(fn: string, siteId: string) =>
  (await db.query<T>(`select * from public.${fn}($1)`, [siteId])).rows[0];

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");
  outsider = await createUser(db, "outsider@nowhere.test");
  restricted = await createUser(db, "restricted@acme.test");

  await actAs(db, acme.userId);

  // Production: 40 approved entries and 30 submitted, so any page-sized sample is visibly wrong.
  const { rows: shiftRows } = await db.query<{ id: string }>(
    `insert into public.shifts (organization_id, mine_site_id, name, shift_date, created_by)
     values ($1, $2, 'Day', current_date, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId]);
  for (let index = 0; index < 40; index += 1) {
    await db.query(
      `insert into public.production_entries
         (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
       values ($1, $2, $3, current_date, 'gold ore', 10, 'tonne', 'approved', $4)`,
      [acme.organizationId, acme.siteId, shiftRows[0].id, acme.userId]);
  }
  for (let index = 0; index < 30; index += 1) {
    await db.query(
      `insert into public.production_entries
         (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
       values ($1, $2, $3, current_date, 'gold ore', 5, 'tonne', 'submitted', $4)`,
      [acme.organizationId, acme.siteId, shiftRows[0].id, acme.userId]);
  }

  // Ore lots: one large low-grade and one small high-grade, to pin the weighting.
  await db.query(
    `insert into public.ore_lots (organization_id, mine_site_id, lot_number, produced_on, ore_tonnes, grade_ppm, bag_count, bag_weight_kg, status, created_by)
     values ($1, $2, 'LOT-1', current_date, 100, 3, 10, 50, 'bagged', $3),
            ($1, $2, 'LOT-2', current_date, 1, 30, 1, 50, 'bagged', $3),
            ($1, $2, 'LOT-3', current_date, 50, 9, 5, 50, 'dispatched', $3)`,
    [acme.organizationId, acme.siteId, acme.userId]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("production totals", () => {
  it("sums every approved entry, not the page on screen", async () => {
    await actAs(db, acme.userId);
    const totals = await call<{ approved_quantity: string; submitted_count: string }>("production_totals", acme.siteId);
    expect(Number(totals.approved_quantity)).toBe(400); // 40 entries × 10 tonnes
    expect(Number(totals.submitted_count)).toBe(30);
  });

  it("counts only ore still on site as ready", async () => {
    await actAs(db, acme.userId);
    const totals = await call<{ ore_ready_tonnes: string }>("production_totals", acme.siteId);
    expect(Number(totals.ore_ready_tonnes)).toBe(101); // the dispatched 50 t is gone
  });

  it("weights grade by tonnage rather than averaging the lots", async () => {
    // 100 t at 3 PPM with 1 t at 30 PPM is 3.27 PPM. Averaging the two lots gives 16.5 — five times
    // the truth, and the kind of number someone would act on.
    await actAs(db, acme.userId);
    const totals = await call<{ ore_weighted_grade_ppm: string }>("production_totals", acme.siteId);
    expect(Number(totals.ore_weighted_grade_ppm)).toBeCloseTo(330 / 101, 4);
  });

  it("returns zero rather than null for a site with no production", async () => {
    await actAs(db, rival.userId);
    const totals = await call<{ approved_quantity: string; ore_weighted_grade_ppm: string }>("production_totals", rival.siteId);
    expect(Number(totals.approved_quantity)).toBe(0);
    expect(Number(totals.ore_weighted_grade_ppm)).toBe(0);
  });
});

describe("who may ask", () => {
  it("refuses a caller from another organization", async () => {
    await actAs(db, rival.userId);
    const message = await expectRejection(() => call("production_totals", acme.siteId));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses someone with no membership at all", async () => {
    await actAs(db, outsider);
    const message = await expectRejection(() => call("production_totals", acme.siteId));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses an unauthenticated caller", async () => {
    await db.query("select set_config('request.test_user', '', false)");
    const message = await expectRejection(() => call("production_totals", acme.siteId));
    expect(message).toMatch(/authentication required/i);
  });

  it("does not reveal whether an unknown site exists", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      call("production_totals", "00000000-0000-0000-0000-000000000000"));
    expect(message).toMatch(/not found/i);
  });

  it("refuses a member who holds site.read but not the module permission", async () => {
    // A headline number must not disclose a module the caller cannot open. This is the same leak
    // that operational_summary had before 0016.
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role_id, status)
       select $1, $2, r.id, 'active' from public.roles r
       where r.organization_id = $1 and r.code = 'maintenance_officer'`,
      [acme.organizationId, restricted]);
    await db.query(
      `delete from public.role_permissions rp using public.roles r, public.permissions p
       where rp.role_id = r.id and rp.permission_id = p.id
         and r.organization_id = $1 and r.code = 'maintenance_officer' and p.code = 'production.read'`,
      [acme.organizationId]);

    await actAs(db, restricted);
    const message = await expectRejection(() => call("production_totals", acme.siteId));
    expect(message).toMatch(/permission denied/i);

    // ...but the module they do hold still answers, so this is gating and not a blanket refusal.
    const maintenance = await call<{ open_work_orders: string }>("maintenance_totals", acme.siteId);
    expect(Number(maintenance.open_work_orders)).toBe(0);
  });
});

describe("the helper is not an endpoint", () => {
  it("is not callable by an ordinary user", async () => {
    const { rows } = await db.query<{ granted: boolean }>(
      `select has_function_privilege('authenticated', p.oid, 'execute') as granted
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'assert_site_readable'`);
    expect(rows[0].granted).toBe(false);
  });

  it("exposes the four totals functions to authenticated callers and not to anon", async () => {
    for (const name of ["production_totals", "maintenance_totals", "expense_totals", "fuel_totals"]) {
      const { rows } = await db.query<{ role: string; granted: boolean }>(
        `select r.rolname as role, has_function_privilege(r.rolname, p.oid, 'execute') as granted
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace, pg_roles r
         where n.nspname = 'public' and p.proname = $1 and r.rolname in ('anon', 'authenticated')`,
        [name]);
      const byRole = Object.fromEntries(rows.map((row) => [row.role, row.granted]));
      expect(byRole.authenticated, `${name} for authenticated`).toBe(true);
      expect(byRole.anon, `${name} for anon`).toBe(false);
    }
  });
});

describe("expense and fuel totals", () => {
  it("counts an organization-wide budget as applying to the site", async () => {
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.budgets (organization_id, mine_site_id, name, period, starts_on, ends_on, amount, created_by)
       values ($1, null, 'Company fuel', 'monthly', current_date - 1, current_date + 30, 1000, $2)`,
      [acme.organizationId, acme.userId]);
    const totals = await call<{ active_budgets: string }>("expense_totals", acme.siteId);
    expect(Number(totals.active_budgets)).toBe(1);
  });

  it("ignores a budget whose window has passed", async () => {
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.budgets (organization_id, mine_site_id, name, period, starts_on, ends_on, amount, created_by)
       values ($1, $2, 'Last year', 'monthly', current_date - 400, current_date - 370, 1000, $3)`,
      [acme.organizationId, acme.siteId, acme.userId]);
    const totals = await call<{ active_budgets: string }>("expense_totals", acme.siteId);
    expect(Number(totals.active_budgets)).toBe(1);
  });

  it("counts only tanks in service", async () => {
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.fuel_storage_locations (organization_id, mine_site_id, name, current_balance_litres, is_active, created_by)
       values ($1, $2, 'Bowser 1', 1200, true, $3), ($1, $2, 'Bowser 2', 0, false, $3)`,
      [acme.organizationId, acme.siteId, acme.userId]);
    const totals = await call<{ litres_on_hand: string; active_stores: string }>("fuel_totals", acme.siteId);
    expect(Number(totals.litres_on_hand)).toBe(1200);
    expect(Number(totals.active_stores)).toBe(1);
  });
});
