import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  asAuthenticatedRole,
  createTestDatabase,
  createWorkspace,
  expectRejection,
  type TestDatabase,
  type Workspace,
} from "./harness";

let db: TestDatabase;
let acme: Workspace;
let rival: Workspace;
let tank: string;
let store: string;
let item: string;
let shiftId: string;

/** Audit entries for one action, newest first. */
const entries = async (action: string) =>
  (await db.query<{ action: string; entity_type: string; entity_id: string; user_id: string; new_values: Record<string, unknown> }>(
    `select action, entity_type, entity_id, user_id, new_values from public.audit_logs
     where organization_id = $1 and action = $2 order by created_at desc`,
    [acme.organizationId, action])).rows;

const actions = async () =>
  (await db.query<{ action: string }>(
    "select distinct action from public.audit_logs where organization_id = $1", [acme.organizationId])).rows
    .map((row) => row.action);

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");
  await actAs(db, acme.userId);

  tank = (await db.query<{ id: string }>(
    `insert into public.fuel_storage_locations (organization_id, mine_site_id, name, current_balance_litres, created_by)
     values ($1, $2, 'Bowser 1', 5000, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId])).rows[0].id;

  store = (await db.query<{ id: string }>(
    `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
     values ($1, $2, 'Main store', $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId])).rows[0].id;

  item = (await db.query<{ id: string }>(
    `insert into public.inventory_items (organization_id, name, unit, created_by)
     values ($1, 'Drill bit', 'each', $2) returning id`,
    [acme.organizationId, acme.userId])).rows[0].id;

  shiftId = (await db.query<{ id: string }>(
    `insert into public.shifts (organization_id, mine_site_id, name, shift_date, created_by)
     values ($1, $2, 'Day', current_date, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId])).rows[0].id;
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("moving a balance", () => {
  it("records who adjusted fuel, and by how much", async () => {
    // The single most abusable action in the product: 4,000 litres out of a tank with a free-text
    // reason. It was not in the audit log at all.
    await actAs(db, acme.userId);
    await db.query("select public.record_fuel_adjustment($1, -4000, 'Spillage', current_date, null)", [tank]);

    const [entry] = await entries("fuel.adjusted");
    expect(entry.user_id).toBe(acme.userId);
    expect(entry.entity_type).toBe("fuel_adjustment");
    expect(Number(entry.new_values.litres_delta)).toBe(-4000);
    expect(entry.new_values.reason).toBe("Spillage");
  });

  it("records a fuel stock take with both figures", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.record_fuel_stock_take($1, 500, current_date, 'Monthly dip')", [tank]);

    const [entry] = await entries("fuel.stock_take");
    expect(Number(entry.new_values.measured_litres)).toBe(500);
    expect(Number(entry.new_values.variance_litres)).not.toBe(0);
  });

  it("records a stock adjustment", async () => {
    await actAs(db, acme.userId);
    await db.query(
      "select public.record_stock_adjustment($1, $2, 25, 'Found on shelf', 'correction', current_date, null)",
      [item, store]);

    const [entry] = await entries("inventory.adjusted");
    expect(Number(entry.new_values.quantity_delta)).toBe(25);
  });
});

describe("approving", () => {
  it("records who approved production, and what it was before", async () => {
    // What a royalty return is built from. Previously the only trace was updated_by on the row,
    // which the next edit overwrites.
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.production_entries
         (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
       values ($1, $2, $3, current_date, 'gold ore', 120, 'tonne', 'draft', $4) returning id`,
      [acme.organizationId, acme.siteId, shiftId, acme.userId]);
    await db.query("update public.production_entries set status = 'submitted' where id = $1", [rows[0].id]);
    await db.query("select public.review_production_entry($1, 'approved', null)", [rows[0].id]);

    const approved = await entries("production.approved");
    expect(approved).toHaveLength(1);
    expect(approved[0].user_id).toBe(acme.userId);

    // The status it moved from is kept, so the log says what changed rather than only what it is now.
    const { rows: previous } = await db.query<{ previous_values: { status: string } }>(
      `select previous_values from public.audit_logs
       where organization_id = $1 and action = 'production.approved'`, [acme.organizationId]);
    expect(previous[0].previous_values.status).toBe("submitted");
  });

  it("records a rejection as readily as an approval", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.production_entries
         (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
       values ($1, $2, $3, current_date, 'gold ore', 5, 'tonne', 'draft', $4) returning id`,
      [acme.organizationId, acme.siteId, shiftId, acme.userId]);
    await db.query("update public.production_entries set status = 'submitted' where id = $1", [rows[0].id]);
    await db.query("select public.review_production_entry($1, 'rejected', 'Figures do not match the shift')", [rows[0].id]);

    expect(await entries("production.rejected")).toHaveLength(1);
  });

  it("does not write a line when nothing about the status changed", async () => {
    // An unrelated edit must not fill the log with rows nobody needs to read.
    await actAs(db, acme.userId);
    const before = (await entries("production.draft")).length;
    const { rows } = await db.query<{ id: string }>(
      `insert into public.production_entries
         (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, status, created_by)
       values ($1, $2, $3, current_date, 'gold ore', 8, 'tonne', 'draft', $4) returning id`,
      [acme.organizationId, acme.siteId, shiftId, acme.userId]);
    await db.query("update public.production_entries set location = 'Pit 2' where id = $1", [rows[0].id]);
    expect((await entries("production.draft")).length).toBe(before);
  });
});

describe("things leaving the working set", () => {
  it("records retiring a store, and restoring it", async () => {
    await actAs(db, acme.userId);
    // Empty first: the catalogue guard refuses to retire a store holding stock.
    await db.query(
      "update public.inventory_stock_balances set quantity = 0 where inventory_location_id = $1", [store]);
    await db.query("update public.inventory_locations set is_active = false where id = $1", [store]);
    await db.query("update public.inventory_locations set is_active = true where id = $1", [store]);

    expect(await entries("inventory.store.retired")).toHaveLength(1);
    expect(await entries("inventory.store.restored")).toHaveLength(1);
  });

  it("records removing a worker", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.workers (organization_id, mine_site_id, full_name, created_by)
       values ($1, $2, 'Asha Mwangi', $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId]);
    await db.query("update public.workers set deleted_at = now() where id = $1", [rows[0].id]);

    const [entry] = await entries("worker.removed");
    expect(entry.entity_id).toBe(rows[0].id);
  });

  it("records retiring a compliance requirement", async () => {
    // Dropping a legal obligation is precisely the decision somebody later disputes.
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.compliance_requirements (organization_id, name, recurrence, created_by, updated_by)
       values ($1, 'Quarterly environmental return', 'quarterly', $2, $2) returning id`,
      [acme.organizationId, acme.userId]);
    await db.query("update public.compliance_requirements set is_active = false where id = $1", [rows[0].id]);

    expect(await entries("compliance.requirement.retired")).toHaveLength(1);
  });

  it("writes nothing for an edit that retires nothing", async () => {
    await actAs(db, acme.userId);
    const before = (await actions()).length;
    await db.query("update public.inventory_items set notes = 'Reordered from the new supplier' where id = $1", [item]);
    expect((await actions()).length).toBe(before);
  });
});

