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

let db: TestDatabase;
let acme: Workspace;
let rival: Workspace;
let pitTwo: string;
let pitFour: string;
let supervisor: string;
let unrestricted: string;

const asMember = async <T>(userId: string, run: () => Promise<T>) => {
  await actAs(db, userId);
  return asAuthenticatedRole(db, run);
};

const visibleEquipment = async (userId: string) =>
  (await asMember(userId, async () =>
    (await db.query<{ name: string }>("select name from public.equipment order by name")).rows)).map((row) => row.name);

async function addMember(email: string, roleCode: string) {
  const userId = await createUser(db, email);
  await actAs(db, acme.userId);
  await db.query(
    `insert into public.organization_memberships (organization_id, user_id, role_id, status)
     select $1, $2, r.id, 'active' from public.roles r where r.organization_id = $1 and r.code = $3`,
    [acme.organizationId, userId, roleCode]);
  return userId;
}

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");

  await actAs(db, acme.userId);
  pitTwo = acme.siteId;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.mine_sites (organization_id, name, created_by) values ($1, 'Pit 4', $2) returning id`,
    [acme.organizationId, acme.userId]);
  pitFour = rows[0].id;

  await db.query(
    `insert into public.equipment (organization_id, mine_site_id, name, category, meter_type, created_by)
     values ($1, $2, 'Excavator at Pit 2', 'excavator', 'hours', $4),
            ($1, $3, 'Excavator at Pit 4', 'excavator', 'hours', $4)`,
    [acme.organizationId, pitTwo, pitFour, acme.userId]);

  supervisor = await addMember("supervisor@acme.test", "site_supervisor");
  unrestricted = await addMember("manager@acme.test", "mine_manager");
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("before anyone is restricted", () => {
  // Applying this migration must change nothing for an organization that never uses the feature.
  // Every existing member has no restriction rows, and no rows means every site, not none.
  it("leaves every member seeing every site's records", async () => {
    expect(await visibleEquipment(supervisor)).toEqual(["Excavator at Pit 2", "Excavator at Pit 4"]);
    expect(await visibleEquipment(unrestricted)).toEqual(["Excavator at Pit 2", "Excavator at Pit 4"]);
  });

  it("leaves every member seeing every site", async () => {
    const rows = await asMember(supervisor, async () =>
      (await db.query<{ name: string }>("select name from public.mine_sites order by name")).rows);
    expect(rows.map((row) => row.name)).toHaveLength(2);
  });
});

describe("once a member is restricted to one site", () => {
  beforeAll(async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, supervisor, [pitTwo]]);
  });

  it("hides the other site's records", async () => {
    expect(await visibleEquipment(supervisor)).toEqual(["Excavator at Pit 2"]);
  });

  it("hides the other site itself, so it is not offered in the workspace switcher", async () => {
    const rows = await asMember(supervisor, async () =>
      (await db.query<{ name: string }>("select name from public.mine_sites order by name")).rows);
    expect(rows.map((row) => row.name)).toEqual(["Acme Mining Site"]);
  });

  it("refuses a write to the other site, even naming a valid row", async () => {
    // The read side hiding a row is not enough. A crafted request naming Pit 4 must also fail.
    const message = await asMember(supervisor, () => expectRejection(() => db.query(
      `insert into public.equipment (organization_id, mine_site_id, name, category, meter_type, created_by)
       values ($1, $2, 'Smuggled in', 'excavator', 'hours', $3)`,
      [acme.organizationId, pitFour, supervisor])));
    expect(message).toMatch(/row-level security/i);
  });

  it("still permits a write to their own site", async () => {
    // Uses an update rather than an insert: site_supervisor holds equipment.update but not
    // equipment.create, so an insert would be refused by the permission that was always missing
    // and would prove nothing about the site restriction.
    const changed = await asMember(supervisor, async () =>
      (await db.query(
        // updated_by is required by the equipment update policy's own WITH CHECK, exactly as the
        // application sets it. Omitting it would fail for a reason unrelated to the site.
        "update public.equipment set notes = 'serviced', updated_by = $2 where mine_site_id = $1",
        [pitTwo, supervisor])).affectedRows ?? 0);
    expect(changed).toBe(1);
  });

  it("refuses the same write to the other site", async () => {
    // The paired negative. RLS on an update does not raise — the row simply falls outside the
    // policy — so the affected count is the only thing that distinguishes refusal from success.
    const changed = await asMember(supervisor, async () =>
      (await db.query(
        "update public.equipment set notes = 'tampered', updated_by = $2 where mine_site_id = $1",
        [pitFour, supervisor])).affectedRows ?? 0);
    expect(changed).toBe(0);

    const { rows } = await db.query<{ notes: string | null }>(
      "select notes from public.equipment where mine_site_id = $1", [pitFour]);
    expect(rows[0].notes).toBeNull();
  });

  it("leaves everyone else untouched", async () => {
    // Restricting one person must not restrict anyone who has no restriction of their own.
    expect(await visibleEquipment(unrestricted)).toContain("Excavator at Pit 4");
  });
});

describe("what restriction never applies to", () => {
  it("does not hide records that belong to no site", async () => {
    // An organization-wide licence or budget is everybody's business. Treating a null site as
    // "no site of mine" would hide the company's own mining licence from its own compliance officer.
    await actAs(db, acme.userId);
    await db.query(
      `insert into public.mineral_licences (organization_id, licence_number, licence_type, status, created_by)
       values ($1, 'ORG-WIDE', 'Primary mining licence', 'active', $2)`,
      [acme.organizationId, acme.userId]);

    const rows = await asMember(supervisor, async () =>
      (await db.query<{ licence_number: string }>("select licence_number from public.mineral_licences")).rows);
    expect(rows.map((row) => row.licence_number)).toContain("ORG-WIDE");
  });

  it("never restricts a company owner", async () => {
    // An owner locked out of their own site by an administrative mistake would have no way back in,
    // and the role exists precisely to be the way back in.
    await actAs(db, acme.userId);
    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, acme.userId, [pitFour]]);
    expect(await visibleEquipment(acme.userId)).toContain("Excavator at Pit 2");
  });
});

describe("managing a restriction", () => {
  it("replaces the whole set rather than adding to it", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, supervisor, [pitFour]]);
    expect(await visibleEquipment(supervisor)).toEqual(["Excavator at Pit 4"]);
  });

  it("clears the restriction when given an empty list", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, supervisor, []]);
    const names = await visibleEquipment(supervisor);
    expect(names).toContain("Excavator at Pit 2");
    expect(names).toContain("Excavator at Pit 4");
  });

  it("records the change in the audit log", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ action: string }>(
      "select action from public.audit_logs where organization_id = $1 and action = 'member.sites_changed'",
      [acme.organizationId]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("refuses a site belonging to another organization", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, supervisor, [rival.siteId]]));
    expect(message).toMatch(/not in this organization/i);
  });

  it("refuses someone who is not a member", async () => {
    const stranger = await createUser(db, "stranger@nowhere.test");
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, stranger, [pitTwo]]));
    expect(message).toMatch(/not a member/i);
  });

  it("refuses a caller without permission to change roles", async () => {
    // Deciding which sites someone reaches is the same kind of decision as deciding what they may
    // do, so it needs the same permission rather than merely the ability to read the member list.
    await actAs(db, acme.userId);
    await db.query(
      `delete from public.role_permissions rp using public.roles r, public.permissions p
       where rp.role_id = r.id and rp.permission_id = p.id
         and r.organization_id = $1 and r.code = 'site_supervisor' and p.code = 'member.update_role'`,
      [acme.organizationId]);

    await actAs(db, supervisor);
    const message = await expectRejection(() =>
      db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, unrestricted, [pitTwo]]));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses an unauthenticated caller", async () => {
    await db.query("select set_config('request.test_user', '', false)");
    const message = await expectRejection(() =>
      db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, supervisor, [pitTwo]]));
    expect(message).toMatch(/authentication required/i);
  });
});

describe("the policies themselves", () => {
  it("covers every table that carries a mine_site_id", async () => {
    // Generated from the catalogue rather than a hand-written list, so this checks the generation
    // actually reached everything. A table with a site column and no restriction is a hole.
    const { rows } = await db.query<{ table_name: string }>(
      `select c.table_name from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.column_name = 'mine_site_id'
         and c.table_name <> 'membership_sites'
         and not exists (
           select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.table_name
             and p.policyname = 'site restriction')`);
    expect(rows.map((row) => row.table_name)).toEqual([]);
  });

  it("reaches a meaningful number of tables, so the check above is not vacuous", async () => {
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from pg_policies where schemaname = 'public' and policyname = 'site restriction'");
    expect(Number(rows[0].count)).toBeGreaterThan(25);
  });

  it("adds only restrictive policies, so it can never widen access", async () => {
    const { rows } = await db.query<{ permissive: string }>(
      "select distinct permissive from pg_policies where schemaname = 'public' and policyname = 'site restriction'");
    expect(rows).toEqual([{ permissive: "RESTRICTIVE" }]);
  });

  it("keeps the restriction table unwritable from a client", async () => {
    await actAs(db, acme.userId);
    const message = await asAuthenticatedRole(db, () => expectRejection(() => db.query(
      `insert into public.membership_sites (organization_id, user_id, mine_site_id)
       values ($1, $2, $3)`,
      [acme.organizationId, supervisor, pitFour])));
    expect(message).toMatch(/row-level security/i);
  });
});

describe("restriction is not a way across the tenant boundary", () => {
  it("shows a restricted member nothing of another organization", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_member_sites($1, $2, $3)", [acme.organizationId, supervisor, [pitTwo]]);
    const rows = await asMember(supervisor, async () =>
      (await db.query("select id from public.mine_sites where organization_id = $1", [rival.organizationId])).rows);
    expect(rows).toEqual([]);
  });
});
