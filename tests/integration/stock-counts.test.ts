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
let store: string;
let drillBit: string;
let hose: string;
let grease: string;

const newItem = async (name: string) =>
  (await db.query<{ id: string }>(
    `insert into public.inventory_items (organization_id, name, unit, created_by)
     values ($1, $2, 'each', $3) returning id`,
    [acme.organizationId, name, acme.userId])).rows[0].id;

const setBalance = (itemId: string, quantity: number) =>
  db.query(
    `insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity)
     values ($1, $2, $3, $4)
     on conflict (inventory_item_id, inventory_location_id) do update set quantity = excluded.quantity`,
    [acme.organizationId, itemId, store, quantity]);

const balanceOf = async (itemId: string) =>
  Number((await db.query<{ quantity: string }>(
    "select quantity from public.inventory_stock_balances where inventory_item_id = $1 and inventory_location_id = $2",
    [itemId, store])).rows[0]?.quantity ?? 0);

async function newCount(reference: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.inventory_stock_counts
       (organization_id, mine_site_id, inventory_location_id, reference, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $5) returning id`,
    [acme.organizationId, acme.siteId, store, reference, acme.userId]);
  return rows[0].id;
}

const addLine = (countId: string, itemId: string, counted: number) =>
  db.query(
    `insert into public.inventory_stock_count_lines
       (organization_id, stock_count_id, inventory_item_id, counted_quantity, created_by)
     values ($1, $2, $3, $4, $5)`,
    [acme.organizationId, countId, itemId, counted, acme.userId]);

const apply = async (countId: string) =>
  Number((await db.query<{ apply_inventory_stock_count: number }>(
    "select public.apply_inventory_stock_count($1)", [countId])).rows[0].apply_inventory_stock_count);

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");
  await actAs(db, acme.userId);

  const { rows } = await db.query<{ id: string }>(
    `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
     values ($1, $2, 'Main store', $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId]);
  store = rows[0].id;

  drillBit = await newItem("Drill bit");
  hose = await newItem("Hydraulic hose");
  grease = await newItem("Grease cartridge");
  await setBalance(drillBit, 100);
  await setBalance(hose, 20);
  await setBalance(grease, 5);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("applying a count", () => {
  let countId: string;

  beforeAll(async () => {
    await actAs(db, acme.userId);
    countId = await newCount("COUNT-1");
    await addLine(countId, drillBit, 94);  // six short
    await addLine(countId, hose, 20);      // agrees
    await addLine(countId, grease, 7);     // two over
  });

  it("reports how many lines disagreed with the book", async () => {
    // The number of findings, not the number of lines. Two of the three were wrong.
    expect(await apply(countId)).toBe(2);
  });

  it("corrects each balance to what was counted", async () => {
    expect(await balanceOf(drillBit)).toBe(94);
    expect(await balanceOf(hose)).toBe(20);
    expect(await balanceOf(grease)).toBe(7);
  });

  it("keeps the book quantity and the variance on every line", async () => {
    // The whole point: correcting the balance without recording what it was is how shrinkage
    // becomes invisible.
    const { rows } = await db.query<{ name: string; counted_quantity: string; book_quantity: string; variance_quantity: string }>(
      `select i.name, l.counted_quantity, l.book_quantity, l.variance_quantity
       from public.inventory_stock_count_lines l
       join public.inventory_items i on i.id = l.inventory_item_id
       where l.stock_count_id = $1 order by i.name`, [countId]);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));

    expect(Number(byName["Drill bit"].book_quantity)).toBe(100);
    expect(Number(byName["Drill bit"].variance_quantity)).toBe(-6);
    expect(Number(byName["Hydraulic hose"].variance_quantity)).toBe(0);
    expect(Number(byName["Grease cartridge"].variance_quantity)).toBe(2);
  });

  it("writes an adjustment for each disagreement and none for the agreement", async () => {
    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.stock_adjustments
       where inventory_location_id = $1`, [store]);
    expect(Number(rows[0].count)).toBe(2);
  });

  it("marks the count applied, with who and when", async () => {
    const { rows } = await db.query<{ status: string; applied_by: string; applied_at: string }>(
      "select status, applied_by, applied_at from public.inventory_stock_counts where id = $1", [countId]);
    expect(rows[0].status).toBe("applied");
    expect(rows[0].applied_by).toBe(acme.userId);
    expect(rows[0].applied_at).toBeTruthy();
  });

  it("refuses to apply the same count twice", async () => {
    // Applying twice would adjust each item a second time by the same amount, doubling a
    // correction that was already right.
    const message = await expectRejection(() => apply(countId));
    expect(message).toMatch(/already applied/i);
  });

  it("refuses to change a line once the count is applied", async () => {
    // Rewriting a counted quantity afterwards would leave the variance disagreeing with the
    // adjustment that was actually made, and nothing to say which was right.
    const message = await expectRejection(() => db.query(
      "update public.inventory_stock_count_lines set counted_quantity = 1 where stock_count_id = $1", [countId]));
    expect(message).toMatch(/has been applied/i);
  });

  it("refuses to add a line to an applied count", async () => {
    const message = await expectRejection(() => addLine(countId, drillBit, 5));
    expect(message).toMatch(/has been applied/i);
  });

  it("clears the flag that let the apply function past its own guard", async () => {
    // apply_inventory_stock_count announces itself through a transaction-local setting so it can
    // write each line's book quantity after marking the count applied. If that flag survived the
    // call, the guard would be off for everything that followed in the same transaction.
    const { rows } = await db.query<{ flag: string }>(
      "select coalesce(current_setting('mantara.applying_stock_count', true), '') as flag");
    expect(rows[0].flag).toBe("");
  });

  it("cannot be unlocked by naming a different count", async () => {
    // The flag is checked against the specific count being written, so setting it for one count
    // does not open every other one.
    const other = await newCount("COUNT-OTHER");
    await db.query("select set_config('mantara.applying_stock_count', $1, true)", [other]);
    const message = await expectRejection(() => db.query(
      "update public.inventory_stock_count_lines set counted_quantity = 1 where stock_count_id = $1", [countId]));
    expect(message).toMatch(/has been applied/i);
    await db.query("select set_config('mantara.applying_stock_count', '', true)");
  });
});

describe("counting something the store has never held", () => {
  it("creates the balance rather than failing", async () => {
    // A storekeeper finding five of something the system does not know is there is exactly the
    // discovery a count exists to make.
    await actAs(db, acme.userId);
    const newcomer = await newItem("Filter element");
    const countId = await newCount("COUNT-NEW");
    await addLine(countId, newcomer, 5);

    expect(await apply(countId)).toBe(1);
    expect(await balanceOf(newcomer)).toBe(5);

    const { rows } = await db.query<{ book_quantity: string; variance_quantity: string }>(
      "select book_quantity, variance_quantity from public.inventory_stock_count_lines where stock_count_id = $1", [countId]);
    expect(Number(rows[0].book_quantity)).toBe(0);
    expect(Number(rows[0].variance_quantity)).toBe(5);
  });
});

describe("what a count refuses", () => {
  it("refuses an empty count", async () => {
    await actAs(db, acme.userId);
    const empty = await newCount("COUNT-EMPTY");
    const message = await expectRejection(() => apply(empty));
    expect(message).toMatch(/no lines/i);
  });

  it("refuses a negative counted quantity", async () => {
    await actAs(db, acme.userId);
    const countId = await newCount("COUNT-NEG");
    const message = await expectRejection(() => addLine(countId, drillBit, -1));
    expect(message).toMatch(/violates check constraint/i);
  });

  it("refuses the same item twice in one count", async () => {
    // Counting a shelf twice should correct the first line, not add a second that silently
    // doubles the correction.
    await actAs(db, acme.userId);
    const countId = await newCount("COUNT-DUP");
    await addLine(countId, drillBit, 10);
    const message = await expectRejection(() => addLine(countId, drillBit, 12));
    expect(message).toMatch(/duplicate key|unique/i);
  });

  it("refuses a caller who cannot adjust stock", async () => {
    const clerk = await createUser(db, "clerk@acme.test");
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role_id, status)
       select $1, $2, r.id, 'active' from public.roles r where r.organization_id = $1 and r.code = 'site_supervisor'`,
      [acme.organizationId, clerk]);
    const countId = await newCount("COUNT-PERM");
    await addLine(countId, drillBit, 1);

    await actAs(db, clerk);
    const message = await expectRejection(() => apply(countId));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses a count in another organization", async () => {
    await actAs(db, acme.userId);
    const countId = await newCount("COUNT-TENANT");
    await addLine(countId, drillBit, 1);

    await actAs(db, rival.userId);
    const message = await expectRejection(() => apply(countId));
    expect(message).toMatch(/permission denied/i);
  });

  it("shows one organization nothing of another's counts", async () => {
    await actAs(db, rival.userId);
    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.inventory_stock_counts")).rows);
    expect(rows).toEqual([]);
  });
});

