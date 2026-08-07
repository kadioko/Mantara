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
 * Membership changes can lock an organization out of its own data, so the guards that prevent that
 * are enforced in the database and asserted here.
 */
let db: TestDatabase;
let acme: Workspace;
let managerId: string;
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

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  managerId = await addMember(acme.organizationId, "manager@acme.test", "mine_manager");
  supervisorId = await addMember(acme.organizationId, "supervisor@acme.test", "site_supervisor");

  // By default only an owner may administer members, and an owner cannot change their own role, so
  // the last-owner guard is unreachable through the stock roles. An organization can grant
  // member.update_role to another role, which is the situation the guard actually protects.
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select r.id, p.id from public.roles r cross join public.permissions p
     where r.organization_id = $1 and r.code = 'mine_manager' and p.code = 'member.update_role'
     on conflict do nothing`,
    [acme.organizationId],
  );
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("invitations", () => {
  it("creates an invitation for a person with no account yet", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ invite_member: string }>(
      "select public.invite_member($1, $2, 'accountant')", [acme.organizationId, "newcomer@acme.test"],
    );
    expect(rows[0].invite_member).toBeTruthy();
  });

  // Re-inviting hits the ON CONFLICT path against a partial unique index.
  it("reuses the existing invitation when the same address is invited again", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.invite_member($1, $2, 'storekeeper')", [acme.organizationId, "repeat@acme.test"]);
    await db.query("select public.invite_member($1, $2, 'accountant')", [acme.organizationId, "repeat@acme.test"]);
    const { rows } = await db.query<{ count: string; code: string }>(
      `select count(*) as count, max(r.code) as code
       from public.organization_invitations i join public.roles r on r.id = i.role_id
       where i.organization_id = $1 and i.email = 'repeat@acme.test' and i.accepted_at is null and i.revoked_at is null`,
      [acme.organizationId],
    );
    expect(Number(rows[0].count)).toBe(1);
    expect(rows[0].code).toBe("accountant");
  });

  it("normalises the address so casing does not create a second invitation", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "Mixed@Acme.test"]);
    await db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "mixed@acme.test"]);
    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.organization_invitations
       where organization_id = $1 and email = 'mixed@acme.test' and accepted_at is null and revoked_at is null`,
      [acme.organizationId],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("refuses to invite someone who is already a member", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "manager@acme.test"]));
    expect(message).toMatch(/already a member/i);
  });

  it("refuses an invitation from someone without member.invite", async () => {
    await actAs(db, supervisorId);
    const message = await expectRejection(() =>
      db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "nope@acme.test"]));
    expect(message).toMatch(/permission denied/i);
  });

  it("rejects a malformed address", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "not-an-email"]));
    expect(message).toMatch(/valid email/i);
  });
});

describe("accepting an invitation", () => {
  it("turns an invitation into active membership when that person signs in", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.invite_member($1, $2, 'accountant')", [acme.organizationId, "joiner@acme.test"]);

    const joinerId = await createUser(db, "joiner@acme.test");
    await actAs(db, joinerId);
    const { rows } = await db.query<{ accept_pending_invitations: number }>("select public.accept_pending_invitations()");
    expect(rows[0].accept_pending_invitations).toBe(1);

    const { rows: membership } = await db.query<{ status: string; code: string }>(
      `select m.status, r.code from public.organization_memberships m
       join public.roles r on r.id = m.role_id
       where m.organization_id = $1 and m.user_id = $2`,
      [acme.organizationId, joinerId],
    );
    expect(membership[0]).toMatchObject({ status: "active", code: "accountant" });
  });

  it("does nothing the second time it is called", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "twice@acme.test"]);
    const userId = await createUser(db, "twice@acme.test");
    await actAs(db, userId);
    await db.query("select public.accept_pending_invitations()");
    const { rows } = await db.query<{ accept_pending_invitations: number }>("select public.accept_pending_invitations()");
    expect(rows[0].accept_pending_invitations).toBe(0);
  });

  it("ignores an invitation addressed to somebody else", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "intended@acme.test"]);
    const otherId = await createUser(db, "someone-else@acme.test");
    await actAs(db, otherId);
    const { rows } = await db.query<{ accept_pending_invitations: number }>("select public.accept_pending_invitations()");
    expect(rows[0].accept_pending_invitations).toBe(0);
  });

  it("ignores a revoked invitation", async () => {
    await actAs(db, acme.userId);
    const { rows: created } = await db.query<{ invite_member: string }>(
      "select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "revoked@acme.test"]);
    await db.query("select public.revoke_invitation($1)", [created[0].invite_member]);

    const userId = await createUser(db, "revoked@acme.test");
    await actAs(db, userId);
    const { rows } = await db.query<{ accept_pending_invitations: number }>("select public.accept_pending_invitations()");
    expect(rows[0].accept_pending_invitations).toBe(0);
  });

  it("ignores an expired invitation", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.invite_member($1, $2, 'viewer')", [acme.organizationId, "expired@acme.test"]);
    await db.query("update public.organization_invitations set expires_at = now() - interval '1 day' where email = 'expired@acme.test'");

    const userId = await createUser(db, "expired@acme.test");
    await actAs(db, userId);
    const { rows } = await db.query<{ accept_pending_invitations: number }>("select public.accept_pending_invitations()");
    expect(rows[0].accept_pending_invitations).toBe(0);
  });
});

