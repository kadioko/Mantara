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

/**
 * The blueprint says platform administration grants "not implicit access to tenant records", and that
 * is the property these tests defend. Holding platform admin must never become a way to read a
 * customer's operational data.
 */
let db: TestDatabase;
let acme: Workspace;
let zeta: Workspace;
let adminId: string;
let outsiderId: string;

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  zeta = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");

  // Seed operational data the platform admin must never be able to read.
  for (const workspace of [acme, zeta]) {
    await actAs(db, workspace.userId);
    await db.query(
      `insert into public.workers (organization_id, mine_site_id, full_name, created_by, updated_by)
       values ($1, $2, 'Confidential Worker', $3, $3)`,
      [workspace.organizationId, workspace.siteId, workspace.userId],
    );
    await db.query(
      `insert into public.production_entries (organization_id, mine_site_id, material, quantity, created_by, updated_by)
       values ($1, $2, 'Gold ore', 500, $3, $3)`,
      [workspace.organizationId, workspace.siteId, workspace.userId],
    );
    await db.query(
      `insert into public.expenses (organization_id, mine_site_id, description, amount, created_by, updated_by)
       values ($1, $2, 'Commercially sensitive', 90000, $3, $3)`,
      [workspace.organizationId, workspace.siteId, workspace.userId],
    );
  }

  // The founding administrator is bootstrapped directly, as documented in the migration.
  adminId = await createUser(db, "admin@mantara.test");
  await db.query("insert into public.platform_admins (user_id, note) values ($1, 'Founding administrator')", [adminId]);
  outsiderId = await createUser(db, "outsider@nowhere.test");
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("who counts as a platform admin", () => {
  it("recognises a bootstrapped administrator", async () => {
    await actAs(db, adminId);
    const { rows } = await db.query<{ is_platform_admin: boolean }>("select public.is_platform_admin()");
    expect(rows[0].is_platform_admin).toBe(true);
  });

  it("does not treat an organization owner as a platform admin", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ is_platform_admin: boolean }>("select public.is_platform_admin()");
    expect(rows[0].is_platform_admin).toBe(false);
  });

  it("does not treat an unrelated user as a platform admin", async () => {
    await actAs(db, outsiderId);
    const { rows } = await db.query<{ is_platform_admin: boolean }>("select public.is_platform_admin()");
    expect(rows[0].is_platform_admin).toBe(false);
  });
});

describe("a platform admin cannot reach tenant records", () => {
  // This is the core guarantee. Platform admin holds no organization membership, so has_permission()
  // is false for every organization, and every operational policy denies them.
  const tenantTables = [
    "workers",
    "attendance_records",
    "equipment",
    "production_entries",
    "fuel_storage_locations",
    "inventory_items",
    "maintenance_work_orders",
    "expenses",
  ];

  for (const table of tenantTables) {
    it(`reads no rows from ${table}`, async () => {
      await actAs(db, adminId);
      const rows = await asAuthenticatedRole(db, async () => (await db.query(`select id from public.${table}`)).rows);
      expect(rows).toHaveLength(0);
    });
  }

  it("reads nothing from organizations directly, despite administering them", async () => {
    await actAs(db, adminId);
    const rows = await asAuthenticatedRole(db, async () => (await db.query("select id from public.organizations")).rows);
    expect(rows).toHaveLength(0);
  });

  it("holds no permission in any organization", async () => {
    await actAs(db, adminId);
    for (const code of ["worker.read", "production.approve", "expense.read", "fuel.issue"]) {
      const { rows } = await db.query<{ has_permission: boolean }>(
        "select public.has_permission($1, $2)", [acme.organizationId, code],
      );
      expect(rows[0].has_permission, `${code} must be denied`).toBe(false);
    }
  });

  it("cannot write into a tenant's records", async () => {
    await actAs(db, adminId);
    await asAuthenticatedRole(db, async () => {
      const message = await expectRejection(() => db.query(
        `insert into public.workers (organization_id, mine_site_id, full_name, created_by, updated_by)
         values ($1, $2, 'Inserted by platform admin', $3, $3)`,
        [acme.organizationId, acme.siteId, adminId],
      ));
      expect(message).toMatch(/row-level security/i);
    });
  });
});

describe("platform metadata", () => {
  it("lists organizations with counts but no tenant rows", async () => {
    await actAs(db, adminId);
    const { rows } = await db.query<{ name: string; member_count: string; site_count: string }>(
      "select name, member_count, site_count from public.platform_organizations()",
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name).sort()).toEqual(["Acme Mining", "Zeta Mining"]);
    expect(Number(rows[0].member_count)).toBe(1);
    expect(Number(rows[0].site_count)).toBe(1);
  });

  it("returns nothing to a non-admin", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query("select * from public.platform_organizations()");
    expect(rows).toHaveLength(0);
  });

  it("returns no stats to a non-admin", async () => {
    await actAs(db, outsiderId);
    const { rows } = await db.query("select * from public.platform_stats()");
    expect(rows).toHaveLength(0);
  });
});

