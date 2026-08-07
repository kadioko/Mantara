import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  asAuthenticatedRole,
  createTestDatabase,
  createWorkspace,
  type TestDatabase,
  type Workspace,
} from "./harness";

/**
 * Removing a worker or an asset is a soft delete: the row stays so its history remains meaningful,
 * and the read policies stop returning it. These check both halves of that, since a soft delete that
 * still appears in listings is worse than no delete at all.
 */
let db: TestDatabase;
let acme: Workspace;
let zeta: Workspace;

beforeAll(async () => {
  db = await createTestDatabase();
  acme = await createWorkspace(db, "owner@acme.test", "Acme Mining");
  zeta = await createWorkspace(db, "owner@zeta.test", "Zeta Mining");
}, 120_000);

afterAll(async () => { await db?.close(); });

async function newWorker(workspace: Workspace, name: string) {
  await actAs(db, workspace.userId);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.workers (organization_id, mine_site_id, full_name, created_by, updated_by)
     values ($1, $2, $3, $4, $4) returning id`,
    [workspace.organizationId, workspace.siteId, name, workspace.userId],
  );
  return rows[0].id;
}

async function newEquipment(workspace: Workspace, name: string) {
  await actAs(db, workspace.userId);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.equipment (organization_id, mine_site_id, name, current_meter, created_by, updated_by)
     values ($1, $2, $3, 100, $4, $4) returning id`,
    [workspace.organizationId, workspace.siteId, name, workspace.userId],
  );
  return rows[0].id;
}

const softDelete = (table: string, id: string, userId: string) =>
  db.query(
    `update public.${table} set deleted_at = now(), deleted_by = $2, updated_by = $2 where id = $1`,
    [id, userId],
  );

describe("removing a worker", () => {
  it("hides the worker from reads once removed", async () => {
    const workerId = await newWorker(acme, "Departing Worker");
    await softDelete("workers", workerId, acme.userId);

    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.workers where id = $1", [workerId])).rows);
    expect(rows).toHaveLength(0);
  });

  it("keeps the row and its attendance history", async () => {
    const workerId = await newWorker(acme, "History Worker");
    await db.query(
      `insert into public.attendance_records (organization_id, mine_site_id, worker_id, attendance_date, status, created_by, updated_by)
       values ($1, $2, $3, '2026-08-01', 'present', $4, $4)`,
      [acme.organizationId, acme.siteId, workerId, acme.userId],
    );
    await softDelete("workers", workerId, acme.userId);

    const { rows: stillThere } = await db.query("select id from public.workers where id = $1", [workerId]);
    expect(stillThere).toHaveLength(1);

    const attendance = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.attendance_records where worker_id = $1", [workerId])).rows);
    expect(attendance).toHaveLength(1);
  });

  it("records who removed them and when", async () => {
    const workerId = await newWorker(acme, "Audited Worker");
    await softDelete("workers", workerId, acme.userId);
    const { rows } = await db.query<{ deleted_by: string; deleted_at: string | null }>(
      "select deleted_by, deleted_at from public.workers where id = $1", [workerId]);
    expect(rows[0].deleted_by).toBe(acme.userId);
    expect(rows[0].deleted_at).not.toBeNull();
  });
});

describe("removing equipment", () => {
  it("hides the asset but keeps its meter history", async () => {
    const equipmentId = await newEquipment(acme, "Retiring Excavator");
    await db.query("select public.record_equipment_meter_reading($1, $2)", [equipmentId, 150]);
    await softDelete("equipment", equipmentId, acme.userId);

    const visible = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.equipment where id = $1", [equipmentId])).rows);
    expect(visible).toHaveLength(0);

    const readings = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.equipment_meter_readings where equipment_id = $1", [equipmentId])).rows);
    expect(readings).toHaveLength(1);
  });

  // The function itself filters on deleted_at, so a removed asset cannot quietly keep accruing hours.
  it("refuses a meter reading against a removed asset", async () => {
    const equipmentId = await newEquipment(acme, "Gone Loader");
    await softDelete("equipment", equipmentId, acme.userId);
    await expect(db.query("select public.record_equipment_meter_reading($1, $2)", [equipmentId, 500])).rejects.toThrow(/not found/i);
  });
});

describe("edits stay inside the tenant", () => {
  it("cannot rename another organization's worker", async () => {
    const workerId = await newWorker(zeta, "Zeta Worker");
    await actAs(db, acme.userId);
    await asAuthenticatedRole(db, async () => {
      await db.query("update public.workers set full_name = 'Hijacked', updated_by = $2 where id = $1", [workerId, acme.userId]);
    });
    const { rows } = await db.query<{ full_name: string }>("select full_name from public.workers where id = $1", [workerId]);
    expect(rows[0].full_name).toBe("Zeta Worker");
  });

  it("cannot remove another organization's equipment", async () => {
    const equipmentId = await newEquipment(zeta, "Zeta Drill");
    await actAs(db, acme.userId);
    await asAuthenticatedRole(db, async () => {
      await db.query("update public.equipment set deleted_at = now(), updated_by = $2 where id = $1", [equipmentId, acme.userId]);
    });
    const { rows } = await db.query<{ deleted_at: string | null }>("select deleted_at from public.equipment where id = $1", [equipmentId]);
    expect(rows[0].deleted_at).toBeNull();
  });
});