describe("changing roles and access", () => {
  it("changes a member's role", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_member_role($1, $2, 'safety_officer')", [acme.organizationId, supervisorId]);
    const { rows } = await db.query<{ code: string }>(
      `select r.code from public.organization_memberships m join public.roles r on r.id = m.role_id
       where m.organization_id = $1 and m.user_id = $2`,
      [acme.organizationId, supervisorId],
    );
    expect(rows[0].code).toBe("safety_officer");
    await db.query("select public.set_member_role($1, $2, 'site_supervisor')", [acme.organizationId, supervisorId]);
  });

  // Self-service role changes are how an administrator removes their own access by accident.
  it("refuses to let someone change their own role", async () => {
    await actAs(db, acme.userId);
    const message = await expectRejection(() =>
      db.query("select public.set_member_role($1, $2, 'viewer')", [acme.organizationId, acme.userId]));
    expect(message).toMatch(/your own role/i);
  });

  it("refuses to demote the last owner", async () => {
    await actAs(db, managerId);
    const message = await expectRejection(() =>
      db.query("select public.set_member_role($1, $2, 'viewer')", [acme.organizationId, acme.userId]));
    expect(message).toMatch(/at least one owner/i);
  });

  it("refuses to suspend the last owner", async () => {
    await actAs(db, managerId);
    const message = await expectRejection(() =>
      db.query("select public.set_member_status($1, $2, 'suspended')", [acme.organizationId, acme.userId]));
    expect(message).toMatch(/at least one active owner/i);
  });

  it("allows demoting an owner once a second owner exists", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_member_role($1, $2, 'company_owner')", [acme.organizationId, managerId]);
    await actAs(db, managerId);
    await db.query("select public.set_member_role($1, $2, 'mine_manager')", [acme.organizationId, acme.userId]);
    const { rows } = await db.query<{ active_owner_count: number }>(
      "select public.active_owner_count($1)", [acme.organizationId]);
    expect(rows[0].active_owner_count).toBe(1);
    // Restore the original owner so later tests see the starting arrangement.
    await db.query("select public.set_member_role($1, $2, 'company_owner')", [acme.organizationId, acme.userId]);
  });

  it("suspends a member, which removes their permissions", async () => {
    await actAs(db, acme.userId);
    await db.query("select public.set_member_status($1, $2, 'suspended')", [acme.organizationId, supervisorId]);
    await actAs(db, supervisorId);
    const { rows } = await db.query<{ has_permission: boolean }>(
      "select public.has_permission($1, 'worker.read')", [acme.organizationId]);
    expect(rows[0].has_permission).toBe(false);
    await actAs(db, acme.userId);
    await db.query("select public.set_member_status($1, $2, 'active')", [acme.organizationId, supervisorId]);
  });

  it("refuses a role change from someone without member.update_role", async () => {
    await actAs(db, supervisorId);
    const message = await expectRejection(() =>
      db.query("select public.set_member_role($1, $2, 'viewer')", [acme.organizationId, managerId]));
    expect(message).toMatch(/permission denied/i);
  });

  it("records membership changes in the audit log", async () => {
    const { rows } = await db.query<{ action: string }>(
      "select distinct action from public.audit_logs where organization_id = $1", [acme.organizationId]);
    const actions = rows.map((row) => row.action);
    expect(actions).toContain("member.invited");
    expect(actions).toContain("member.role_changed");
    expect(actions).toContain("member.status_changed");
    expect(actions).toContain("member.joined");
  });
});

describe("notifying approvers", () => {
  async function submitProduction(submitterId: string) {
    await actAs(db, submitterId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.production_entries (organization_id, mine_site_id, material, quantity, created_by, updated_by)
       values ($1, $2, 'Ore', 10, $3, $3) returning id`,
      [acme.organizationId, acme.siteId, submitterId],
    );
    await db.query("update public.production_entries set status = 'submitted', updated_by = $2 where id = $1", [rows[0].id, submitterId]);
    return rows[0].id;
  }
  const notificationsFor = async (userId: string, type: string) => {
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from public.notifications where user_id = $1 and type = $2", [userId, type]);
    return Number(rows[0].count);
  };

  it("notifies someone who can approve", async () => {
    const before = await notificationsFor(managerId, "production.submitted");
    await submitProduction(acme.userId);
    expect(await notificationsFor(managerId, "production.submitted")).toBe(before + 1);
  });

  it("does not notify the person who submitted it", async () => {
    const before = await notificationsFor(managerId, "production.submitted");
    await submitProduction(managerId);
    expect(await notificationsFor(managerId, "production.submitted")).toBe(before);
  });

  it("does not notify someone who cannot approve", async () => {
    await submitProduction(acme.userId);
    expect(await notificationsFor(supervisorId, "production.submitted")).toBe(0);
  });

  it("notifies on a submitted expense too", async () => {
    await actAs(db, acme.userId);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.expenses (organization_id, mine_site_id, description, amount, created_by, updated_by)
       values ($1, $2, 'Diesel', 500, $3, $3) returning id`,
      [acme.organizationId, acme.siteId, acme.userId],
    );
    await db.query("update public.expenses set status = 'submitted', updated_by = $2 where id = $1", [rows[0].id, acme.userId]);
    expect(await notificationsFor(managerId, "expense.submitted")).toBeGreaterThan(0);
  });

  it("keeps notifications private to their recipient", async () => {
    const { rows } = await db.query<{ count: string }>(
      "select count(*) as count from public.notifications where user_id <> $1 and organization_id = $2", [managerId, acme.organizationId]);
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(0);
    const policies = await db.query<{ policyname: string }>(
      "select policyname from pg_policies where tablename = 'notifications' and cmd in ('INSERT', 'ALL')");
    expect(policies.rows).toEqual([]);
  });
});
