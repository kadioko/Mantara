import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  asAuthenticatedRole,
  createTestDatabase,
  createUser,
  createWorkspace,
  type TestDatabase,
  type Workspace,
} from "./harness";

let db: TestDatabase;
let acme: Workspace;
let rival: Workspace;
let clerk: string;
let itemId: string;
let storeId: string;
let supplierId: string;
let tankId: string;
let expenseCategoryId: string;

/** Adds a member on a named role, then strips the permissions the test wants absent. */
async function addMember(userId: string, roleCode: string, dropPermissionPrefix?: string) {
  await actAs(db, acme.userId);
  await db.query(
    `insert into public.organization_memberships (organization_id, user_id, role_id, status)
     select $1, $2, r.id, 'active' from public.roles r where r.organization_id = $1 and r.code = $3`,
    [acme.organizationId, userId, roleCode],
  );
  if (dropPermissionPrefix) {
    await db.query(
      `delete from public.role_permissions rp using public.roles r, public.permissions p
       where rp.role_id = r.id and rp.permission_id = p.id
         and r.organization_id = $1 and r.code = $2 and p.code like $3`,
      [acme.organizationId, roleCode, `${dropPermissionPrefix}.manage`],
    );
  }
}

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");
  clerk = await createUser(db, "clerk@acme.test");

  await actAs(db, acme.userId);
  const rows = async (sql: string, params: unknown[]) =>
    (await db.query<{ id: string }>(sql, params)).rows[0].id;

  itemId = await rows(
    `insert into public.inventory_items (organization_id, name, unit, created_by)
     values ($1, 'Drill bit', 'each', $2) returning id`, [acme.organizationId, acme.userId]);
  storeId = await rows(
    `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
     values ($1, $2, 'Main store', $3) returning id`, [acme.organizationId, acme.siteId, acme.userId]);
  supplierId = await rows(
    `insert into public.suppliers (organization_id, name, created_by)
     values ($1, 'Tanzania Tools', $2) returning id`, [acme.organizationId, acme.userId]);
  tankId = await rows(
    `insert into public.fuel_storage_locations (organization_id, mine_site_id, name, created_by)
     values ($1, $2, 'Bowser 1', $3) returning id`, [acme.organizationId, acme.siteId, acme.userId]);
  expenseCategoryId = await rows(
    `insert into public.expense_categories (organization_id, name, created_by)
     values ($1, 'Consumables', $2) returning id`, [acme.organizationId, acme.userId]);

  // A member who can read inventory but was never granted inventory.manage.
  await addMember(clerk, "site_supervisor", "inventory");
}, 120_000);

afterAll(async () => { await db?.close(); });

/** Runs an UPDATE under RLS and reports how many rows it actually changed. */
async function updateAs(userId: string, sql: string, params: unknown[]) {
  await actAs(db, userId);
  return asAuthenticatedRole(db, async () => (await db.query(sql, params)).affectedRows ?? 0);
}

describe("a member without manage permission", () => {
  // RLS on an UPDATE does not raise: the row simply falls outside the policy and nothing changes.
  // Asserting on the affected count is the only way to tell a refusal from a success.
  it("cannot rename an inventory item", async () => {
    const changed = await updateAs(clerk, "update public.inventory_items set name = 'Renamed' where id = $1", [itemId]);
    expect(changed).toBe(0);
    const { rows } = await db.query<{ name: string }>("select name from public.inventory_items where id = $1", [itemId]);
    expect(rows[0].name).toBe("Drill bit");
  });

  it("cannot retire an inventory item", async () => {
    const changed = await updateAs(clerk, "update public.inventory_items set is_active = false where id = $1", [itemId]);
    expect(changed).toBe(0);
  });

  it("cannot rename a store", async () => {
    const changed = await updateAs(clerk, "update public.inventory_locations set name = 'Renamed' where id = $1", [storeId]);
    expect(changed).toBe(0);
  });

  it("cannot rename a supplier", async () => {
    const changed = await updateAs(clerk, "update public.suppliers set name = 'Renamed' where id = $1", [supplierId]);
    expect(changed).toBe(0);
  });
});

describe("an owner of the organization", () => {
  it("can correct every inventory catalogue", async () => {
    expect(await updateAs(acme.userId, "update public.inventory_items set name = 'Drill bit 12mm' where id = $1", [itemId])).toBe(1);
    expect(await updateAs(acme.userId, "update public.inventory_locations set name = 'Main store A' where id = $1", [storeId])).toBe(1);
    expect(await updateAs(acme.userId, "update public.suppliers set contact_name = 'Asha' where id = $1", [supplierId])).toBe(1);
    expect(await updateAs(acme.userId, "update public.fuel_storage_locations set capacity_litres = 4000 where id = $1", [tankId])).toBe(1);
    expect(await updateAs(acme.userId, "update public.expense_categories set name = 'Consumables and PPE' where id = $1", [expenseCategoryId])).toBe(1);
  });
});

describe("another organization", () => {
  // The whole promise of the product. A catalogue id is a uuid, but guessing one must gain nothing.
  it("cannot touch Acme's catalogue even naming the exact row", async () => {
    expect(await updateAs(rival.userId, "update public.inventory_items set name = 'Stolen' where id = $1", [itemId])).toBe(0);
    expect(await updateAs(rival.userId, "update public.inventory_locations set name = 'Stolen' where id = $1", [storeId])).toBe(0);
    expect(await updateAs(rival.userId, "update public.suppliers set name = 'Stolen' where id = $1", [supplierId])).toBe(0);
    expect(await updateAs(rival.userId, "update public.fuel_storage_locations set name = 'Stolen' where id = $1", [tankId])).toBe(0);
    expect(await updateAs(rival.userId, "update public.expense_categories set name = 'Stolen' where id = $1", [expenseCategoryId])).toBe(0);

    const { rows } = await db.query<{ name: string }>("select name from public.inventory_items where id = $1", [itemId]);
    expect(rows[0].name).toBe("Drill bit 12mm");
  });

  it("cannot read the rows either", async () => {
    await actAs(db, rival.userId);
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.inventory_items where id = $1", [itemId])));
    expect(rows).toEqual([]);
  });
});
