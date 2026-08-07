import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  createTestDatabase,
  createWorkspace,
  expectRejection,
  type TestDatabase,
  type Workspace,
} from "./harness";

let db: TestDatabase;
let acme: Workspace;

const newItem = async (name: string) => {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.inventory_items (organization_id, name, unit, created_by)
     values ($1, $2, 'each', $3) returning id`,
    [acme.organizationId, name, acme.userId],
  );
  return rows[0].id;
};

const newStore = async (name: string) => {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
     values ($1, $2, $3, $4) returning id`,
    [acme.organizationId, acme.siteId, name, acme.userId],
  );
  return rows[0].id;
};

const setBalance = (itemId: string, locationId: string, quantity: number) =>
  db.query(
    `insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity)
     values ($1, $2, $3, $4)
     on conflict (inventory_item_id, inventory_location_id) do update set quantity = excluded.quantity`,
    [acme.organizationId, itemId, locationId, quantity],
  );

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  await actAs(db, acme.userId);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("retiring a store that still holds stock", () => {
  // Retiring a store removes it from every movement form. Anything left in it becomes invisible and
  // unmovable — the database still has it, but no screen would ever show it again, and the figures
  // an operator reads stop matching what is on the ground. Empty it first.
  it("is refused, and says how much is in the way", async () => {
    const itemId = await newItem("Drill bit");
    const storeId = await newStore("Main store");
    await setBalance(itemId, storeId, 40);

    const message = await expectRejection(() =>
      db.query("update public.inventory_locations set is_active = false where id = $1", [storeId]));
    expect(message).toMatch(/still holds/i);
    expect(message).toContain("40");
  });

  it("is allowed once the store is empty", async () => {
    const itemId = await newItem("Spanner");
    const storeId = await newStore("Empty store");
    await setBalance(itemId, storeId, 5);
    await setBalance(itemId, storeId, 0);

    await db.query("update public.inventory_locations set is_active = false where id = $1", [storeId]);
    const { rows } = await db.query<{ is_active: boolean }>(
      "select is_active from public.inventory_locations where id = $1", [storeId]);
    expect(rows[0].is_active).toBe(false);
  });

  it("does not block an ordinary correction to a stocked store", async () => {
    // The guard is about retirement, not about editing. Fixing a name must stay easy.
    const itemId = await newItem("Grease");
    const storeId = await newStore("Typo stre");
    await setBalance(itemId, storeId, 12);

    await db.query("update public.inventory_locations set name = 'Typo store' where id = $1", [storeId]);
    const { rows } = await db.query<{ name: string }>(
      "select name from public.inventory_locations where id = $1", [storeId]);
    expect(rows[0].name).toBe("Typo store");
  });

  it("does not block bringing a retired store back", async () => {
    const storeId = await newStore("Seasonal store");
    await db.query("update public.inventory_locations set is_active = false where id = $1", [storeId]);
    await db.query("update public.inventory_locations set is_active = true where id = $1", [storeId]);
    const { rows } = await db.query<{ is_active: boolean }>(
      "select is_active from public.inventory_locations where id = $1", [storeId]);
    expect(rows[0].is_active).toBe(true);
  });
});

describe("retiring an item that is still in stock", () => {
  it("is refused when the item is deactivated", async () => {
    const itemId = await newItem("Hydraulic hose");
    const storeId = await newStore("Hose store");
    await setBalance(itemId, storeId, 7);

    const message = await expectRejection(() =>
      db.query("update public.inventory_items set is_active = false where id = $1", [itemId]));
    expect(message).toMatch(/still.*in stock/i);
  });

  it("is refused by the soft-delete route as well", async () => {
    // Both ways out of the catalogue have to be closed, or the guard is only advice.
    const itemId = await newItem("Bearing");
    const storeId = await newStore("Bearing store");
    await setBalance(itemId, storeId, 3);

    const message = await expectRejection(() =>
      db.query("update public.inventory_items set deleted_at = now() where id = $1", [itemId]));
    expect(message).toMatch(/still.*in stock/i);
  });

  it("sums across every store, not just one", async () => {
    const itemId = await newItem("Filter");
    const first = await newStore("Filter store A");
    const second = await newStore("Filter store B");
    await setBalance(itemId, first, 0);
    await setBalance(itemId, second, 2);

    const message = await expectRejection(() =>
      db.query("update public.inventory_items set is_active = false where id = $1", [itemId]));
    expect(message).toContain("2");
  });

  it("is allowed for an item with no stock anywhere", async () => {
    const itemId = await newItem("Discontinued widget");
    await db.query("update public.inventory_items set is_active = false where id = $1", [itemId]);
    const { rows } = await db.query<{ is_active: boolean }>(
      "select is_active from public.inventory_items where id = $1", [itemId]);
    expect(rows[0].is_active).toBe(false);
  });
});

describe("retiring a fuel tank with fuel in it", () => {
  const newTank = async (name: string, litres: number) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.fuel_storage_locations
         (organization_id, mine_site_id, name, current_balance_litres, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [acme.organizationId, acme.siteId, name, litres, acme.userId],
    );
    return rows[0].id;
  };

  it("is refused, naming the litres still held", async () => {
    const tankId = await newTank("Bowser 1", 1500);
    const message = await expectRejection(() =>
      db.query("update public.fuel_storage_locations set is_active = false where id = $1", [tankId]));
    expect(message).toMatch(/litres/i);
    expect(message).toContain("1500");
  });

  it("is allowed for an empty tank", async () => {
    const tankId = await newTank("Bowser 2", 0);
    await db.query("update public.fuel_storage_locations set is_active = false where id = $1", [tankId]);
    const { rows } = await db.query<{ is_active: boolean }>(
      "select is_active from public.fuel_storage_locations where id = $1", [tankId]);
    expect(rows[0].is_active).toBe(false);
  });

  it("still allows the capacity and fuel type to be corrected on a full tank", async () => {
    const tankId = await newTank("Bowser 3", 900);
    await db.query(
      "update public.fuel_storage_locations set capacity_litres = 5000, fuel_type = 'petrol' where id = $1",
      [tankId]);
    const { rows } = await db.query<{ capacity_litres: string; fuel_type: string }>(
      "select capacity_litres, fuel_type from public.fuel_storage_locations where id = $1", [tankId]);
    expect(Number(rows[0].capacity_litres)).toBe(5000);
    expect(rows[0].fuel_type).toBe("petrol");
  });
});

describe("expense categories", () => {
  it("can be retired freely, because nothing is stranded by it", async () => {
    // Categories hold no balance. Expenses already filed keep pointing at the category and keep
    // reporting correctly; it simply stops being offered on new entries.
    const { rows } = await db.query<{ id: string }>(
      `insert into public.expense_categories (organization_id, name, created_by)
       values ($1, 'Old cost code', $2) returning id`,
      [acme.organizationId, acme.userId],
    );
    await db.query("update public.expense_categories set is_active = false where id = $1", [rows[0].id]);
    const { rows: after } = await db.query<{ is_active: boolean }>(
      "select is_active from public.expense_categories where id = $1", [rows[0].id]);
    expect(after[0].is_active).toBe(false);
  });
});
