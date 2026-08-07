import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  createTestDatabase,
  createWorkspace,
  expectRejection,
  type TestDatabase,
  type Workspace,
} from "./harness";

/**
 * These exercise the rules the application relies on the database to enforce. Client-side validation
 * is covered by the unit tests; everything here is a rule that must hold even when the write does not
 * come from our UI.
 */
let db: TestDatabase;
let acme: Workspace;

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
}, 120_000);

afterAll(async () => { await db?.close(); });

async function newEquipment(name: string, meter: number | null = null) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.equipment (organization_id, mine_site_id, name, current_meter, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $5) returning id`,
    [acme.organizationId, acme.siteId, name, meter, acme.userId],
  );
  return rows[0].id;
}

describe("equipment meter readings", () => {
  it("accepts a reading at or above the current meter", async () => {
    const id = await newEquipment("Excavator A", 100);
    await db.query("select public.record_equipment_meter_reading($1, $2)", [id, 150]);
    const { rows } = await db.query<{ current_meter: string }>("select current_meter from public.equipment where id = $1", [id]);
    expect(Number(rows[0].current_meter)).toBe(150);
  });

  it("rejects a reading below the current meter", async () => {
    const id = await newEquipment("Excavator B", 500);
    const message = await expectRejection(() => db.query("select public.record_equipment_meter_reading($1, $2)", [id, 400]));
    expect(message).toMatch(/below the recorded meter/i);
  });

  it("leaves the meter unchanged after a rejected reading", async () => {
    const id = await newEquipment("Excavator C", 500);
    await expectRejection(() => db.query("select public.record_equipment_meter_reading($1, $2)", [id, 10]));
    const { rows } = await db.query<{ current_meter: string }>("select current_meter from public.equipment where id = $1", [id]);
    expect(Number(rows[0].current_meter)).toBe(500);
  });

  it("logs a status change to history automatically", async () => {
    const id = await newEquipment("Loader A");
    await db.query("select public.set_equipment_status($1, 'breakdown', $2)", [id, "Hydraulic failure"]);
    const { rows } = await db.query<{ previous_status: string; new_status: string; reason: string }>(
      "select previous_status, new_status, reason from public.equipment_status_history where equipment_id = $1",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ previous_status: "operational", new_status: "breakdown", reason: "Hydraulic failure" });
  });

  it("logs history even when the table is updated directly, without a reason", async () => {
    const id = await newEquipment("Loader B");
    await db.query("update public.equipment set status = 'maintenance', updated_by = $2 where id = $1", [id, acme.userId]);
    const { rows } = await db.query<{ new_status: string; reason: string | null }>(
      "select new_status, reason from public.equipment_status_history where equipment_id = $1",
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].new_status).toBe("maintenance");
    expect(rows[0].reason).toBeNull();
  });
});

describe("fuel balances", () => {
  async function newStore(name: string, capacity: number | null = null) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.fuel_storage_locations (organization_id, mine_site_id, name, capacity_litres, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $5) returning id`,
      [acme.organizationId, acme.siteId, name, capacity, acme.userId],
    );
    return rows[0].id;
  }
  const balanceOf = async (id: string) => {
    const { rows } = await db.query<{ current_balance_litres: string }>("select current_balance_litres from public.fuel_storage_locations where id = $1", [id]);
    return Number(rows[0].current_balance_litres);
  };

  it("adds a delivery to the balance", async () => {
    const id = await newStore("Tank A");
    await db.query("select public.record_fuel_receipt($1, $2)", [id, 1000]);
    expect(await balanceOf(id)).toBe(1000);
  });

  it("subtracts an issue from the balance", async () => {
    const id = await newStore("Tank B");
    await db.query("select public.record_fuel_receipt($1, $2)", [id, 1000]);
    await db.query("select public.record_fuel_issue($1, $2)", [id, 250]);
    expect(await balanceOf(id)).toBe(750);
  });

  it("rejects an issue larger than the balance and says how much remains", async () => {
    const id = await newStore("Tank C");
    await db.query("select public.record_fuel_receipt($1, $2)", [id, 100]);
    const message = await expectRejection(() => db.query("select public.record_fuel_issue($1, $2)", [id, 150]));
    expect(message).toMatch(/100.*remain/i);
    expect(await balanceOf(id)).toBe(100);
  });

  it("records no movement row when the issue is rejected", async () => {
    const id = await newStore("Tank D");
    await db.query("select public.record_fuel_receipt($1, $2)", [id, 50]);
    await expectRejection(() => db.query("select public.record_fuel_issue($1, $2)", [id, 500]));
    const { rows } = await db.query("select id from public.fuel_issues where storage_location_id = $1", [id]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a delivery beyond the stated capacity", async () => {
    const id = await newStore("Tank E", 500);
    const message = await expectRejection(() => db.query("select public.record_fuel_receipt($1, $2)", [id, 600]));
    expect(message).toMatch(/capacity/i);
  });

  it("rejects a negative adjustment larger than the balance", async () => {
    const id = await newStore("Tank F");
    await db.query("select public.record_fuel_receipt($1, $2)", [id, 20]);
    await expectRejection(() => db.query("select public.record_fuel_adjustment($1, $2, $3)", [id, -50, "Stock take"]));
    expect(await balanceOf(id)).toBe(20);
  });
});

