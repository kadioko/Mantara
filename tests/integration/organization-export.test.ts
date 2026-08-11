import { beforeAll, afterAll, describe, expect, it } from "vitest";
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
import { exportedTables } from "@/features/exports/catalogue";

/**
 * The export hands a client sixty tables in one request. Every guarantee the rest of the product
 * makes about who can see what has to survive that, and the interesting failures are the quiet
 * ones: another organization's rows appearing, a restricted member receiving sites they cannot
 * otherwise reach, or the audit entry not being written so nobody ever knows a copy was taken.
 *
 * These run the real policies against the real migrations. What they cannot cover is the route
 * itself — see tests/unit/export-manifest.test.ts for that half.
 */

let db: TestDatabase;
let acme: Workspace;
let rival: Workspace;
let pitTwo: string;
let supervisor: string;

const auditEntries = async (organizationId: string) =>
  (await db.query<{ action: string; user_id: string; new_values: Record<string, unknown> }>(
    `select action, user_id, new_values from public.audit_logs
     where organization_id = $1 and action = 'organization.exported' order by created_at desc`,
    [organizationId])).rows;

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");

  await actAs(db, acme.userId);
  pitTwo = (await db.query<{ id: string }>(
    `insert into public.mine_sites (organization_id, name, created_by)
     values ($1, 'Pit Two', $2) returning id`,
    [acme.organizationId, acme.userId])).rows[0].id;

  // A worker at each site, so a site-restricted read has something to include and something to miss.
  for (const [site, name] of [[acme.siteId, "Asha One"], [pitTwo, "Baraka Two"]] as const) {
    await db.query(
      `insert into public.workers (organization_id, mine_site_id, full_name, created_by)
       values ($1, $2, $3, $4)`,
      [acme.organizationId, site, name, acme.userId]);
  }

  await actAs(db, rival.userId);
  await db.query(
    `insert into public.workers (organization_id, mine_site_id, full_name, created_by)
     values ($1, $2, 'Rival Worker', $3)`,
    [rival.organizationId, rival.siteId, rival.userId]);

  supervisor = await createUser(db, "supervisor@acme.test");
  await actAs(db, acme.userId);
  await db.query(
    `insert into public.organization_memberships (organization_id, user_id, role_id, status)
     select $1, $2, r.id, 'active' from public.roles r
     where r.organization_id = $1 and r.code = 'site_supervisor'`,
    [acme.organizationId, supervisor]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("what an export can reach", () => {
  it("returns none of another organization's records", async () => {
    // The whole promise of the product in one assertion. Read through the authenticated role so the
    // policies are actually enforced rather than bypassed by the owner of the tables.
    await actAs(db, acme.userId);
    const { rows } = await asAuthenticatedRole(db, () => db.query<{ full_name: string }>(
      "select full_name from public.workers"));
    expect(rows.map((row) => row.full_name).sort()).toEqual(["Asha One", "Baraka Two"]);
  });

  it("gives a site-restricted member only their own site", async () => {
    // The export does no site filtering of its own — 0028's restrictive policies do it against this
    // caller's session. This proves the export inherits that rather than needing to repeat it,
    // which is the reason there is no site logic in features/exports/run.ts to get wrong.
    await actAs(db, acme.userId);
    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, supervisor, [pitTwo]]);

    await actAs(db, supervisor);
    const { rows } = await asAuthenticatedRole(db, () => db.query<{ full_name: string }>(
      "select full_name from public.workers"));
    expect(rows.map((row) => row.full_name)).toEqual(["Baraka Two"]);
  });

  it("every table the catalogue names is one the database has", async () => {
    // A name that does not exist would export zero rows and report a count of zero, which reads as
    // "you have no equipment" rather than "this line is wrong".
    const { rows } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'");
    const real = new Set(rows.map((row) => row.table_name));
    for (const entry of exportedTables) {
      expect(real.has(entry.table), `${entry.table} is in the export catalogue but not in the database`).toBe(true);
    }
  });

  it("every table the catalogue names can actually be ordered by the column it names", async () => {
    // orderBy is passed straight to PostgREST. A column that does not exist fails the whole table at
    // runtime, and the manifest would report it as a fault with no clue which column was wrong.
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'");
    const columns = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const entry of exportedTables) {
      expect(columns.has(`${entry.table}.${entry.orderBy}`), `${entry.table} has no ${entry.orderBy}`).toBe(true);
      expect(columns.has(`${entry.table}.id`), `${entry.table} has no id to break ties on`).toBe(true);
    }
  });
});

describe("recording that a copy was taken", () => {
  it("writes an audit entry naming who took it and how much", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.record_organization_export($1, 62, 1500, true)", [acme.organizationId]);

    const [entry] = await auditEntries(acme.organizationId);
    expect(entry.user_id).toBe(acme.userId);
    expect(Number(entry.new_values.table_count)).toBe(62);
    expect(Number(entry.new_values.row_count)).toBe(1500);
    expect(entry.new_values.complete).toBe(true);
  });

  it("records that an export was incomplete, so a short file is not mistaken for the whole", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.record_organization_export($1, 62, 25000, false)", [acme.organizationId]);
    expect(await auditEntries(acme.organizationId)).toHaveLength(2);
    expect((await auditEntries(acme.organizationId))[0].new_values.complete).toBe(false);
  });

  it("keeps no copy of what was exported, only how much", async () => {
    // A log line is readable by more people than the database is. An audit entry that reproduced the
    // export would be a second copy of the thing it exists to guard.
    const [entry] = await auditEntries(acme.organizationId);
    expect(Object.keys(entry.new_values).sort()).toEqual(["complete", "row_count", "table_count"]);
  });

  it("refuses to write a line into an organization the caller does not belong to", async () => {
    // The function is SECURITY DEFINER, so without its own membership check any authenticated user
    // could forge an entry in any company's audit log — including one that hides a real export
    // among noise, or one that accuses somebody.
    await actAs(db, acme.userId);
    const message = await asAuthenticatedRole(db, () => expectRejection(() => db.query(
      "select public.record_organization_export($1, 1, 1, true)", [rival.organizationId])));
    expect(message).toMatch(/not a member/i);
    expect(await auditEntries(rival.organizationId)).toHaveLength(0);
  });

  it("refuses a member who cannot read the organization", async () => {
    // A supervisor is a member, so the membership check passes and the permission check is what
    // has to stop them. Removing organization.read from the role must remove the export with it.
    await actAs(db, acme.userId);
    await db.query(
      `delete from public.role_permissions rp using public.roles r, public.permissions p
       where rp.role_id = r.id and rp.permission_id = p.id
         and r.organization_id = $1 and r.code = 'site_supervisor' and p.code = 'organization.read'`,
      [acme.organizationId]);

    await actAs(db, supervisor);
    const message = await asAuthenticatedRole(db, () => expectRejection(() => db.query(
      "select public.record_organization_export($1, 1, 1, true)", [acme.organizationId])));
    expect(message).toMatch(/not permitted/i);
  });

  it("is not callable by an anonymous caller", async () => {
    const message = await expectRejection(async () => {
      await db.exec("set role anon");
      try {
        await db.query("select public.record_organization_export($1, 1, 1, true)", [acme.organizationId]);
      } finally {
        await db.exec("reset role");
      }
    });
    expect(message).toMatch(/permission denied/i);
  });
});
