import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  asAuthenticatedRole,
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
let tank: string;
let excavator: string;
let loader: string;

const balance = async (locationId: string) =>
  Number((await db.query<{ current_balance_litres: string }>(
    "select current_balance_litres from public.fuel_storage_locations where id = $1", [locationId])).rows[0].current_balance_litres);

const stockTake = async (locationId: string, measured: number, notes?: string) =>
  Number((await db.query<{ record_fuel_stock_take: string }>(
    "select public.record_fuel_stock_take($1, $2, current_date, $3)",
    [locationId, measured, notes ?? null])).rows[0].record_fuel_stock_take);

/** Records an issue directly, so a meter reading can be placed exactly where the test needs it. */
const issue = (equipmentId: string, litres: number, meter: number, day: number) =>
  db.query(
    `insert into public.fuel_issues
       (organization_id, mine_site_id, storage_location_id, equipment_id, litres, equipment_meter, issued_on, created_by)
     values ($1, $2, $3, $4, $5, $6, current_date - ($7::int), $8)`,
    [acme.organizationId, acme.siteId, tank, equipmentId, litres, meter, day, acme.userId]);

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");
  await actAs(db, acme.userId);

  const { rows: tankRows } = await db.query<{ id: string }>(
    `insert into public.fuel_storage_locations
       (organization_id, mine_site_id, name, capacity_litres, current_balance_litres, created_by)
     values ($1, $2, 'Bowser 1', 10000, 4000, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId]);
  tank = tankRows[0].id;

  const { rows: machines } = await db.query<{ id: string }>(
    `insert into public.equipment (organization_id, mine_site_id, name, category, meter_type, created_by)
     values ($1, $2, 'Excavator 1', 'excavator', 'hours', $3),
            ($1, $2, 'Loader 1', 'loader', 'hours', $3)
     returning id`,
    [acme.organizationId, acme.siteId, acme.userId]);
  excavator = machines[0].id;
  loader = machines[1].id;
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("a stock take that agrees with the book", () => {
  it("reports no variance and leaves the balance alone", async () => {
    await actAs(db, acme.userId);
    expect(await stockTake(tank, 4000)).toBe(0);
    expect(await balance(tank)).toBe(4000);
  });

  it("writes no adjustment, because nothing needed correcting", async () => {
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from public.fuel_adjustments where storage_location_id = $1", [tank]);
    expect(Number(rows[0].count)).toBe(0);
  });
});

describe("a stock take that finds a shortfall", () => {
  it("reports the variance as a negative number", async () => {
    // 400 litres that the records say are in the tank and the dip stick says are not. This is the
    // number the whole feature exists to produce.
    await actAs(db, acme.userId);
    expect(await stockTake(tank, 3600, "Monthly dip")).toBe(-400);
  });

  it("brings the book into line with the measurement", async () => {
    expect(await balance(tank)).toBe(3600);
  });

  it("keeps both figures, so the finding survives the correction", async () => {
    // Correcting the balance without recording what it was is how a shortfall becomes invisible.
    const { rows } = await db.query<{ measured_litres: string; book_litres: string; variance_litres: string }>(
      `select measured_litres, book_litres, variance_litres from public.fuel_stock_takes
       where storage_location_id = $1 order by created_at desc limit 1`, [tank]);
    expect(Number(rows[0].measured_litres)).toBe(3600);
    expect(Number(rows[0].book_litres)).toBe(4000);
    expect(Number(rows[0].variance_litres)).toBe(-400);
  });

  it("records the correction as an ordinary adjustment, so the movement history stays complete", async () => {
    const { rows } = await db.query<{ litres_delta: string; reason: string; notes: string }>(
      `select litres_delta, reason, notes from public.fuel_adjustments
       where storage_location_id = $1 order by created_at desc limit 1`, [tank]);
    expect(Number(rows[0].litres_delta)).toBe(-400);
    expect(rows[0].reason).toMatch(/stock take/i);
    expect(rows[0].notes).toContain("3600");
    expect(rows[0].notes).toContain("4000");
  });
});

describe("a stock take that finds a surplus", () => {
  it("reports a positive variance and corrects upwards", async () => {
    // Worth surfacing too: fuel that appears from nowhere usually means a delivery nobody recorded.
    await actAs(db, acme.userId);
    expect(await stockTake(tank, 3750)).toBe(150);
    expect(await balance(tank)).toBe(3750);
  });
});

describe("what a stock take refuses", () => {
  it("refuses a negative measurement", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() => stockTake(tank, -5));
    expect(message).toMatch(/cannot be negative/i);
  });

  it("refuses a measurement larger than the tank", async () => {
    // A dip reading above capacity is a misread or a wrong tank, and accepting it would write a
    // balance the tank physically cannot hold.
    await actAs(db, acme.userId);
    const message = await expectRejection(() => stockTake(tank, 12000));
    expect(message).toMatch(/exceeds the .* capacity/i);
  });

  it("refuses a caller without permission to adjust fuel", async () => {
    // A stock take moves the balance, so it needs the permission that guards moving the balance —
    // not merely the one that guards reading it.
    const clerk = await createUser(db, "clerk@acme.test");
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role_id, status)
       select $1, $2, r.id, 'active' from public.roles r where r.organization_id = $1 and r.code = 'site_supervisor'`,
      [acme.organizationId, clerk]);

    await actAs(db, clerk);
    const message = await expectRejection(() => stockTake(tank, 3000));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses a tank in another organization", async () => {
    await actAs(db, rival.userId);
    const message = await expectRejection(() => stockTake(tank, 3000));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses a retired tank", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.fuel_storage_locations (organization_id, mine_site_id, name, is_active, created_by)
       values ($1, $2, 'Retired bowser', false, $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId]);
    const message = await expectRejection(() => stockTake(rows[0].id, 100));
    expect(message).toMatch(/no longer active/i);
  });

  it("shows one organization nothing of another's stock takes", async () => {
    await actAs(db, rival.userId);
    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.fuel_stock_takes")).rows);
    expect(rows).toEqual([]);
  });

  it("cannot be written directly, only through the function", async () => {
    await actAs(db, acme.userId);
    const message = await asAuthenticatedRole(db, () => expectRejection(() => db.query(
      `insert into public.fuel_stock_takes
         (organization_id, mine_site_id, storage_location_id, measured_litres, book_litres)
       values ($1, $2, $3, 1, 1)`,
      [acme.organizationId, acme.siteId, tank])));
    expect(message).toMatch(/row-level security/i);
  });
});

