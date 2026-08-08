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
let restricted: string;
let shiftId: string;

type Row = {
  measure: string;
  unit: string;
  current_value: string;
  previous_value: string;
  higher_is_better: boolean | null;
};

const compare = async (siteId: string, days = 30) =>
  (await db.query<Row>("select * from public.site_period_comparison($1, $2)", [siteId, days])).rows;

const byMeasure = async (siteId: string, days = 30) =>
  Object.fromEntries((await compare(siteId, days)).map((row) => [row.measure, row]));

/** Records approved production `daysAgo` days back. */
const production = (quantity: number, daysAgo: number) =>
  db.query(
    `insert into public.production_entries
       (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
     values ($1, $2, $3, current_date - ($4::int), 'gold ore', $5, 'tonne', 'approved', $6)`,
    [acme.organizationId, acme.siteId, shiftId, daysAgo, quantity, acme.userId]);

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");
  await actAs(db, acme.userId);

  const { rows } = await db.query<{ id: string }>(
    `insert into public.shifts (organization_id, mine_site_id, name, shift_date, created_by)
     values ($1, $2, 'Day', current_date, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId]);
  shiftId = rows[0].id;

  // 300 tonnes in the last 30 days, 500 in the 30 before that: a month that is down on the last.
  await production(200, 5);
  await production(100, 20);
  await production(500, 45);

  await db.query(
    `insert into public.safety_incidents (organization_id, mine_site_id, title, occurred_at, reported_on, severity, created_by)
     values ($1, $2, 'Recent slip', now(), current_date - 3, 'low', $3),
            ($1, $2, 'Older slip', now(), current_date - 40, 'low', $3),
            ($1, $2, 'Another older slip', now(), current_date - 50, 'low', $3)`,
    [acme.organizationId, acme.siteId, acme.userId]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("comparing two periods", () => {
  it("splits the measure at the window boundary", async () => {
    await actAs(db, acme.userId);
    const rows = await byMeasure(acme.siteId, 30);
    expect(Number(rows["Approved production"].current_value)).toBe(300);
    expect(Number(rows["Approved production"].previous_value)).toBe(500);
  });

  it("moves the boundary with the window", async () => {
    // At 10 days only the entry from 5 days ago is current. The one from 20 days ago sits exactly on
    // the far edge of the previous window and is excluded — see the boundary test below.
    await actAs(db, acme.userId);
    const rows = await byMeasure(acme.siteId, 10);
    expect(Number(rows["Approved production"].current_value)).toBe(200);
    expect(Number(rows["Approved production"].previous_value)).toBe(0);
  });

  it("gives each period exactly the same number of days", async () => {
    // Both windows are half-open — (from, to] — so neither can claim a day the other also counts,
    // and neither is a day longer than the other. An off-by-one here would make every comparison
    // slightly flattering or slightly damning, forever, with nothing to reveal it.
    // Two entries a day apart rather than one that moves: an approved entry is frozen by design,
    // and that guard is doing its job here.
    await actAs(db, acme.userId);
    const { rows: onEdge } = await db.query<{ id: string }>(
      `insert into public.production_entries
         (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
       values ($1, $2, $3, current_date - 19, 'gold ore', 7, 'tonne', 'approved', $4) returning id`,
      [acme.organizationId, acme.siteId, shiftId, acme.userId]);

    // 19 days back is the first day of the previous window when the window is 10 days.
    expect(Number((await byMeasure(acme.siteId, 10))["Approved production"].previous_value)).toBe(7);
    await db.query("delete from public.production_entries where id = $1", [onEdge[0].id]);

    // One day earlier falls outside both windows entirely.
    const { rows: pastEdge } = await db.query<{ id: string }>(
      `insert into public.production_entries
         (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
       values ($1, $2, $3, current_date - 20, 'gold ore', 7, 'tonne', 'approved', $4) returning id`,
      [acme.organizationId, acme.siteId, shiftId, acme.userId]);

    expect(Number((await byMeasure(acme.siteId, 10))["Approved production"].previous_value)).toBe(0);
    await db.query("delete from public.production_entries where id = $1", [pastEdge[0].id]);
  });

  it("counts incidents in both periods", async () => {
    await actAs(db, acme.userId);
    const rows = await byMeasure(acme.siteId, 30);
    expect(Number(rows["Safety incidents"].current_value)).toBe(1);
    expect(Number(rows["Safety incidents"].previous_value)).toBe(2);
  });

  it("returns zero rather than nothing for a measure with no data", async () => {
    // "No incidents this month or last" is worth showing. An absent row would read as a screen
    // that failed to load.
    await actAs(db, rival.userId);
    const rows = await byMeasure(rival.siteId, 30);
    expect(Number(rows["Approved production"].current_value)).toBe(0);
    expect(Number(rows["Approved production"].previous_value)).toBe(0);
  });
});

describe("which way is good", () => {
  // The screen colours a change by this rather than by a second list of rules that would drift.
  it("says more production is better", async () => {
    await actAs(db, acme.userId);
    expect((await byMeasure(acme.siteId))["Approved production"].higher_is_better).toBe(true);
  });

  it("says more downtime and more incidents are worse", async () => {
    await actAs(db, acme.userId);
    const rows = await byMeasure(acme.siteId);
    expect(rows["Downtime"].higher_is_better).toBe(false);
    expect(rows["Safety incidents"].higher_is_better).toBe(false);
  });

  it("declines to judge fuel issued or spend", async () => {
    // Burning more fuel while producing more ore is what a busy month looks like. Calling that bad
    // would train people to ignore the colour.
    await actAs(db, acme.userId);
    const rows = await byMeasure(acme.siteId);
    expect(rows["Fuel issued"].higher_is_better).toBeNull();
    expect(rows["Approved spend"].higher_is_better).toBeNull();
  });

  it("says less shortfall is better for both variances", async () => {
    // A negative variance is stock or fuel the records claim and reality does not, so a rising
    // total is an improvement.
    await actAs(db, acme.userId);
    const rows = await byMeasure(acme.siteId);
    expect(rows["Fuel variance"].higher_is_better).toBe(true);
    expect(rows["Stock variance"].higher_is_better).toBe(true);
  });
});

describe("variance flows through from the counts", () => {
  it("totals fuel stock take variance in the right period", async () => {
    await actAs(db, acme.userId);
    const { rows: tank } = await db.query<{ id: string }>(
      `insert into public.fuel_storage_locations
         (organization_id, mine_site_id, name, current_balance_litres, created_by)
       values ($1, $2, 'Bowser 1', 1000, $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId]);
    await db.query("select public.record_fuel_stock_take($1, 900, current_date - 2)", [tank[0].id]);

    const rows = await byMeasure(acme.siteId, 30);
    expect(Number(rows["Fuel variance"].current_value)).toBe(-100);
    expect(Number(rows["Fuel variance"].previous_value)).toBe(0);
  });

  it("totals applied stock count variance and ignores drafts", async () => {
    await actAs(db, acme.userId);
    const { rows: store } = await db.query<{ id: string }>(
      `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
       values ($1, $2, 'Main store', $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId]);
    const { rows: item } = await db.query<{ id: string }>(
      `insert into public.inventory_items (organization_id, name, unit, created_by)
       values ($1, 'Drill bit', 'each', $2) returning id`,
      [acme.organizationId, acme.userId]);
    await db.query(
      `insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity)
       values ($1, $2, $3, 50)`,
      [acme.organizationId, item[0].id, store[0].id]);

    const applied = await db.query<{ id: string }>(
      `insert into public.inventory_stock_counts
         (organization_id, mine_site_id, inventory_location_id, counted_on, created_by, updated_by)
       values ($1, $2, $3, current_date - 1, $4, $4) returning id`,
      [acme.organizationId, acme.siteId, store[0].id, acme.userId]);
    await db.query(
      `insert into public.inventory_stock_count_lines
         (organization_id, stock_count_id, inventory_item_id, counted_quantity, created_by)
       values ($1, $2, $3, 44, $4)`,
      [acme.organizationId, applied.rows[0].id, item[0].id, acme.userId]);
    await db.query("select public.apply_inventory_stock_count($1)", [applied.rows[0].id]);

    // A draft count in the same window must contribute nothing: nothing has been established yet.
    const draft = await db.query<{ id: string }>(
      `insert into public.inventory_stock_counts
         (organization_id, mine_site_id, inventory_location_id, counted_on, created_by, updated_by)
       values ($1, $2, $3, current_date - 1, $4, $4) returning id`,
      [acme.organizationId, acme.siteId, store[0].id, acme.userId]);
    await db.query(
      `insert into public.inventory_stock_count_lines
         (organization_id, stock_count_id, inventory_item_id, counted_quantity, created_by)
       values ($1, $2, $3, 1, $4)`,
      [acme.organizationId, draft.rows[0].id, item[0].id, acme.userId]);

    const rows = await byMeasure(acme.siteId, 30);
    expect(Number(rows["Stock variance"].current_value)).toBe(-6);
  });
});

describe("who may see which measure", () => {
  it("omits a module the caller cannot read", async () => {
    // A trend line discloses as much as a figure does. This is the leak 0016 fixed in
    // operational_summary, and it would be just as available here.
    restricted = await createUser(db, "maintenance@acme.test");
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role_id, status)
       select $1, $2, r.id, 'active' from public.roles r
       where r.organization_id = $1 and r.code = 'maintenance_officer'`,
      [acme.organizationId, restricted]);
    await db.query(
      `delete from public.role_permissions rp using public.roles r, public.permissions p
       where rp.role_id = r.id and rp.permission_id = p.id
         and r.organization_id = $1 and r.code = 'maintenance_officer'
         and p.code in ('production.read', 'expense.read')`,
      [acme.organizationId]);

    await actAs(db, restricted);
    const measures = (await compare(acme.siteId)).map((row) => row.measure);
    expect(measures).not.toContain("Approved production");
    expect(measures).not.toContain("Downtime");
    expect(measures).not.toContain("Approved spend");
  });

  it("still shows the modules that caller can read", async () => {
    // Gating, not a blanket refusal.
    await actAs(db, restricted);
    const measures = (await compare(acme.siteId)).map((row) => row.measure);
    expect(measures.length).toBeGreaterThan(0);
  });

  it("refuses a caller from another organization", async () => {
    await actAs(db, rival.userId);
    const message = await expectRejection(() => compare(acme.siteId));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses an unauthenticated caller", async () => {
    await db.query("select set_config('request.test_user', '', false)");
    const message = await expectRejection(() => compare(acme.siteId));
    expect(message).toMatch(/authentication required/i);
  });

  it("does not reveal whether an unknown site exists", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      compare("00000000-0000-0000-0000-000000000000"));
    expect(message).toMatch(/not found/i);
  });
});

describe("the window itself", () => {
  it("refuses a nonsensical window", async () => {
    await actAs(db, acme.userId);
    for (const days of [0, -1, 400]) {
      const message = await expectRejection(() => compare(acme.siteId, days));
      expect(message, `window of ${days}`).toMatch(/between 1 and 365/i);
    }
  });

  it("is not executable by anon", async () => {
    const { rows } = await db.query<{ granted: boolean }>(
      `select has_function_privilege('anon', p.oid, 'execute') as granted
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'site_period_comparison'`);
    expect(rows[0].granted).toBe(false);
  });
});
