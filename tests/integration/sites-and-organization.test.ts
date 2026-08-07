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
 * Every operational record belongs to a mine site, and the workspace picks the active site from those
 * still in service. An organization left with none would have nowhere to write, and no way back
 * through the interface, so the database refuses to get into that state.
 */
let db: TestDatabase;
let acme: Workspace;
let zeta: Workspace;
let supervisorId: string;

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

async function addSite(workspace: Workspace, name: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.mine_sites (organization_id, name, created_by, updated_by)
     values ($1, $2, $3, $3) returning id`,
    [workspace.organizationId, name, workspace.userId],
  );
  return rows[0].id;
}

const activeSiteCount = async (organizationId: string) => {
  const { rows } = await db.query<{ count: string }>(
    "select count(*) as count from public.mine_sites where organization_id = $1 and status = 'active' and deleted_at is null",
    [organizationId],
  );
  return Number(rows[0].count);
};

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  zeta = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");
  supervisorId = await addMember(acme.organizationId, "supervisor@acme.test", "site_supervisor");
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("adding mine sites", () => {
  it("lets an organization add a second site, which onboarding never could", async () => {
    await actAs(db, acme.userId);
    await addSite(acme, "Geita North Pit");
    expect(await activeSiteCount(acme.organizationId)).toBe(2);
  });

  it("rejects a duplicate site name within one organization", async () => {
    await actAs(db, acme.userId);
    await expectRejection(() => addSite(acme, "Geita North Pit"));
  });

  it("allows the same site name in a different organization", async () => {
    await actAs(db, zeta.userId);
    await addSite(zeta, "Geita North Pit");
    expect(await activeSiteCount(zeta.organizationId)).toBe(2);
  });

  it("refuses a site with only one coordinate", async () => {
    await actAs(db, acme.userId);
    await expectRejection(() => db.query(
      `insert into public.mine_sites (organization_id, name, latitude, created_by, updated_by)
       values ($1, 'Half located', -3.5, $2, $2)`,
      [acme.organizationId, acme.userId],
    ));
  });
});

describe("the last active site is protected", () => {
  it("allows retiring a site while another remains active", async () => {
    await actAs(db, acme.userId);
    const siteId = await addSite(acme, "Temporary Pit");
    const before = await activeSiteCount(acme.organizationId);
    await db.query("update public.mine_sites set status = 'closed', updated_by = $2 where id = $1", [siteId, acme.userId]);
    expect(await activeSiteCount(acme.organizationId)).toBe(before - 1);
  });

  it("refuses to retire the last active site", async () => {
    await actAs(db, zeta.userId);
    // Reduce Zeta to a single active site.
    await db.query(
      "update public.mine_sites set status = 'closed', updated_by = $2 where organization_id = $1 and name = 'Geita North Pit'",
      [zeta.organizationId, zeta.userId],
    );
    expect(await activeSiteCount(zeta.organizationId)).toBe(1);

    const { rows } = await db.query<{ id: string }>(
      "select id from public.mine_sites where organization_id = $1 and status = 'active'", [zeta.organizationId]);
    const message = await expectRejection(() =>
      db.query("update public.mine_sites set status = 'closed', updated_by = $2 where id = $1", [rows[0].id, zeta.userId]));
    expect(message).toMatch(/at least one active mine site/i);
    expect(await activeSiteCount(zeta.organizationId)).toBe(1);
  });

  it("refuses to soft delete the last active site too", async () => {
    await actAs(db, zeta.userId);
    const { rows } = await db.query<{ id: string }>(
      "select id from public.mine_sites where organization_id = $1 and status = 'active'", [zeta.organizationId]);
    const message = await expectRejection(() => db.query(
      "update public.mine_sites set deleted_at = now(), updated_by = $2 where id = $1", [rows[0].id, zeta.userId]));
    expect(message).toMatch(/at least one active mine site/i);
  });

  it("still allows editing the last active site's details", async () => {
    await actAs(db, zeta.userId);
    const { rows } = await db.query<{ id: string }>(
      "select id from public.mine_sites where organization_id = $1 and status = 'active'", [zeta.organizationId]);
    await db.query("update public.mine_sites set region = 'Geita', updated_by = $2 where id = $1", [rows[0].id, zeta.userId]);
    const { rows: updated } = await db.query<{ region: string }>("select region from public.mine_sites where id = $1", [rows[0].id]);
    expect(updated[0].region).toBe("Geita");
  });

  it("lets a closed site be brought back into service", async () => {
    await actAs(db, zeta.userId);
    const { rows } = await db.query<{ id: string }>(
      "select id from public.mine_sites where organization_id = $1 and status = 'closed' limit 1", [zeta.organizationId]);
    await db.query("update public.mine_sites set status = 'active', updated_by = $2 where id = $1", [rows[0].id, zeta.userId]);
    expect(await activeSiteCount(zeta.organizationId)).toBe(2);
  });
});

describe("sites stay inside their organization", () => {
  it("does not show another organization's sites", async () => {
    await actAs(db, acme.userId);
    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query<{ organization_id: string }>("select organization_id from public.mine_sites")).rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organization_id === acme.organizationId)).toBe(true);
  });

  it("refuses to add a site to another organization", async () => {
    await actAs(db, acme.userId);
    await asAuthenticatedRole(db, async () => {
      const message = await expectRejection(() => db.query(
        `insert into public.mine_sites (organization_id, name, created_by, updated_by)
         values ($1, 'Intruder Pit', $2, $2)`,
        [zeta.organizationId, acme.userId],
      ));
      expect(message).toMatch(/row-level security/i);
    });
  });

  it("denies site creation to a role without site.create", async () => {
    await actAs(db, supervisorId);
    const { rows } = await db.query<{ create: boolean; read: boolean }>(
      `select public.has_permission($1,'site.create') as create, public.has_permission($1,'site.read') as read`,
      [acme.organizationId],
    );
    expect(rows[0]).toMatchObject({ create: false, read: true });
  });
});

describe("organization details", () => {
  it("can be edited by someone holding organization.update", async () => {
    await actAs(db, acme.userId);
    await asAuthenticatedRole(db, async () => {
      await db.query("update public.organizations set name = 'Acme Mining Ltd', updated_by = $2 where id = $1", [acme.organizationId, acme.userId]);
    });
    const { rows } = await db.query<{ name: string }>("select name from public.organizations where id = $1", [acme.organizationId]);
    expect(rows[0].name).toBe("Acme Mining Ltd");
  });

  it("cannot be edited by someone without it", async () => {
    await actAs(db, supervisorId);
    await asAuthenticatedRole(db, async () => {
      await db.query("update public.organizations set name = 'Hijacked', updated_by = $2 where id = $1", [acme.organizationId, supervisorId]);
    });
    const { rows } = await db.query<{ name: string }>("select name from public.organizations where id = $1", [acme.organizationId]);
    expect(rows[0].name).toBe("Acme Mining Ltd");
  });

  it("cannot be edited across organizations", async () => {
    await actAs(db, acme.userId);
    await asAuthenticatedRole(db, async () => {
      await db.query("update public.organizations set name = 'Taken over', updated_by = $2 where id = $1", [zeta.organizationId, acme.userId]);
    });
    const { rows } = await db.query<{ name: string }>("select name from public.organizations where id = $1", [zeta.organizationId]);
    expect(rows[0].name).toBe("Zeta Mining");
  });
});