describe("production approval lifecycle", () => {
  async function newEntry(material: string) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.production_entries (organization_id, mine_site_id, material, quantity, created_by, updated_by)
       values ($1, $2, $3, 100, $4, $4) returning id`,
      [acme.organizationId, acme.siteId, material, acme.userId],
    );
    return rows[0].id;
  }
  const statusOf = async (id: string) => {
    const { rows } = await db.query<{ status: string }>("select status from public.production_entries where id = $1", [id]);
    return rows[0].status;
  };

  it("creates entries as drafts", async () => expect(await statusOf(await newEntry("Ore A"))).toBe("draft"));

  it("stamps submitted_at when an entry is submitted", async () => {
    const id = await newEntry("Ore B");
    await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [id, acme.userId]);
    const { rows } = await db.query<{ submitted_at: string | null }>("select submitted_at from public.production_entries where id = $1", [id]);
    expect(rows[0].submitted_at).not.toBeNull();
  });

  it("rejects a jump straight from draft to approved", async () => {
    const id = await newEntry("Ore C");
    const message = await expectRejection(() => db.query("update public.production_entries set status = 'approved', updated_by = $2 where id = $1", [id, acme.userId]));
    expect(message).toMatch(/cannot move a production entry from draft to approved/i);
  });

  it("records an approval and moves the entry", async () => {
    const id = await newEntry("Ore D");
    await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [id, acme.userId]);
    await db.query("select public.review_production_entry($1, 'approved', $2)", [id, "Matches weighbridge"]);
    expect(await statusOf(id)).toBe("approved");
    const { rows } = await db.query<{ decision: string }>("select decision from public.production_approvals where production_entry_id = $1", [id]);
    expect(rows).toEqual([{ decision: "approved" }]);
  });

  it("refuses to review an entry twice", async () => {
    const id = await newEntry("Ore E");
    await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [id, acme.userId]);
    await db.query("select public.review_production_entry($1, 'approved')", [id]);
    const message = await expectRejection(() => db.query("select public.review_production_entry($1, 'rejected')", [id]));
    expect(message).toMatch(/only a submitted entry can be reviewed/i);
  });

  it("refuses to review an entry that was never submitted", async () => {
    const id = await newEntry("Ore F");
    const message = await expectRejection(() => db.query("select public.review_production_entry($1, 'approved')", [id]));
    expect(message).toMatch(/only a submitted entry can be reviewed/i);
  });

  it("freezes the figures once approved", async () => {
    const id = await newEntry("Ore G");
    await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [id, acme.userId]);
    await db.query("select public.review_production_entry($1, 'approved')", [id]);
    const message = await expectRejection(() => db.query("update public.production_entries set quantity = 999, updated_by = $2 where id = $1", [id, acme.userId]));
    expect(message).toMatch(/approved production entry cannot be edited/i);
  });

  it("allows a rejected entry to return to draft and be resubmitted", async () => {
    const id = await newEntry("Ore H");
    await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [id, acme.userId]);
    await db.query("select public.review_production_entry($1, 'rejected')", [id]);
    await db.query("update public.production_entries set status = 'draft', updated_by = $2 where id = $1", [id, acme.userId]);
    await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [id, acme.userId]);
    expect(await statusOf(id)).toBe("submitted");
  });
});

describe("work orders and service schedules", () => {
  async function newWorkOrder(title: string, equipmentId: string | null = null) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.maintenance_work_orders (organization_id, mine_site_id, equipment_id, title, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $5) returning id`,
      [acme.organizationId, acme.siteId, equipmentId, title, acme.userId],
    );
    return rows[0].id;
  }

  it("rejects a jump from planned to completed", async () => {
    const id = await newWorkOrder("Service A");
    const message = await expectRejection(() => db.query("update public.maintenance_work_orders set status = 'completed', updated_by = $2 where id = $1", [id, acme.userId]));
    expect(message).toMatch(/cannot move a work order from planned to completed/i);
  });

  it("stamps started_at when work begins", async () => {
    const id = await newWorkOrder("Service B");
    await db.query("update public.maintenance_work_orders set status = 'in_progress', updated_by = $2 where id = $1", [id, acme.userId]);
    const { rows } = await db.query<{ started_at: string | null }>("select started_at from public.maintenance_work_orders where id = $1", [id]);
    expect(rows[0].started_at).not.toBeNull();
  });

  it("refuses to complete a work order that is not in progress", async () => {
    const id = await newWorkOrder("Service C");
    const message = await expectRejection(() => db.query("select public.complete_work_order($1)", [id]));
    expect(message).toMatch(/only a work order that is in progress can be completed/i);
  });

  it("rolls the service schedule forward on completion", async () => {
    const equipmentId = await newEquipment("Haul truck A", 1000);
    await db.query(
      `insert into public.maintenance_schedules (organization_id, mine_site_id, equipment_id, name, interval_meter, interval_days, created_by, updated_by)
       values ($1, $2, $3, '250 hour service', 250, 30, $4, $4)`,
      [acme.organizationId, acme.siteId, equipmentId, acme.userId],
    );
    const id = await newWorkOrder("Service D", equipmentId);
    await db.query("update public.maintenance_work_orders set status = 'in_progress', updated_by = $2 where id = $1", [id, acme.userId]);
    await db.query("select public.complete_work_order($1, $2)", [id, 1200]);

    const { rows } = await db.query<{ last_service_meter: string; next_due_meter: string; next_due_on: string; last_service_on: string }>(
      "select last_service_meter, next_due_meter, next_due_on, last_service_on from public.maintenance_schedules where equipment_id = $1",
      [equipmentId],
    );
    expect(Number(rows[0].last_service_meter)).toBe(1200);
    expect(Number(rows[0].next_due_meter)).toBe(1450);
    expect(rows[0].next_due_on).not.toBeNull();
    expect(rows[0].last_service_on).not.toBeNull();
  });

  it("stamps completed_at on completion", async () => {
    const id = await newWorkOrder("Service E");
    await db.query("update public.maintenance_work_orders set status = 'in_progress', updated_by = $2 where id = $1", [id, acme.userId]);
    await db.query("select public.complete_work_order($1)", [id]);
    const { rows } = await db.query<{ completed_at: string | null; status: string }>("select completed_at, status from public.maintenance_work_orders where id = $1", [id]);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].completed_at).not.toBeNull();
  });

  it("rejects a schedule with no interval at all", async () => {
    const equipmentId = await newEquipment("Haul truck B");
    await expectRejection(() => db.query(
      `insert into public.maintenance_schedules (organization_id, mine_site_id, equipment_id, name, created_by, updated_by)
       values ($1, $2, $3, 'Never due', $4, $4)`,
      [acme.organizationId, acme.siteId, equipmentId, acme.userId],
    ));
  });
});

