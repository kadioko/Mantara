import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs, asAuthenticatedRole, createTestDatabase, createUser, createWorkspace,
  expectRejection, type TestDatabase, type Workspace,
} from "./harness";

/**
 * Site restriction has to survive the reporting functions.
 *
 * `0028` restricts a member to particular sites with restrictive RLS policies, and those work. But
 * every headline figure is computed inside a `SECURITY DEFINER` function, and those bypass RLS by
 * design. Until `0039` the guard checked organization-level permission and never asked whether the
 * caller may reach the site being asked about — so a member restricted to Pit One could not list
 * Pit Two's production rows, and could ask for its tonnage and be told.
 *
 * For a mine that is the number that matters: not which rows exist, but how much came out.
 */

let db: TestDatabase;
let acme: Workspace;
let pitTwo: string;
let restricted: string;
let unrestricted: string;

const asMember = async <T>(userId: string, run: () => Promise<T>): Promise<T> => {
  await actAs(db, userId);
  return asAuthenticatedRole(db, run);
};

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  await actAs(db, acme.userId);

  pitTwo = (await db.query<{ id: string }>(
    `insert into public.mine_sites (organization_id, name, created_by) values ($1,'Pit Two',$2) returning id`,
    [acme.organizationId, acme.userId])).rows[0].id;

  const shift = (await db.query<{ id: string }>(
    `insert into public.shifts (organization_id, mine_site_id, name, shift_date, created_by)
     values ($1,$2,'Day',current_date,$3) returning id`,
    [acme.organizationId, pitTwo, acme.userId])).rows[0].id;

  await db.query(
    `insert into public.production_entries
       (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, grade, status, created_by)
     values ($1,$2,$3,current_date,'gold ore',500,'tonne',7,'approved',$4)`,
    [acme.organizationId, pitTwo, shift, acme.userId]);

  const manager = async (email: string) => {
    const id = await createUser(db, email);
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role_id, status)
       select $1,$2,r.id,'active' from public.roles r where r.organization_id=$1 and r.code='mine_manager'`,
      [acme.organizationId, id]);
    return id;
  };

  restricted = await manager("restricted@acme.test");
  unrestricted = await manager("free@acme.test");
  await actAs(db, acme.userId);
  // Pit One only. Pit Two is explicitly out of reach for this member.
  await db.query("select public.set_member_sites($1,$2,$3)", [acme.organizationId, restricted, [acme.siteId]]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("a member restricted away from a site", () => {
  it("cannot list its rows", async () => {
    // The part that already worked, asserted so the tests below are known to be about the gap
    // rather than about a member who was never restricted properly in the first place.
    const { rows } = await asMember(restricted, () =>
      db.query("select id from public.production_entries where mine_site_id=$1", [pitTwo]));
    expect(rows).toHaveLength(0);
  });

  /**
   * Every function that reports on one site. Each was reachable for a forbidden site before `0039`;
   * `production_totals` returned its full 500 tonnes.
   */
  const reportingCalls: Array<[string, string]> = [
    ["production_totals", "select * from public.production_totals($1)"],
    ["maintenance_totals", "select * from public.maintenance_totals($1)"],
    ["expense_totals", "select * from public.expense_totals($1)"],
    ["fuel_totals", "select * from public.fuel_totals($1)"],
    ["equipment_fuel_consumption", "select * from public.equipment_fuel_consumption($1)"],
    ["inventory_shrinkage", "select * from public.inventory_shrinkage($1)"],
    ["site_period_comparison", "select * from public.site_period_comparison($1)"],
    ["site_operational_intelligence", "select * from public.site_operational_intelligence($1)"],
    ["site_cashflow_forecast", "select * from public.site_cashflow_forecast($1)"],
    ["site_daily_summary", "select public.site_daily_summary($1)"],
    ["site_operational_summary", "select * from public.site_operational_summary($1)"],
  ];

  for (const [name, sql] of reportingCalls) {
    it(`is refused by ${name}`, async () => {
      const message = await asMember(restricted, () => expectRejection(() => db.query(sql, [pitTwo])));
      expect(message, `${name} answered for a site this member may not reach`).toMatch(/permission denied/i);
    });
  }

  it("still gets figures for the site it may reach", async () => {
    // A guard that refuses everything is not a guard, it is an outage. This is the half that proves
    // the fix narrowed access rather than removing it.
    const { rows } = await asMember(restricted, () =>
      db.query<{ approved_quantity: string }>("select * from public.production_totals($1)", [acme.siteId]));
    expect(rows).toHaveLength(1);
  });
});

describe("everyone else is unaffected", () => {
  it("an unrestricted member still reads every site", async () => {
    // may_reach_site is inert for a member with no restriction rows, which is most of them. If this
    // fails, the fix has broken every ordinary organization in the product.
    const { rows } = await asMember(unrestricted, () =>
      db.query<{ approved_quantity: string }>("select * from public.production_totals($1)", [pitTwo]));
    expect(Number(rows[0].approved_quantity)).toBe(500);
  });

  it("the owner still reads every site", async () => {
    const { rows } = await asMember(acme.userId, () =>
      db.query<{ approved_quantity: string }>("select * from public.production_totals($1)", [pitTwo]));
    expect(Number(rows[0].approved_quantity)).toBe(500);
  });
});
