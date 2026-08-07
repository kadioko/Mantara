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

/**
 * site_operational_summary() combines figures from equipment, production, fuel, maintenance,
 * inventory, compliance, and safety. Those modules each have their own read permission, so the
 * summary must not become a way around them.
 */
let db: TestDatabase;
let acme: Workspace;
let zeta: Workspace;
let maintenanceOfficerId: string;

async function addMember(organizationId: string, email: string, roleCode: string) {
  const userId = await createUser(db, email);
  await db.query(
    `insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at, created_by, updated_by)
     select $1, $2, r.id, 'active', now(), $2, $2 from public.roles r
     where r.organization_id = $1 and r.code = $3`,
    [organizationId, userId, roleCode],
  );
  return userId;
}

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  zeta = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");
  maintenanceOfficerId = await addMember(acme.organizationId, "maintenance@acme.test", "maintenance_officer");

  await actAs(db, acme.userId);
  // Equipment the officer may legitimately see.
  await db.query(
    `insert into public.equipment (organization_id, mine_site_id, name, status, created_by, updated_by)
     values ($1, $2, 'Excavator', 'operational', $3, $3), ($1, $2, 'Loader', 'breakdown', $3, $3)`,
    [acme.organizationId, acme.siteId, acme.userId],
  );
  // Production and fuel, which a maintenance officer holds no read permission for.
  const { rows } = await db.query<{ id: string }>(
    `insert into public.production_entries (organization_id, mine_site_id, material, quantity, entry_date, created_by, updated_by)
     values ($1, $2, 'Gold ore', 250, current_date, $3, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId],
  );
  await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [rows[0].id, acme.userId]);
  await db.query("select public.review_production_entry($1, 'approved')", [rows[0].id]);

  const { rows: store } = await db.query<{ id: string }>(
    `insert into public.fuel_storage_locations (organization_id, mine_site_id, name, created_by, updated_by)
     values ($1, $2, 'Main tank', $3, $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId],
  );
  await db.query("select public.record_fuel_receipt($1, $2)", [store[0].id, 4000]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("who may call it", () => {
  it("returns figures to an owner", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ operational_equipment: string; fuel_on_hand_litres: string }>(
      "select * from public.site_operational_summary($1)", [acme.siteId]);
    expect(Number(rows[0].operational_equipment)).toBe(1);
    expect(Number(rows[0].fuel_on_hand_litres)).toBe(4000);
  });

  it("refuses a site belonging to another organization", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select * from public.site_operational_summary($1)", [zeta.siteId]));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses an unknown site", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select * from public.site_operational_summary($1)", ["11111111-1111-4111-8111-111111111111"]));
    expect(message).toMatch(/not found/i);
  });
});

describe("it respects each module's own read permission", () => {
  it("confirms a maintenance officer holds site.read but not production or fuel", async () => {
    await actAs(db, maintenanceOfficerId);
    const { rows } = await db.query<{ site: boolean; production: boolean; fuel: boolean; equipment: boolean }>(
      `select public.has_permission($1,'site.read') as site,
              public.has_permission($1,'production.read') as production,
              public.has_permission($1,'fuel.read') as fuel,
              public.has_permission($1,'equipment.read') as equipment`,
      [acme.organizationId],
    );
    expect(rows[0]).toMatchObject({ site: true, production: false, fuel: false, equipment: true });
  });

  it("still shows equipment figures, which they may read", async () => {
    await actAs(db, maintenanceOfficerId);
    const { rows } = await db.query<{ operational_equipment: string; equipment_needing_attention: string }>(
      "select * from public.site_operational_summary($1)", [acme.siteId]);
    expect(Number(rows[0].operational_equipment)).toBe(1);
    expect(Number(rows[0].equipment_needing_attention)).toBe(1);
  });

  // A single site.read check must not hand over figures drawn from modules the caller is shut out of.
  it("does not disclose production or fuel to someone without those permissions", async () => {
    await actAs(db, maintenanceOfficerId);
    const { rows } = await db.query<{ approved_production_today: string; fuel_on_hand_litres: string }>(
      "select * from public.site_operational_summary($1)", [acme.siteId]);
    expect(Number(rows[0].approved_production_today), "production must be withheld").toBe(0);
    expect(Number(rows[0].fuel_on_hand_litres), "fuel must be withheld").toBe(0);
  });
});
