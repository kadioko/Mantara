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
 * Safety records carry information about named people's injuries and health. The rules protecting them
 * are enforced by the database, so these tests exercise them there rather than through the UI.
 */
let db: TestDatabase;
let acme: Workspace;
let supervisorId: string;
let officerId: string;

/** Adds a user to an organization under one of its system roles. */
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
  // A site supervisor holds safety.read but not safety.read_sensitive; a safety officer holds both.
  supervisorId = await addMember(acme.organizationId, "supervisor@acme.test", "site_supervisor");
  officerId = await addMember(acme.organizationId, "officer@acme.test", "safety_officer");
}, 120_000);

afterAll(async () => { await db?.close(); });

async function newIncident(title: string) {
  await actAs(db, acme.userId);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.safety_incidents (organization_id, mine_site_id, title, category, severity, created_by, updated_by)
     values ($1, $2, $3, 'injury', 'high', $4, $4) returning id`,
    [acme.organizationId, acme.siteId, title, acme.userId],
  );
  return rows[0].id;
}

describe("granular safety permissions", () => {
  it("gives a site supervisor safety.read but not safety.read_sensitive", async () => {
    await actAs(db, supervisorId);
    const { rows } = await db.query<{ can_read: boolean; can_read_sensitive: boolean }>(
      `select public.has_permission($1, 'safety.read') as can_read,
              public.has_permission($1, 'safety.read_sensitive') as can_read_sensitive`,
      [acme.organizationId],
    );
    expect(rows[0].can_read).toBe(true);
    expect(rows[0].can_read_sensitive).toBe(false);
  });

  it("gives a safety officer both", async () => {
    await actAs(db, officerId);
    const { rows } = await db.query<{ can_read: boolean; can_read_sensitive: boolean }>(
      `select public.has_permission($1, 'safety.read') as can_read,
              public.has_permission($1, 'safety.read_sensitive') as can_read_sensitive`,
      [acme.organizationId],
    );
    expect(rows[0].can_read).toBe(true);
    expect(rows[0].can_read_sensitive).toBe(true);
  });
});

describe("sensitive incident details", () => {
  it("lets a safety officer record and read them back", async () => {
    const incidentId = await newIncident("Hand injury at crusher");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2, $3, $4)", [
      incidentId, "Laceration to left hand", "Referred to clinic", "Next of kin informed",
    ]);
    const { rows } = await db.query<{ injury_description: string; medical_notes: string }>(
      "select injury_description, medical_notes from public.read_safety_incident_details($1)", [incidentId],
    );
    expect(rows[0].injury_description).toBe("Laceration to left hand");
    expect(rows[0].medical_notes).toBe("Referred to clinic");
  });

  it("refuses to return them to someone with only safety.read", async () => {
    const incidentId = await newIncident("Slip on walkway");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2)", [incidentId, "Bruised knee"]);

    await actAs(db, supervisorId);
    const message = await expectRejection(() => db.query("select * from public.read_safety_incident_details($1)", [incidentId]));
    expect(message).toMatch(/permission denied/i);
  });

  it("refuses to let them be written by someone without the sensitive grant", async () => {
    const incidentId = await newIncident("Dust exposure");
    await actAs(db, supervisorId);
    const message = await expectRejection(() =>
      db.query("select public.write_safety_incident_details($1, null, $2)", [incidentId, "Attempted write"]));
    expect(message).toMatch(/permission denied/i);
  });

  // The table has no policy of any kind, so the audited functions are the only route in.
  it("cannot be read by querying the table directly, even as a safety officer", async () => {
    const incidentId = await newIncident("Direct read attempt");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2)", [incidentId, "Confidential"]);

    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query("select injury_description from public.safety_incident_details")).rows);
    expect(rows).toHaveLength(0);
  });

  it("cannot be written by inserting into the table directly", async () => {
    const incidentId = await newIncident("Direct write attempt");
    await actAs(db, officerId);
    await asAuthenticatedRole(db, async () => {
      const message = await expectRejection(() => db.query(
        `insert into public.safety_incident_details (incident_id, organization_id, injury_description)
         values ($1, $2, 'Forged')`,
        [incidentId, acme.organizationId],
      ));
      expect(message).toMatch(/row-level security/i);
    });
  });

  it("has no policy defined at all", async () => {
    const { rows } = await db.query(
      "select policyname from pg_policies where schemaname = 'public' and tablename = 'safety_incident_details'",
    );
    expect(rows).toEqual([]);
  });

  it("reports whether details exist without disclosing them", async () => {
    const withDetails = await newIncident("Has details");
    const withoutDetails = await newIncident("No details");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2)", [withDetails, "Something"]);

    await actAs(db, supervisorId);
    const { rows: yes } = await db.query<{ safety_incident_has_details: boolean }>(
      "select public.safety_incident_has_details($1)", [withDetails]);
    const { rows: no } = await db.query<{ safety_incident_has_details: boolean }>(
      "select public.safety_incident_has_details($1)", [withoutDetails]);
    expect(yes[0].safety_incident_has_details).toBe(true);
    expect(no[0].safety_incident_has_details).toBe(false);
  });
});

describe("auditing sensitive access", () => {
  it("records every read against the reader", async () => {
    const incidentId = await newIncident("Audited read");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2)", [incidentId, "Details"]);
    await db.query("select * from public.read_safety_incident_details($1)", [incidentId]);

    const { rows } = await db.query<{ action: string; user_id: string }>(
      `select action, user_id from public.audit_logs
       where entity_id = $1 and action = 'safety_incident_details.viewed'`,
      [incidentId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(officerId);
  });

  it("records each read separately, so repeated access is visible", async () => {
    const incidentId = await newIncident("Repeated reads");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2)", [incidentId, "Details"]);
    await db.query("select * from public.read_safety_incident_details($1)", [incidentId]);
    await db.query("select * from public.read_safety_incident_details($1)", [incidentId]);

    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.audit_logs
       where entity_id = $1 and action = 'safety_incident_details.viewed'`,
      [incidentId],
    );
    expect(Number(rows[0].count)).toBe(2);
  });

  it("records writes as well as reads", async () => {
    const incidentId = await newIncident("Audited write");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2)", [incidentId, "Details"]);
    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.audit_logs
       where entity_id = $1 and action = 'safety_incident_details.recorded'`,
      [incidentId],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("writes no audit row when access was denied", async () => {
    const incidentId = await newIncident("Denied read");
    await actAs(db, officerId);
    await db.query("select public.write_safety_incident_details($1, null, $2)", [incidentId, "Details"]);

    await actAs(db, supervisorId);
    await expectRejection(() => db.query("select * from public.read_safety_incident_details($1)", [incidentId]));

    const { rows } = await db.query<{ count: string }>(
      `select count(*) as count from public.audit_logs
       where entity_id = $1 and action = 'safety_incident_details.viewed'`,
      [incidentId],
    );
    expect(Number(rows[0].count)).toBe(0);
  });
});

describe("corrective actions", () => {
  it("refuses one that is attached to neither an incident nor an inspection", async () => {
    await actAs(db, acme.userId);
    await expectRejection(() => db.query(
      `insert into public.corrective_actions (organization_id, mine_site_id, description, created_by, updated_by)
       values ($1, $2, 'Floating action', $3, $3)`,
      [acme.organizationId, acme.siteId, acme.userId],
    ));
  });
});

describe("compliance recurrence", () => {
  async function newRequirement(name: string, recurrence: string) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.compliance_requirements (organization_id, name, recurrence, created_by, updated_by)
       values ($1, $2, $3, $4, $4) returning id`,
      [acme.organizationId, name, recurrence, acme.userId],
    );
    return rows[0].id;
  }
  async function newTask(title: string, dueOn: string, requirementId: string | null) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.compliance_tasks (organization_id, requirement_id, title, due_on, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $5) returning id`,
      [acme.organizationId, requirementId, title, dueOn, acme.userId],
    );
    return rows[0].id;
  }

  it("schedules the next task when a recurring one is completed", async () => {
    await actAs(db, acme.userId);
    const requirementId = await newRequirement("Quarterly environmental return", "quarterly");
    const taskId = await newTask("Q1 return", "2026-03-31", requirementId);

    const { rows } = await db.query<{ complete_compliance_task: string | null }>(
      "select public.complete_compliance_task($1)", [taskId]);
    expect(rows[0].complete_compliance_task).not.toBeNull();

    // A quarterly obligation due 31 March next falls due 30 June.
    const { rows: next } = await db.query<{ due_on: Date; status: string }>(
      "select due_on, status from public.compliance_tasks where id = $1", [rows[0].complete_compliance_task],
    );
    expect(new Date(next[0].due_on).toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(next[0].status).toBe("open");
  });

  it("stops recurring once the requirement is retired", async () => {
    // Retiring a requirement is how an organization drops an obligation. Before 0026 the recurrence
    // was read without checking is_active, so a retired requirement kept scheduling its next task
    // forever, and the only way to stop it was to cancel each occurrence by hand.
    await actAs(db, acme.userId);
    const requirementId = await newRequirement("Monthly dust return", "monthly");
    await db.query("update public.compliance_requirements set is_active = false where id = $1", [requirementId]);
    const taskId = await newTask("March dust return", "2026-03-31", requirementId);

    const { rows } = await db.query<{ complete_compliance_task: string | null }>(
      "select public.complete_compliance_task($1)", [taskId]);
    expect(rows[0].complete_compliance_task).toBeNull();
  });

  it("resumes recurring when the requirement is reinstated", async () => {
    await actAs(db, acme.userId);
    const requirementId = await newRequirement("Monthly water return", "monthly");
    await db.query("update public.compliance_requirements set is_active = false where id = $1", [requirementId]);
    await db.query("update public.compliance_requirements set is_active = true where id = $1", [requirementId]);
    const taskId = await newTask("March water return", "2026-03-31", requirementId);

    const { rows } = await db.query<{ complete_compliance_task: string | null }>(
      "select public.complete_compliance_task($1)", [taskId]);
    expect(rows[0].complete_compliance_task).not.toBeNull();
  });

  it("leaves an already-open task alone when the requirement is retired", async () => {
    // Retiring stops new work being scheduled; it does not erase work already on someone's list.
    await actAs(db, acme.userId);
    const requirementId = await newRequirement("Monthly noise return", "monthly");
    const taskId = await newTask("March noise return", "2026-03-31", requirementId);
    await db.query("update public.compliance_requirements set is_active = false where id = $1", [requirementId]);

    const { rows } = await db.query<{ status: string }>(
      "select status from public.compliance_tasks where id = $1", [taskId]);
    expect(rows[0].status).toBe("open");
  });

  it("schedules nothing for a one-off task", async () => {
    await actAs(db, acme.userId);
    const requirementId = await newRequirement("One off survey", "none");
    const taskId = await newTask("Survey", "2026-04-30", requirementId);
    const { rows } = await db.query<{ complete_compliance_task: string | null }>(
      "select public.complete_compliance_task($1)", [taskId]);
    expect(rows[0].complete_compliance_task).toBeNull();
  });

  it("schedules nothing for a task with no requirement", async () => {
    await actAs(db, acme.userId);
    const taskId = await newTask("Ad hoc", "2026-05-31", null);
    const { rows } = await db.query<{ complete_compliance_task: string | null }>(
      "select public.complete_compliance_task($1)", [taskId]);
    expect(rows[0].complete_compliance_task).toBeNull();
  });

  it("refuses to complete the same task twice", async () => {
    await actAs(db, acme.userId);
    const taskId = await newTask("Only once", "2026-07-31", null);
    await db.query("select public.complete_compliance_task($1)", [taskId]);
    const message = await expectRejection(() => db.query("select public.complete_compliance_task($1)", [taskId]));
    expect(message).toMatch(/already completed/i);
  });

  it("refuses completion without compliance.update", async () => {
    await actAs(db, acme.userId);
    const taskId = await newTask("Supervisor attempt", "2026-08-31", null);
    await actAs(db, supervisorId);
    const message = await expectRejection(() => db.query("select public.complete_compliance_task($1)", [taskId]));
    expect(message).toMatch(/permission denied/i);
  });

  it("rejects a licence that expires before it was issued", async () => {
    await actAs(db, acme.userId);
    await expectRejection(() => db.query(
      `insert into public.mineral_licences (organization_id, licence_number, licence_type, issued_on, expires_on, created_by, updated_by)
       values ($1, 'ML-1', 'Primary mining licence', '2026-06-01', '2026-01-01', $2, $2)`,
      [acme.organizationId, acme.userId],
    ));
  });
});