describe("shrinkage", () => {
  it("totals what the counts found, worst shortfall first", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ item_name: string; counts: string; variance_total: string }>(
      "select * from public.inventory_shrinkage($1, current_date - 30, current_date)", [acme.siteId]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].item_name).toBe("Drill bit");
    expect(Number(rows[0].variance_total)).toBe(-6);
  });

  it("counts an item short in two separate counts as short twice over", async () => {
    // One negative variance is a miscount as often as a loss. The same item short repeatedly is
    // the thing worth acting on, and only totalling makes that visible.
    await actAs(db, acme.userId);
    const second = await newCount("COUNT-2");
    await addLine(second, drillBit, 90);
    await apply(second);

    const { rows } = await db.query<{ item_name: string; counts: string; variance_total: string }>(
      "select * from public.inventory_shrinkage($1, current_date - 30, current_date)", [acme.siteId]);
    const drill = rows.find((row) => row.item_name === "Drill bit");
    expect(Number(drill?.counts)).toBe(2);
    expect(Number(drill?.variance_total)).toBe(-10); // -6 then -4
  });

  it("ignores a draft count, because nothing has been established yet", async () => {
    await actAs(db, acme.userId);
    const draft = await newCount("COUNT-DRAFT");
    await addLine(draft, hose, 1);

    const { rows } = await db.query<{ item_name: string; counts: string }>(
      "select * from public.inventory_shrinkage($1, current_date - 30, current_date)", [acme.siteId]);
    const hoseRow = rows.find((row) => row.item_name === "Hydraulic hose");
    expect(Number(hoseRow?.counts ?? 0)).toBeLessThanOrEqual(1);
  });

  it("refuses a caller who cannot read inventory", async () => {
    await actAs(db, rival.userId);
    const message = await expectRejection(() =>
      db.query("select * from public.inventory_shrinkage($1, current_date - 30, current_date)", [acme.siteId]));
    expect(message).toMatch(/permission denied/i);
  });
});