describe("consumption per machine", () => {
  beforeAll(async () => {
    await actAs(db, acme.userId);
    // Excavator: 200 L at 1000 h, then at 1010 h, then at 1020 h. Two complete spans of 10 hours,
    // 200 L each, so 20 L/h.
    await issue(excavator, 200, 1000, 30);
    await issue(excavator, 200, 1010, 20);
    await issue(excavator, 200, 1020, 10);
    // Loader: 100 L over 10 hours, so 10 L/h.
    await issue(loader, 100, 500, 30);
    await issue(loader, 100, 510, 20);
  });

  const consumption = async () =>
    (await db.query<{ equipment_name: string; issues: string; litres_used: string; meter_travelled: string; litres_per_unit: string }>(
      "select * from public.equipment_fuel_consumption($1, current_date - 365, current_date)",
      [acme.siteId])).rows;

  it("computes litres per meter unit for each machine", async () => {
    await actAs(db, acme.userId);
    const byName = Object.fromEntries((await consumption()).map((row) => [row.equipment_name, row]));
    expect(Number(byName["Excavator 1"].litres_per_unit)).toBeCloseTo(20, 3);
    expect(Number(byName["Loader 1"].litres_per_unit)).toBeCloseTo(10, 3);
  });

  it("excludes the last issue, because nothing has measured what happened to it", async () => {
    // Three issues give two complete spans. Counting the third would understate consumption for
    // every machine, every time, by exactly one fill.
    await actAs(db, acme.userId);
    const byName = Object.fromEntries((await consumption()).map((row) => [row.equipment_name, row]));
    expect(Number(byName["Excavator 1"].issues)).toBe(2);
    expect(Number(byName["Excavator 1"].litres_used)).toBe(400);
    expect(Number(byName["Excavator 1"].meter_travelled)).toBe(20);
  });

  it("weights by distance rather than averaging the per-fill rates", async () => {
    // A small top-up over a short distance must not count as much as a full tank over a long shift.
    // 300 L over 5 h alongside 200 L over 20 h is 20 L/h overall, not the 40 an average would give.
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.equipment (organization_id, mine_site_id, name, category, meter_type, created_by)
       values ($1, $2, 'Drill 1', 'drill', 'hours', $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId]);
    await issue(rows[0].id, 300, 100, 30);
    await issue(rows[0].id, 200, 105, 20);
    await issue(rows[0].id, 0.001, 125, 10);

    const byName = Object.fromEntries((await consumption()).map((row) => [row.equipment_name, row]));
    expect(Number(byName["Drill 1"].litres_per_unit)).toBeCloseTo(500 / 25, 2);
  });

  it("skips an issue with no meter reading rather than guessing", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.equipment (organization_id, mine_site_id, name, category, meter_type, created_by)
       values ($1, $2, 'Truck 1', 'haul_truck', 'kilometres', $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId]);
    await db.query(
      `insert into public.fuel_issues
         (organization_id, mine_site_id, storage_location_id, equipment_id, litres, issued_on, created_by)
       values ($1, $2, $3, $4, 500, current_date, $5)`,
      [acme.organizationId, acme.siteId, tank, rows[0].id, acme.userId]);

    const names = (await consumption()).map((row) => row.equipment_name);
    expect(names).not.toContain("Truck 1");
  });

  it("skips a meter that has gone backwards", async () => {
    // A replaced meter or a typo. A negative span would produce a confident, meaningless number.
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.equipment (organization_id, mine_site_id, name, category, meter_type, created_by)
       values ($1, $2, 'Dozer 1', 'other', 'hours', $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId]);
    await issue(rows[0].id, 100, 900, 30);
    await issue(rows[0].id, 100, 400, 20);

    const byName = Object.fromEntries((await consumption()).map((row) => [row.equipment_name, row]));
    // Only the forward span from 400 to 900 survives, so the figure stays sane rather than negative.
    if (byName["Dozer 1"]) expect(Number(byName["Dozer 1"].litres_per_unit)).toBeGreaterThan(0);
  });

  it("refuses a caller who cannot read fuel", async () => {
    await actAs(db, rival.userId);
    const message = await expectRejection(() =>
      db.query("select * from public.equipment_fuel_consumption($1, current_date - 365, current_date)", [acme.siteId]));
    expect(message).toMatch(/permission denied/i);
  });

  it("returns nothing for a period with no issues", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query(
      "select * from public.equipment_fuel_consumption($1, current_date - 3650, current_date - 3000)", [acme.siteId]);
    expect(rows).toEqual([]);
  });
});
