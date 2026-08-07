import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  asAuthenticatedRole,
  createTestDatabase,
  createWorkspace,
  type TestDatabase,
  type Workspace,
} from "./harness";

let db: TestDatabase;
let acme: Workspace;
let rival: Workspace;
let acmeSecondSite: string;

/** Creates an item, a store and a balance, returning the ids. */
async function stock(
  workspace: Workspace,
  siteId: string,
  itemName: string,
  storeName: string,
  quantity: number,
  reorderLevel: number | null = null,
  sku: string | null = null,
) {
  await actAs(db, workspace.userId);
  const { rows: itemRows } = await db.query<{ id: string }>(
    `insert into public.inventory_items (organization_id, name, unit, reorder_level, sku, created_by)
     values ($1, $2, 'each', $3, $4, $5) returning id`,
    [workspace.organizationId, itemName, reorderLevel, sku, workspace.userId],
  );
  const { rows: storeRows } = await db.query<{ id: string }>(
    `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
     values ($1, $2, $3, $4) returning id`,
    [workspace.organizationId, siteId, storeName, workspace.userId],
  );
  await db.query(
    `insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity)
     values ($1, $2, $3, $4)`,
    [workspace.organizationId, itemRows[0].id, storeRows[0].id, quantity],
  );
  return { itemId: itemRows[0].id, locationId: storeRows[0].id };
}

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");

  await actAs(db, acme.userId);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.mine_sites (organization_id, name, created_by) values ($1, 'North Pit', $2) returning id`,
    [acme.organizationId, acme.userId],
  );
  acmeSecondSite = rows[0].id;

  await stock(acme, acme.siteId, "Drill bit", "Main store", 12, 20, "DB-1");
  await stock(acme, acme.siteId, "Hydraulic oil", "Oil shed", 300, 100);
  await stock(acme, acmeSecondSite, "Conveyor belt", "North store", 4);
  await stock(rival, rival.siteId, "Rival widget", "Rival store", 999);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("what the view shows its own organization", () => {
  it("joins each balance to its item and store", async () => {
    await actAs(db, acme.userId);
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query<{ item_name: string; location_name: string; quantity: string; item_sku: string | null }>(
        `select item_name, location_name, quantity, item_sku from public.inventory_stock_overview
         where organization_id = $1 and mine_site_id = $2 order by item_name`,
        [acme.organizationId, acme.siteId],
      )));

    expect(rows.map((row) => row.item_name)).toEqual(["Drill bit", "Hydraulic oil"]);
    expect(rows[0].location_name).toBe("Main store");
    expect(rows[0].item_sku).toBe("DB-1");
    expect(Number(rows[0].quantity)).toBe(12);
  });

  it("scopes to one site, so another site's stores do not appear", async () => {
    await actAs(db, acme.userId);
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query<{ item_name: string }>(
        "select item_name from public.inventory_stock_overview where mine_site_id = $1",
        [acmeSecondSite],
      )));
    expect(rows.map((row) => row.item_name)).toEqual(["Conveyor belt"]);
  });

  it("computes below_reorder in the database rather than in the page", async () => {
    await actAs(db, acme.userId);
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query<{ item_name: string; below_reorder: boolean }>(
        "select item_name, below_reorder from public.inventory_stock_overview where organization_id = $1 order by item_name",
        [acme.organizationId],
      )));
    const byName = Object.fromEntries(rows.map((row) => [row.item_name, row.below_reorder]));
    expect(byName["Drill bit"]).toBe(true);        // 12 on hand against a reorder level of 20
    expect(byName["Hydraulic oil"]).toBe(false);   // 300 against 100
    expect(byName["Conveyor belt"]).toBe(false);   // no reorder level set at all
  });

  it("hides an item once it is soft deleted", async () => {
    await actAs(db, acme.userId);
    // The catalogue guard in 0024 refuses to delete an item that still has stock against it, so
    // empty it first. The balance row stays and would still show as zero, which is what makes the
    // absence below evidence of the join filter rather than of the row disappearing.
    await db.query("update public.inventory_stock_balances set quantity = 0 where inventory_item_id = (select id from public.inventory_items where name = 'Hydraulic oil')");
    const { rows: present } = await asAuthenticatedRole(db, async () =>
      (await db.query("select item_name from public.inventory_stock_overview where organization_id = $1", [acme.organizationId])));
    expect(present.map((row) => (row as { item_name: string }).item_name)).toContain("Hydraulic oil");

    await db.query("update public.inventory_items set deleted_at = now() where name = 'Hydraulic oil'");
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query("select item_name from public.inventory_stock_overview where organization_id = $1", [acme.organizationId])));
    expect(rows.map((row) => (row as { item_name: string }).item_name)).not.toContain("Hydraulic oil");

    await db.query("update public.inventory_items set deleted_at = null where name = 'Hydraulic oil'");
    await db.query("update public.inventory_stock_balances set quantity = 300 where inventory_item_id = (select id from public.inventory_items where name = 'Hydraulic oil')");
  });
});

describe("the view is not a way around RLS", () => {
  // A view runs with its owner's privileges unless it declares security_invoker. Without that
  // declaration this view would read straight past every policy on the tables underneath it and
  // hand one mining company another's stock levels. This is the test that would catch its removal.
  it("declares security_invoker", async () => {
    const { rows } = await db.query<{ reloptions: string[] | null }>(
      "select reloptions from pg_class where relname = 'inventory_stock_overview'");
    expect(rows[0].reloptions ?? []).toContain("security_invoker=true");
  });

  it("shows one organization nothing belonging to another", async () => {
    await actAs(db, acme.userId);
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query("select item_name from public.inventory_stock_overview")));
    const names = rows.map((row) => (row as { item_name: string }).item_name);
    expect(names).not.toContain("Rival widget");
    expect(names.length).toBeGreaterThan(0); // proves the emptiness above is scoping, not a broken view
  });

  it("ignores an organization_id the caller is not a member of", async () => {
    // The obvious attack: ask for the other tenant by id. RLS answers, not the WHERE clause.
    await actAs(db, acme.userId);
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query("select item_name from public.inventory_stock_overview where organization_id = $1", [rival.organizationId])));
    expect(rows).toEqual([]);
  });

  it("shows an anonymous caller nothing", async () => {
    await db.query("select set_config('request.test_user', '', false)");
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query("select item_name from public.inventory_stock_overview")));
    expect(rows).toEqual([]);
  });

  it("is not readable by the anon role at all", async () => {
    const { rows } = await db.query<{ granted: boolean }>(
      "select has_table_privilege('anon', 'public.inventory_stock_overview', 'select') as granted");
    expect(rows[0].granted).toBe(false);
  });

  it("respects the inventory.read permission, not merely membership", async () => {
    // A member whose role carries no inventory permission is still a member of the organization.
    const stranger = await createWorkspace(db, "stranger@acme.test", "Stranger Co");
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role_id, status)
       select $1, $2, r.id, 'active' from public.roles r
       where r.organization_id = $1 and r.code = 'site_supervisor'`,
      [acme.organizationId, stranger.userId],
    );
    await db.query(
      `delete from public.role_permissions rp using public.roles r, public.permissions p
       where rp.role_id = r.id and rp.permission_id = p.id
         and r.organization_id = $1 and r.code = 'site_supervisor' and p.code like 'inventory.%'`,
      [acme.organizationId],
    );

    await actAs(db, stranger.userId);
    const { rows } = await asAuthenticatedRole(db, async () =>
      (await db.query("select item_name from public.inventory_stock_overview where organization_id = $1", [acme.organizationId])));
    expect(rows).toEqual([]);
  });
});
