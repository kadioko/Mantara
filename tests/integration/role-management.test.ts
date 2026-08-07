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
 * Editing what a role may do is the one change that can remove the ability to make further changes,
 * so the guards around it matter more than the feature itself.
 */
let db: TestDatabase;
let acme: Workspace;
let zeta: Workspace;
let managerId: string;

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

const permissionsOf = async (organizationId: string, roleCode: string) => {
  const { rows } = await db.query<{ code: string }>(
    `select p.code from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id
     where r.organization_id = $1 and r.code = $2 order by p.code`,
    [organizationId, roleCode],
  );
  return rows.map((row) => row.code);
};

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  zeta = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");
  managerId = await addMember(acme.organizationId, "manager@acme.test", "mine_manager");
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("changing what a role may do", () => {
  it("replaces the grant with exactly what was submitted", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_role_permissions($1, 'viewer', $2)",
      [acme.organizationId, ["worker.read", "equipment.read"]]);
    expect(await permissionsOf(acme.organizationId, "viewer")).toEqual(["equipment.read", "worker.read"]);
  });

  it("removes anything left out of the submission", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_role_permissions($1, 'viewer', $2)", [acme.organizationId, ["worker.read"]]);
    expect(await permissionsOf(acme.organizationId, "viewer")).toEqual(["worker.read"]);
  });

  it("accepts an empty grant, leaving the role able to sign in and see nothing", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_role_permissions($1, 'viewer', $2)", [acme.organizationId, []]);
    expect(await permissionsOf(acme.organizationId, "viewer")).toEqual([]);
  });

  it("takes effect immediately for a member holding that role", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_role_permissions($1, 'mine_manager', $2)", [acme.organizationId, ["worker.read"]]);
    await actAs(db, managerId);
    const { rows } = await db.query<{ worker: boolean; equipment: boolean }>(
      `select public.has_permission($1,'worker.read') as worker,
              public.has_permission($1,'equipment.read') as equipment`,
      [acme.organizationId],
    );
    expect(rows[0]).toMatchObject({ worker: true, equipment: false });
  });

  it("stays in step with my_permissions", async () => {
    await actAs(db, managerId);
    const { rows } = await db.query<{ code: string }>("select public.my_permissions($1) as code", [acme.organizationId]);
    expect(rows.map((row) => row.code)).toEqual(["worker.read"]);
  });
});

describe("guards", () => {
  // The owner is the way back in; narrowing it could strand an organization with no administrator.
  it("refuses to narrow the owner role", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.set_role_permissions($1, 'company_owner', $2)", [acme.organizationId, ["worker.read"]]));
    expect(message).toMatch(/owner role always holds every permission/i);
  });

  it("refuses a caller without role.manage", async () => {
    await actAs(db, managerId);
    const message = await expectRejection(() =>
      db.query("select public.set_role_permissions($1, 'viewer', $2)", [acme.organizationId, ["worker.read"]]));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses a role in another organization", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.set_role_permissions($1, 'viewer', $2)", [zeta.organizationId, ["worker.read"]]));
    expect(message).toMatch(/permission denied/i);
  });

  it("leaves the other organization's roles untouched", async () => {
    expect(await permissionsOf(zeta.organizationId, "mine_manager")).toContain("equipment.read");
  });

  it("rejects an unknown role", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.set_role_permissions($1, 'chief_wizard', $2)", [acme.organizationId, []]));
    expect(message).toMatch(/does not exist/i);
  });

  it("records the change in the audit log", async () => {
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from public.audit_logs where organization_id = $1 and action = 'role.permissions_changed'",
      [acme.organizationId],
    );
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });
});

describe("listing roles", () => {
  it("reports each role with its permissions and member count", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ role_code: string; member_count: string; permission_codes: string[] }>(
      "select role_code, member_count, permission_codes from public.organization_roles($1)", [acme.organizationId]);
    const owner = rows.find((row) => row.role_code === "company_owner");
    expect(rows.length).toBe(8);
    expect(Number(owner?.member_count)).toBe(1);
  });

  it("returns nothing to someone without role.read", async () => {
    await actAs(db, managerId);
    const { rows } = await db.query("select * from public.organization_roles($1)", [acme.organizationId]);
    expect(rows).toHaveLength(0);
  });
});