describe("organization suspension", () => {
  it("refuses to suspend when the caller is not a platform admin", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.platform_set_organization_suspended($1, true, 'Trying it on')", [zeta.organizationId]));
    expect(message).toMatch(/permission denied/i);
  });

  it("makes a suspended organization read-only for its own members", async () => {
    await actAs(db, adminId);
    await db.query("select public.platform_set_organization_suspended($1, true, 'Non-payment')", [acme.organizationId]);

    await actAs(db, acme.userId);
    const { rows: readRow } = await db.query<{ has_permission: boolean }>(
      "select public.has_permission($1, 'worker.read')", [acme.organizationId]);
    const { rows: writeRow } = await db.query<{ has_permission: boolean }>(
      "select public.has_permission($1, 'worker.create')", [acme.organizationId]);

    expect(readRow[0].has_permission, "reads stay available").toBe(true);
    expect(writeRow[0].has_permission, "writes are blocked").toBe(false);
  });

  it("blocks an actual write while suspended", async () => {
    await actAs(db, acme.userId);
    await asAuthenticatedRole(db, async () => {
      const message = await expectRejection(() => db.query(
        `insert into public.workers (organization_id, mine_site_id, full_name, created_by, updated_by)
         values ($1, $2, 'During suspension', $3, $3)`,
        [acme.organizationId, acme.siteId, acme.userId],
      ));
      expect(message).toMatch(/row-level security/i);
    });
  });

  it("leaves other organizations unaffected", async () => {
    await actAs(db, zeta.userId);
    const { rows } = await db.query<{ has_permission: boolean }>(
      "select public.has_permission($1, 'worker.create')", [zeta.organizationId]);
    expect(rows[0].has_permission).toBe(true);
  });

  it("restores writing when the suspension is lifted", async () => {
    await actAs(db, adminId);
    await db.query("select public.platform_set_organization_suspended($1, false)", [acme.organizationId]);
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ has_permission: boolean }>(
      "select public.has_permission($1, 'worker.create')", [acme.organizationId]);
    expect(rows[0].has_permission).toBe(true);
  });
});

describe("administrator management", () => {
  it("grants by email and records it", async () => {
    await actAs(db, adminId);
    await db.query("select public.platform_grant_admin($1, $2)", ["outsider@nowhere.test", "Second admin"]);
    await actAs(db, outsiderId);
    const { rows } = await db.query<{ is_platform_admin: boolean }>("select public.is_platform_admin()");
    expect(rows[0].is_platform_admin).toBe(true);
  });

  it("rejects an unknown email", async () => {
    await actAs(db, adminId);
    const message = await expectRejection(() => db.query("select public.platform_grant_admin($1)", ["ghost@nowhere.test"]));
    expect(message).toMatch(/no user exists with that email/i);
  });

  it("refuses to grant when the caller is not an admin", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() => db.query("select public.platform_grant_admin($1)", ["owner@zeta.test"]));
    expect(message).toMatch(/permission denied/i);
  });

  it("revokes an administrator", async () => {
    await actAs(db, adminId);
    await db.query("select public.platform_revoke_admin($1)", [outsiderId]);
    await actAs(db, outsiderId);
    const { rows } = await db.query<{ is_platform_admin: boolean }>("select public.is_platform_admin()");
    expect(rows[0].is_platform_admin).toBe(false);
  });

  // Revoking everyone would leave no way back in without direct database access.
  it("refuses to revoke the last remaining administrator", async () => {
    await actAs(db, adminId);
    const message = await expectRejection(() => db.query("select public.platform_revoke_admin($1)", [adminId]));
    expect(message).toMatch(/at least one platform administrator must remain/i);
  });
});

describe("platform audit log", () => {
  it("records suspensions, restorations, grants, and revocations", async () => {
    await actAs(db, adminId);
    const { rows } = await db.query<{ action: string }>("select action from public.platform_audit_logs order by created_at");
    const actions = rows.map((row) => row.action);
    expect(actions).toContain("organization.suspended");
    expect(actions).toContain("organization.restored");
    expect(actions).toContain("platform_admin.granted");
    expect(actions).toContain("platform_admin.revoked");
  });

  it("is not readable by a tenant user", async () => {
    await actAs(db, acme.userId);
    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.platform_audit_logs")).rows);
    expect(rows).toHaveLength(0);
  });

  it("cannot be written directly, even by a platform admin", async () => {
    await actAs(db, adminId);
    await asAuthenticatedRole(db, async () => {
      const message = await expectRejection(() => db.query(
        "insert into public.platform_audit_logs (actor_user_id, action, target_type) values ($1, 'forged', 'organization')",
        [adminId],
      ));
      expect(message).toMatch(/row-level security/i);
    });
  });

  it("cannot have platform_admins written directly", async () => {
    await actAs(db, adminId);
    await asAuthenticatedRole(db, async () => {
      const message = await expectRejection(() => db.query(
        "insert into public.platform_admins (user_id) values ($1)", [outsiderId],
      ));
      expect(message).toMatch(/row-level security/i);
    });
  });
});
