import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, createTestDatabase, createWorkspace, type TestDatabase, type Workspace } from "./harness";

/**
 * Query plans for the reads the screens actually perform, at a volume a real mine reaches.
 *
 * Wall-clock timings mean nothing here: PGlite is PostgreSQL compiled to WebAssembly and runs at a
 * fraction of native speed, so a millisecond figure would be noise dressed up as evidence. What does
 * transfer is the **plan**. A sequential scan over production_entries is a sequential scan whatever
 * the host, and a plan that reads every row of a table to return twenty-five is wrong on any
 * hardware. So these tests assert on what the planner chose, not how long it took.
 *
 * The volumes below are one busy site for a year, not a stress test — roughly what a 200-person
 * operation accumulates before anyone thinks to complain that the app feels slow.
 */

let db: TestDatabase;
let acme: Workspace;
let secondSite: string;

const ENTRIES = 4_000;
const EQUIPMENT = 300;
const STOCK_ITEMS = 400;
const STORES = 8;

/** Runs EXPLAIN and returns the plan as one string, for matching against. */
async function plan(sql: string, params: unknown[] = []) {
  const { rows } = await db.query<Record<string, string>>(`explain (analyze, buffers) ${sql}`, params);
  return rows.map((row) => Object.values(row)[0]).join("\n");
}

