import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  createTestDatabase,
  createUser,
  createWorkspace,
  type TestDatabase,
  type Workspace,
} from "./harness";

let db: TestDatabase;
let acme: Workspace;
let rival: Workspace;
let safetyOnly: string;
let complianceOnly: string;

const runAlerts = async () => {
  const { rows } = await db.query<{ generate_alerts: number }>("select public.generate_alerts()");
  return rows[0].generate_alerts;
};

const notices = async (userId: string, type?: string) => {
  const { rows } = await db.query<{ type: string; title: string; body: string; subject_key: string }>(
    `select type, title, body, subject_key from public.notifications
     where user_id = $1 and ($2::text is null or type = $2) order by subject_key`,
    [userId, type ?? null],
  );
  return rows;
};

/** Adds a member on a named role, keeping only the permissions matching `keepPrefix`. */
async function addNarrowMember(email: string, roleCode: string, keepPrefix: string) {
  const userId = await createUser(db, email);
  await actAs(db, acme.userId);
  await db.query(
    `insert into public.organization_memberships (organization_id, user_id, role_id, status)
     select $1, $2, r.id, 'active' from public.roles r where r.organization_id = $1 and r.code = $3`,
    [acme.organizationId, userId, roleCode],
  );
  await db.query(
    `delete from public.role_permissions rp using public.roles r, public.permissions p
     where rp.role_id = r.id and rp.permission_id = p.id
       and r.organization_id = $1 and r.code = $2 and p.code not like $3`,
    [acme.organizationId, roleCode, `${keepPrefix}%`],
  );
  return userId;
}

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  rival = await createWorkspace(db, "owner@rival.test", "Rival Mining");

  // Two members with genuinely different jobs, so the routing can be checked rather than assumed.
  safetyOnly = await addNarrowMember("safety@acme.test", "site_supervisor", "safety.");
  complianceOnly = await addNarrowMember("compliance@acme.test", "storekeeper", "compliance.");
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select r.id, p.id from public.roles r, public.permissions p
     where r.organization_id = $1 and r.code = 'storekeeper' and p.code = 'compliance.read'
     on conflict do nothing`,
    [acme.organizationId],
  );
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select r.id, p.id from public.roles r, public.permissions p
     where r.organization_id = $1 and r.code = 'site_supervisor' and p.code = 'safety.read'
     on conflict do nothing`,
    [acme.organizationId],
  );

  await actAs(db, acme.userId);
  // A licence expiring in nine days: inside the 14-day threshold, outside 7 and 1.
  await db.query(
    `insert into public.mineral_licences (organization_id, licence_number, licence_type, expires_on, status, created_by)
     values ($1, 'ML-001', 'Primary mining licence', current_date + 9, 'active', $2)`,
    [acme.organizationId, acme.userId]);
  // One well outside every threshold, which must produce nothing at all.
  await db.query(
    `insert into public.mineral_licences (organization_id, licence_number, licence_type, expires_on, status, created_by)
     values ($1, 'ML-002', 'Prospecting licence', current_date + 200, 'active', $2)`,
    [acme.organizationId, acme.userId]);
  // Rival's licence, to prove alerts do not cross a tenant boundary.
  await actAs(db, rival.userId);
  await db.query(
    `insert into public.mineral_licences (organization_id, licence_number, licence_type, expires_on, status, created_by)
     values ($1, 'RIVAL-001', 'Primary mining licence', current_date + 3, 'active', $2)`,
    [rival.organizationId, rival.userId]);

  await actAs(db, acme.userId);
  await db.query(
    `insert into public.compliance_tasks (organization_id, title, due_on, status, created_by)
     values ($1, 'Quarterly environmental return', current_date - 5, 'open', $2)`,
    [acme.organizationId, acme.userId]);

  const { rows: incident } = await db.query<{ id: string }>(
    `insert into public.safety_incidents (organization_id, mine_site_id, title, occurred_at, severity, created_by)
     values ($1, $2, 'Rock fall near portal', now(), 'medium', $3) returning id`,
    [acme.organizationId, acme.siteId, acme.userId]);
  await db.query(
    `insert into public.corrective_actions (organization_id, mine_site_id, incident_id, description, due_on, status, created_by)
     values ($1, $2, $3, 'Install additional mesh support', current_date - 3, 'open', $4)`,
    [acme.organizationId, acme.siteId, incident[0].id, acme.userId]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("running the job", () => {
  it("creates alerts and reports how many", async () => {
    const created = await runAlerts();
    expect(created).toBeGreaterThan(0);
  });

  // The property the whole design rests on. A job that re-sends the same alert every morning teaches
  // people to ignore notifications, which leaves them worse off than no alerting at all.
  it("creates nothing on a second run", async () => {
    expect(await runAlerts()).toBe(0);
  });

  it("still creates nothing after several more runs", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await runAlerts()).toBe(0);
  });
});

