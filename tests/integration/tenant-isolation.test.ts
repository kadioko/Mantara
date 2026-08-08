import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  asAuthenticatedRole,
  createTestDatabase,
  createWorkspace,
  expectRejection,
  type TestDatabase,
  type Workspace,
} from "./harness";

/**
 * Tenant isolation is the project's non-negotiable rule, and it must hold in the database rather than
 * in the application. These run as Supabase's `authenticated` role so RLS is actually enforced.
 */
let db: TestDatabase;
let acme: Workspace;
let zeta: Workspace;

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  zeta = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");

  // Seed one row of operational data into each organization, as its own owner.
  for (const workspace of [acme, zeta]) {
    await actAs(db, workspace.userId);
    await db.query(
      `insert into public.workers (organization_id, mine_site_id, full_name, created_by, updated_by)
       values ($1, $2, $3, $4, $4)`,
      [workspace.organizationId, workspace.siteId, `Worker of ${workspace.organizationId.slice(0, 8)}`, workspace.userId],
    );
    await db.query(
      `insert into public.equipment (organization_id, mine_site_id, name, created_by, updated_by)
       values ($1, $2, 'Excavator', $3, $3)`,
      [workspace.organizationId, workspace.siteId, workspace.userId],
    );
    await db.query(
      `insert into public.production_entries (organization_id, mine_site_id, material, quantity, created_by, updated_by)
       values ($1, $2, 'Ore', 10, $3, $3)`,
      [workspace.organizationId, workspace.siteId, workspace.userId],
    );
    await db.query(
      `insert into public.fuel_storage_locations (organization_id, mine_site_id, name, created_by, updated_by)
       values ($1, $2, 'Tank', $3, $3)`,
      [workspace.organizationId, workspace.siteId, workspace.userId],
    );
  }
}, 120_000);

afterAll(async () => { await db?.close(); });

const tenantScopedTables = ["workers", "equipment", "production_entries", "fuel_storage_locations", "mine_sites"];

describe("cross-tenant reads", () => {
  for (const table of tenantScopedTables) {
    it(`only returns the caller's own rows from ${table}`, async () => {
      await actAs(db, acme.userId);
      const rows = await asAuthenticatedRole(db, async () => {
        const result = await db.query<{ organization_id: string }>(`select organization_id from public.${table}`);
        return result.rows;
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.organization_id === acme.organizationId)).toBe(true);
    });
  }

  it("returns nothing for a user with no membership at all", async () => {
    const { rows: userRows } = await db.query<{ id: string }>("insert into auth.users (email) values ('nobody@test') returning id");
    await actAs(db, userRows[0].id);
    const rows = await asAuthenticatedRole(db, async () => (await db.query("select id from public.workers")).rows);
    expect(rows).toHaveLength(0);
  });

  it("hides another organization's row even when its id is known", async () => {
    await actAs(db, acme.userId);
    const { rows: target } = await db.query<{ id: string }>(
      "select id from public.workers where organization_id = $1",
      [zeta.organizationId],
    );
    const visible = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.workers where id = $1", [target[0].id])).rows);
    expect(visible).toHaveLength(0);
  });
});

describe("cross-tenant writes", () => {
  it("refuses to insert a worker into another organization", async () => {
    await actAs(db, acme.userId);
    await asAuthenticatedRole(db, async () => {
      const message = await expectRejection(() => db.query(
        `insert into public.workers (organization_id, mine_site_id, full_name, created_by, updated_by)
         values ($1, $2, 'Intruder', $3, $3)`,
        [zeta.organizationId, zeta.siteId, acme.userId],
      ));
      expect(message).toMatch(/row-level security/i);
    });
  });

  it("silently updates nothing when targeting another organization's row", async () => {
    await actAs(db, acme.userId);
    const { rows: target } = await db.query<{ id: string }>(
      "select id from public.equipment where organization_id = $1",
      [zeta.organizationId],
    );
    await asAuthenticatedRole(db, async () => {
      await db.query("update public.equipment set name = 'Hijacked', updated_by = $2 where id = $1", [target[0].id, acme.userId]);
    });
    const { rows } = await db.query<{ name: string }>("select name from public.equipment where id = $1", [target[0].id]);
    expect(rows[0].name).toBe("Excavator");
  });
});

describe("ledger tables are read-only to clients", () => {
  // These have no INSERT policy on purpose: their recording functions perform the locked balance and
  // status checks, so a direct insert would be a way around the rule.
  const ledgerTables = [
    "fuel_receipts",
    "fuel_issues",
    "fuel_adjustments",
    "stock_receipts",
    "stock_issues",
    "stock_transfers",
    "stock_adjustments",
    "inventory_stock_balances",
    "production_approvals",
    "equipment_meter_readings",
    "equipment_status_history",
  ];

  for (const table of ledgerTables) {
    it(`refuses a direct insert into ${table}`, async () => {
      await actAs(db, acme.userId);
      await asAuthenticatedRole(db, async () => {
        const message = await expectRejection(() => db.query(
          `insert into public.${table} (organization_id) values ($1)`,
          [acme.organizationId],
        ));
        // Either RLS blocks it or a NOT NULL column does; both prove no policy allows the insert.
        expect(message).toMatch(/row-level security|null value|violates/i);
      });
    });
  }

  it("has no policy that permits an insert into any ledger table", async () => {
    // Restrictive policies are excluded deliberately, and the distinction matters. A restrictive
    // policy is AND-ed with the permissive ones and can only ever narrow access, so it cannot be
    // what lets a row in. Only a permissive policy grants anything. The site-restriction policy
    // added in 0028 is restrictive and covers several of these tables.
    const { rows } = await db.query<{ tablename: string }>(
      `select tablename from pg_policies
       where schemaname = 'public' and tablename = any($1)
         and cmd in ('INSERT', 'ALL') and permissive = 'PERMISSIVE'`,
      [ledgerTables],
    );
    expect(rows).toEqual([]);
  });
});

describe("internal helper functions", () => {
  // These carry the locked balance checks; granting them to clients would let a caller move a balance
  // without recording the matching movement row.
  for (const fn of ["apply_fuel_movement", "apply_stock_movement", "sync_role_permission_defaults"]) {
    it(`does not grant execute on ${fn} to authenticated`, async () => {
      const { rows } = await db.query<{ granted: boolean }>(
        `select has_function_privilege('authenticated', p.oid, 'execute') as granted
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = $1`,
        [fn],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.granted === false)).toBe(true);
    });
  }
});

describe("role permission defaults", () => {
  it("gives the owner every permission", async () => {
    const { rows } = await db.query<{ missing: string }>(
      `select p.code as missing from public.permissions p
       where not exists (
         select 1 from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
         where rp.permission_id = p.id and r.organization_id = $1 and r.code = 'company_owner'
       )`,
      [acme.organizationId],
    );
    expect(rows).toEqual([]);
  });

  it("grants each system role exactly what the defaults table says", async () => {
    const { rows } = await db.query<{ role_code: string; permission_code: string }>(
      `select d.role_code, d.permission_code from public.role_permission_defaults d
       where not exists (
         select 1 from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
         join public.permissions p on p.id = rp.permission_id
         where r.organization_id = $1 and r.code = d.role_code and p.code = d.permission_code
       )`,
      [acme.organizationId],
    );
    expect(rows).toEqual([]);
  });

  it("does not give a storekeeper production approval", async () => {
    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       join public.permissions p on p.id = rp.permission_id
       where r.organization_id = $1 and r.code = 'storekeeper' and p.code = 'production.approve'`,
      [acme.organizationId],
    );
    expect(Number(rows[0].count)).toBe(0);
  });
});