/** How many rows the planner actually had to read from a given table. */
function rowsScanned(planText: string, table: string) {
  const match = new RegExp(`on ${table}[^\\n]*rows=(\\d+)`).exec(planText);
  return match ? Number(match[1]) : null;
}

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  await actAs(db, acme.userId);

  const { rows: siteRows } = await db.query<{ id: string }>(
    `insert into public.mine_sites (organization_id, name, created_by) values ($1, 'Pit 4', $2) returning id`,
    [acme.organizationId, acme.userId]);
  secondSite = siteRows[0].id;

  const { rows: shiftRows } = await db.query<{ id: string }>(
    `insert into public.shifts (organization_id, mine_site_id, name, shift_date, created_by)
     values ($1, $2, 'Day', current_date, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId]);
  const shiftId = shiftRows[0].id;

  // Production spread across two sites and a year of dates, so the site filter and the date order
  // both have something real to do.
  await db.query(
    `insert into public.production_entries
       (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
     select $1::uuid,
            case when g % 3 = 0 then $2::uuid else $3::uuid end,
            $4::uuid,
            current_date - (g % 365),
            'gold ore',
            10 + (g % 40),
            'tonne',
            (array['draft','submitted','approved'])[1 + (g % 3)]::public.production_status,
            $5::uuid
     from generate_series(1, $6) g`,
    [acme.organizationId, secondSite, acme.siteId, shiftId, acme.userId, ENTRIES]);

  await db.query(
    `insert into public.equipment (organization_id, mine_site_id, name, category, meter_type, created_by)
     select $1::uuid, case when g % 4 = 0 then $2::uuid else $3::uuid end, 'Machine ' || g, 'excavator', 'hours', $4::uuid
     from generate_series(1, $5) g`,
    [acme.organizationId, secondSite, acme.siteId, acme.userId, EQUIPMENT]);

  await db.query(
    `insert into public.inventory_items (organization_id, name, sku, unit, reorder_level, created_by)
     select $1::uuid, 'Part ' || g, 'SKU-' || g, 'each', 10, $2::uuid from generate_series(1, $3) g`,
    [acme.organizationId, acme.userId, STOCK_ITEMS]);
  await db.query(
    `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
     select $1::uuid, case when g % 2 = 0 then $2::uuid else $3::uuid end, 'Store ' || g, $4::uuid from generate_series(1, $5) g`,
    [acme.organizationId, secondSite, acme.siteId, acme.userId, STORES]);
  // Every item in every store: the shape that made the old inventory screen unbounded.
  await db.query(
    `insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity)
     select $1, i.id, l.id, 5 + (random() * 100)::int
     from public.inventory_items i cross join public.inventory_locations l
     where i.organization_id = $1 and l.organization_id = $1`,
    [acme.organizationId]);

  await db.query("analyze");
}, 240_000);

afterAll(async () => { await db?.close(); });

describe("the volumes are real enough for the plans to mean something", () => {
  it("holds a year of production and a full stock matrix", async () => {
    const { rows } = await db.query<{ entries: string; balances: string }>(
      `select (select count(*) from public.production_entries) as entries,
              (select count(*) from public.inventory_stock_balances) as balances`);
    expect(Number(rows[0].entries)).toBe(ENTRIES);
    expect(Number(rows[0].balances)).toBe(STOCK_ITEMS * STORES);
  });
});

describe("list screens read a page, not a table", () => {
  it("pages production without scanning every entry", async () => {
    // This is the query behind /production: newest first, one page.
    const text = await plan(
      `select id, entry_date, material, quantity, status from public.production_entries
       where organization_id = $1 and mine_site_id = $2
       order by entry_date desc limit 25`,
      [acme.organizationId, acme.siteId]);

    const scanned = rowsScanned(text, "production_entries");
    expect(text).not.toMatch(/Seq Scan on production_entries/);
    // A page of 25 must not require reading thousands of rows to produce.
    if (scanned !== null) expect(scanned).toBeLessThan(ENTRIES / 2);
  });

  it("holds the stock overview to a known, bounded cost", async () => {
    // This one does NOT assert an index scan, because measuring said the planner will not choose
    // one and no index can make it. The screen orders by item name, which lives on the joined item,
    // so there is nothing ordered on the balance table to walk. See 0029 for what was tried.
    //
    // What is asserted instead is the ceiling: a single scan of the balances with a bounded-memory
    // top-N sort. If this ever becomes a merge or an external sort, the cost has changed shape and
    // someone should look. `scripts/plan-probe.mjs` reproduces the numbers at larger volumes.
    const text = await plan(
      `select item_name, location_name, quantity from public.inventory_stock_overview
       where organization_id = $1 and mine_site_id = $2
       order by item_name limit 25`,
      [acme.organizationId, acme.siteId]);

    expect(text).toMatch(/Sort Method: top-N heapsort/);
    expect(text).not.toMatch(/Sort Method: external/);
    // One pass over the balances, not one per item.
    expect((text.match(/Seq Scan on inventory_stock_balances/g) ?? [])).toHaveLength(1);
    expect(text).not.toMatch(/loops=[2-9]/);
  });

  it("finds equipment for one site by index", async () => {
    const text = await plan(
      `select id, name from public.equipment
       where organization_id = $1 and mine_site_id = $2 and deleted_at is null order by name limit 25`,
      [acme.organizationId, acme.siteId]);
    expect(text).not.toMatch(/Seq Scan on equipment/);
  });
});

describe("headline figures are counted by index", () => {
  it("counts submitted production without a sequential scan", async () => {
    // 0025 added (mine_site_id, status) for exactly this. Without it every page load reads the table.
    const text = await plan(
      `select count(*) from public.production_entries where mine_site_id = $1 and status = 'submitted'`,
      [acme.siteId]);
    expect(text).not.toMatch(/Seq Scan on production_entries/);
  });

  it("sums approved production without a sequential scan", async () => {
    const text = await plan(
      `select coalesce(sum(quantity), 0) from public.production_entries
       where mine_site_id = $1 and status = 'approved'`,
      [acme.siteId]);
    expect(text).not.toMatch(/Seq Scan on production_entries/);
  });
});

describe("the site restriction does not turn every read into a scan", () => {
  // may_reach_site() runs against every row of every site-scoped query. If its lookup were not an
  // index hit, adding the restriction would have quietly made the whole product slower with volume,
  // and nothing else here would have noticed.
  it("resolves a member's site list from one page of the table", async () => {
    // Asserting on an index scan here would be wrong: the table holds one row per member per site,
    // so a hundred people across ten sites is a thousand rows and the planner rightly prefers a
    // sequential scan of a single page. What matters is that the lookup touches almost nothing,
    // which is what the buffer count shows — and that stays true as the table grows because the
    // index is there for when it is worth using.
    await actAs(db, acme.userId);
    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, acme.userId, [acme.siteId]]);

    const text = await plan(
      `select 1 from public.membership_sites
       where organization_id = $1 and user_id = $2 and mine_site_id = $3`,
      [acme.organizationId, acme.userId, acme.siteId]);
    const buffers = /Buffers: shared hit=(\d+)/.exec(text);
    expect(Number(buffers?.[1] ?? 999)).toBeLessThan(5);

    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, acme.userId, []]);
  });

  it("keeps an index available for when the table is worth indexing", async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and tablename = 'membership_sites'");
    expect(rows.map((row) => row.indexdef).join(" ")).toContain("user_id");
  });
});

describe("indexes exist where the queries need them", () => {
  const expected: [string, string[]][] = [
    ["production_entries", ["mine_site_id"]],
    ["equipment", ["mine_site_id"]],
    ["inventory_stock_balances", ["organization_id"]],
    ["membership_sites", ["organization_id", "user_id"]],
    ["notifications", ["user_id"]],
    ["audit_logs", ["organization_id"]],
  ];

  for (const [table, columns] of expected) {
    it(`indexes ${table} on ${columns.join(", ")}`, async () => {
      const { rows } = await db.query<{ indexdef: string }>(
        "select indexdef from pg_indexes where schemaname = 'public' and tablename = $1", [table]);
      const definitions = rows.map((row) => row.indexdef).join("\n");
      for (const column of columns) expect(definitions, `${table}.${column}`).toContain(column);
    });
  }
});
