import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  createTestDatabase,
  createUser,
  createWorkspace,
  type TestDatabase,
  type Workspace,
} from "./harness";

/**
 * my_permissions() exists so a page can ask once instead of calling has_permission() per module.
 * That only holds if the two agree exactly, so these compare them across every permission code and
 * every system role, rather than spot-checking a few.
 */
let db: TestDatabase;
let acme: Workspace;
let outsiderId: string;

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

/** Every permission code, checked both ways, for whoever is currently acting. */
async function disagreements(organizationId: string) {
  const { rows } = await db.query<{ code: string; via_function: boolean; via_set: boolean }>(
    `select p.code,
            public.has_permission($1, p.code) as via_function,
            (p.code in (select public.my_permissions($1))) as via_set
     from public.permissions p
     order by p.code`,
    [organizationId],
  );
  return rows.filter((row) => row.via_function !== row.via_set);
}

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  outsiderId = await createUser(db, "outsider@nowhere.test");
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("my_permissions agrees with has_permission", () => {
  const roles = ["mine_manager", "site_supervisor", "accountant", "storekeeper", "maintenance_officer", "safety_officer", "viewer"];

  it("for an owner, who holds everything", async () => {
    await actAs(db, acme.userId);
    expect(await disagreements(acme.organizationId)).toEqual([]);
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from public.my_permissions($1)", [acme.organizationId]);
    const { rows: all } = await db.query<{ count: string }>("select count(*) as count from public.permissions");
    expect(rows[0].count).toBe(all[0].count);
  });

  for (const role of roles) {
    it(`for a ${role.replace("_", " ")}`, async () => {
      const userId = await addMember(acme.organizationId, `${role}@acme.test`, role);
      await actAs(db, userId);
      expect(await disagreements(acme.organizationId)).toEqual([]);
    });
  }

  it("for someone with no membership at all", async () => {
    await actAs(db, outsiderId);
    expect(await disagreements(acme.organizationId)).toEqual([]);
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from public.my_permissions($1)", [acme.organizationId]);
    expect(Number(rows[0].count)).toBe(0);
  });
});

describe("suspension is applied the same way by both", () => {
  it("leaves an owner read-only, and the two still agree", async () => {
    const adminId = await createUser(db, "admin@mantara.test");
    await db.query("insert into public.platform_admins (user_id, note) values ($1, 'Founding')", [adminId]);
    await actAs(db, adminId);
    await db.query("select public.platform_set_organization_suspended($1, true, 'Testing')", [acme.organizationId]);

    await actAs(db, acme.userId);
    expect(await disagreements(acme.organizationId)).toEqual([]);

    const { rows } = await db.query<{ code: string }>(
      "select public.my_permissions($1) as code", [acme.organizationId]);
    const codes = rows.map((row) => row.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((code) => code.endsWith(".read")), "only read permissions survive suspension").toBe(true);

    await actAs(db, adminId);
    await db.query("select public.platform_set_organization_suspended($1, false)", [acme.organizationId]);
  });

  it("restores write access once lifted, still in agreement", async () => {
    await actAs(db, acme.userId);
    expect(await disagreements(acme.organizationId)).toEqual([]);
    const { rows } = await db.query<{ has_permission: boolean }>(
      "select public.has_permission($1, 'worker.create')", [acme.organizationId]);
    expect(rows[0].has_permission).toBe(true);
  });
});

describe("it does not leak across organizations", () => {
  it("returns nothing for an organization the caller does not belong to", async () => {
    const zeta = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from public.my_permissions($1)", [zeta.organizationId]);
    expect(Number(rows[0].count)).toBe(0);
  });
});