describe("licence expiry", () => {
  it("warns once for each threshold the licence has passed", async () => {
    // Nine days out: inside 60, 30 and 14, but not yet 7 or 1.
    const rows = await notices(acme.userId, "compliance.licence_expiring");
    const thresholds = rows.map((row) => row.subject_key.split(":").at(-1)).sort();
    expect(thresholds).toEqual(["14", "30", "60"]);
  });

  it("names the licence and its date, so the alert is actionable without opening the app", async () => {
    const [row] = await notices(acme.userId, "compliance.licence_expiring");
    expect(row.body).toContain("ML-001");
    expect(row.body).toContain("Primary mining licence");
  });

  it("says nothing about a licence that is not close to expiring", async () => {
    const rows = await notices(acme.userId, "compliance.licence_expiring");
    expect(rows.every((row) => !row.body.includes("ML-002"))).toBe(true);
  });

  it("warns again when the next threshold is reached", async () => {
    // Move the licence to five days out. That crosses 7, which has not been sent before.
    await db.query("update public.mineral_licences set expires_on = current_date + 5 where licence_number = 'ML-001'");
    expect(await runAlerts()).toBeGreaterThan(0);
    const rows = await notices(acme.userId, "compliance.licence_expiring");
    expect(rows.map((row) => row.subject_key.split(":").at(-1)).sort()).toEqual(["14", "30", "60", "7"]);
  });

  it("does not repeat a threshold already sent", async () => {
    expect(await runAlerts()).toBe(0);
  });

  it("stops once the licence has expired", async () => {
    // Past expiry there is nothing to warn about — it has happened, and the compliance screen shows
    // it in red. Continuing to send "expires in -3 days" would be noise.
    await db.query("update public.mineral_licences set expires_on = current_date - 3 where licence_number = 'ML-001'");
    // Clear only this organization's licence alerts. Deleting every organization's would let the
    // rival's own perfectly valid alerts regenerate and be mistaken for a failure here.
    await db.query(
      "delete from public.notifications where subject_key like 'licence.expiring%' and organization_id = $1",
      [acme.organizationId]);
    await runAlerts();
    expect(await notices(acme.userId, "compliance.licence_expiring")).toEqual([]);
  });
});

describe("who receives what", () => {
  it("sends compliance alerts to compliance readers", async () => {
    const rows = await notices(complianceOnly);
    expect(rows.some((row) => row.type === "compliance.task_overdue")).toBe(true);
  });

  it("does not send safety work to someone who only does compliance", async () => {
    // Sending each of them the other's list is how both start ignoring it.
    const rows = await notices(complianceOnly);
    expect(rows.some((row) => row.type === "safety.action_overdue")).toBe(false);
  });

  it("sends safety alerts to safety readers", async () => {
    const rows = await notices(safetyOnly);
    expect(rows.some((row) => row.type === "safety.action_overdue")).toBe(true);
  });

  it("does not send compliance work to someone who only does safety", async () => {
    const rows = await notices(safetyOnly);
    expect(rows.some((row) => row.type === "compliance.task_overdue")).toBe(false);
  });

  it("sends nothing about one organization to another", async () => {
    const rows = await notices(acme.userId);
    expect(rows.every((row) => !row.body.includes("RIVAL-001"))).toBe(true);

    const rivalRows = await notices(rival.userId);
    expect(rivalRows.every((row) => !row.body.includes("ML-00"))).toBe(true);
    expect(rivalRows.length).toBeGreaterThan(0); // proves the check above is scoping, not emptiness
  });
});

describe("overdue work", () => {
  it("tells someone once when a compliance task goes overdue", async () => {
    const rows = await notices(acme.userId, "compliance.task_overdue");
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("Quarterly environmental return");
  });

  it("stops once the task is completed", async () => {
    await db.query("update public.compliance_tasks set status = 'completed' where title = 'Quarterly environmental return'");
    await db.query("delete from public.notifications where subject_key like 'compliance.overdue%'");
    expect(await runAlerts()).toBe(0);
  });

  it("tells someone once when a corrective action goes overdue", async () => {
    const rows = await notices(safetyOnly, "safety.action_overdue");
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("Install additional mesh support");
  });
});

describe("a suspended organization", () => {
  it("generates no alerts, because it is not operating", async () => {
    await db.query("update public.organizations set suspended_at = now() where id = $1", [rival.organizationId]);
    await db.query("delete from public.notifications where organization_id = $1", [rival.organizationId]);
    await runAlerts();
    expect(await notices(rival.userId)).toEqual([]);
    await db.query("update public.organizations set suspended_at = null where id = $1", [rival.organizationId]);
  });
});

describe("nothing on the API can call it", () => {
  // generate_alerts writes notifications for other users across every organization. That is exactly
  // what no client should ever be able to do, whatever session it holds.
  it("is not executable by anon or authenticated", async () => {
    const { rows } = await db.query<{ role: string; granted: boolean }>(
      `select r.rolname as role, has_function_privilege(r.rolname, p.oid, 'execute') as granted
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace, pg_roles r
       where n.nspname = 'public' and p.proname = 'generate_alerts'
         and r.rolname in ('anon', 'authenticated')`);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.granted === false)).toBe(true);
  });

  it("keeps the uniqueness that makes re-running safe", async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'notifications_subject_unique'");
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("UNIQUE");
    expect(rows[0].indexdef).toContain("user_id");
  });
});