describe("inventory stock balances", () => {
  async function newItem(name: string) {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.inventory_items (organization_id, name, created_by, updated_by) values ($1, $2, $3, $3) returning id",
      [acme.organizationId, name, acme.userId],
    );
    return rows[0].id;
  }
  async function newStore(name: string) {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.inventory_locations (organization_id, mine_site_id, name, created_by, updated_by) values ($1, $2, $3, $4, $4) returning id",
      [acme.organizationId, acme.siteId, name, acme.userId],
    );
    return rows[0].id;
  }
  const quantityAt = async (itemId: string, locationId: string) => {
    const { rows } = await db.query<{ quantity: string }>(
      "select quantity from public.inventory_stock_balances where inventory_item_id = $1 and inventory_location_id = $2",
      [itemId, locationId],
    );
    return rows.length ? Number(rows[0].quantity) : 0;
  };

  it("creates the balance on first receipt", async () => {
    const item = await newItem("Hose");
    const store = await newStore("Store A");
    await db.query("select public.record_stock_receipt($1, $2, $3)", [item, store, 10]);
    expect(await quantityAt(item, store)).toBe(10);
  });

  it("rejects an issue larger than the balance", async () => {
    const item = await newItem("Filter");
    const store = await newStore("Store B");
    await db.query("select public.record_stock_receipt($1, $2, $3)", [item, store, 5]);
    const message = await expectRejection(() => db.query("select public.record_stock_issue($1, $2, $3)", [item, store, 6]));
    expect(message).toMatch(/only 5/i);
    expect(await quantityAt(item, store)).toBe(5);
  });

  it("moves stock between stores on transfer", async () => {
    const item = await newItem("Bolt");
    const from = await newStore("Store C");
    const to = await newStore("Store D");
    await db.query("select public.record_stock_receipt($1, $2, $3)", [item, from, 20]);
    await db.query("select public.record_stock_transfer($1, $2, $3, $4)", [item, from, to, 8]);
    expect(await quantityAt(item, from)).toBe(12);
    expect(await quantityAt(item, to)).toBe(8);
  });

  it("leaves both stores unchanged when a transfer exceeds the source balance", async () => {
    const item = await newItem("Washer");
    const from = await newStore("Store E");
    const to = await newStore("Store F");
    await db.query("select public.record_stock_receipt($1, $2, $3)", [item, from, 4]);
    await expectRejection(() => db.query("select public.record_stock_transfer($1, $2, $3, $4)", [item, from, to, 10]));
    expect(await quantityAt(item, from)).toBe(4);
    expect(await quantityAt(item, to)).toBe(0);
  });

  it("rejects a transfer into the same store", async () => {
    const item = await newItem("Nut");
    const store = await newStore("Store G");
    await db.query("select public.record_stock_receipt($1, $2, $3)", [item, store, 5]);
    await expectRejection(() => db.query("select public.record_stock_transfer($1, $2, $3, $4)", [item, store, store, 1]));
  });

  it("rejects combining an item and a store from different organizations", async () => {
    const other = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");
    await actAs(db, acme.userId);
    const item = await newItem("Shared part");
    const { rows } = await db.query<{ id: string }>(
      "insert into public.inventory_locations (organization_id, mine_site_id, name, created_by, updated_by) values ($1, $2, 'Zeta store', $3, $3) returning id",
      [other.organizationId, other.siteId, other.userId],
    );
    const message = await expectRejection(() => db.query("select public.record_stock_receipt($1, $2, $3)", [item, rows[0].id, 1]));
    expect(message).toMatch(/different organizations/i);
  });
});