describe("the trail itself", () => {
  it("cannot be written by a client", async () => {
    // An audit log anyone can append to proves nothing. Only the triggers write here.
    await actAs(db, acme.userId);
    const message = await asAuthenticatedRole(db, () => expectRejection(() => db.query(
      `insert into public.audit_logs (organization_id, user_id, action, entity_type)
       values ($1, $2, 'fabricated', 'organization')`,
      [acme.organizationId, acme.userId])));
    expect(message).toMatch(/row-level security/i);
  });

  it("cannot be edited or deleted by a client", async () => {
    await actAs(db, acme.userId);
    const changed = await asAuthenticatedRole(db, async () =>
      (await db.query("update public.audit_logs set action = 'nothing happened' where organization_id = $1",
        [acme.organizationId])).affectedRows ?? 0);
    expect(changed).toBe(0);

    const deleted = await asAuthenticatedRole(db, async () =>
      (await db.query("delete from public.audit_logs where organization_id = $1", [acme.organizationId])).affectedRows ?? 0);
    expect(deleted).toBe(0);
  });

  it("shows one organization nothing of another's", async () => {
    await actAs(db, rival.userId);
    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.audit_logs where organization_id = $1", [acme.organizationId])).rows);
    expect(rows).toEqual([]);
  });

  it("attributes every entry to the person who acted", async () => {
    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.audit_logs
       where organization_id = $1 and user_id is null`, [acme.organizationId]);
    expect(Number(rows[0].count)).toBe(0);
  });
});

describe("what is now covered", () => {
  // The list is asserted rather than described, so a trigger dropped in a later migration fails here
  // rather than leaving a hole nobody notices until an inspector asks.
  it("records every action that moves value or discharges an obligation", async () => {
    const recorded = new Set(await actions());
    for (const action of [
      "fuel.adjusted",
      "fuel.stock_take",
      "inventory.adjusted",
      "production.approved",
      "production.rejected",
      "inventory.store.retired",
      "worker.removed",
      "compliance.requirement.retired",
    ]) {
      expect(recorded.has(action), action).toBe(true);
    }
  });
});
