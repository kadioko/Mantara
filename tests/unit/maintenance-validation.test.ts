import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allowedWorkOrderTransitions,
  maintenanceCostSchema,
  maintenancePartSchema,
  maintenanceRequestSchema,
  maintenanceScheduleSchema,
  workOrderSchema,
  workOrderStatusSchema,
} from "@/features/maintenance/schemas";

const workOrderId = "77777777-7777-4777-8777-777777777777";
const equipmentId = "88888888-8888-4888-8888-888888888888";

describe("maintenance request validation", () => {
  const request = { title: "Hydraulic leak", priority: "high", reportedOn: "2026-08-07" };

  it("accepts a valid request", () => expect(maintenanceRequestSchema.safeParse(request).success).toBe(true));
  it("requires a title", () => expect(maintenanceRequestSchema.safeParse({ ...request, title: "" }).success).toBe(false));
  it("rejects an unknown priority", () => expect(maintenanceRequestSchema.safeParse({ ...request, priority: "urgent" }).success).toBe(false));
  it("accepts a blank equipment reference", () => expect(maintenanceRequestSchema.safeParse({ ...request, equipmentId: "" }).success).toBe(true));
});

describe("work order validation", () => {
  const order = { title: "500 hour service", priority: "medium" };

  it("accepts a valid work order", () => expect(workOrderSchema.safeParse(order).success).toBe(true));
  it("requires a title", () => expect(workOrderSchema.safeParse({ ...order, title: "" }).success).toBe(false));
  it("rejects an unknown status", () => expect(workOrderStatusSchema.safeParse({ workOrderId, status: "finished" }).success).toBe(false));
  it("accepts a known status", () => expect(workOrderStatusSchema.safeParse({ workOrderId, status: "on_hold" }).success).toBe(true));
});

describe("work order transitions", () => {
  it("never offers a move out of a terminal status", () => {
    expect(allowedWorkOrderTransitions.completed).toEqual([]);
    expect(allowedWorkOrderTransitions.cancelled).toEqual([]);
  });

  it("does not offer completed as a plain status change", () => {
    // Completion must go through complete_work_order() so the service schedule rolls forward.
    for (const targets of Object.values(allowedWorkOrderTransitions)) {
      expect(targets).not.toContain("completed");
    }
  });

  // The dropdown must never offer a move the database trigger would reject.
  it("only offers transitions the migration permits", () => {
    const sql = readFileSync("supabase/migrations/0007_maintenance.sql", "utf8");
    const clause = sql.slice(sql.indexOf("validate_work_order_transition"), sql.indexOf("create trigger maintenance_work_orders_transition"));
    for (const [from, targets] of Object.entries(allowedWorkOrderTransitions)) {
      for (const to of targets) {
        const permitted = new RegExp(`old\\.status = '${from}' and new\\.status (?:=|in \\()[^)]*'${to}'`).test(clause);
        expect(permitted, `${from} -> ${to} must be permitted by the trigger`).toBe(true);
      }
    }
  });
});

describe("maintenance part and cost validation", () => {
  it("accepts a valid part", () => expect(maintenancePartSchema.safeParse({ workOrderId, partName: "Hose", quantity: "2" }).success).toBe(true));
  it("rejects a zero part quantity", () => expect(maintenancePartSchema.safeParse({ workOrderId, partName: "Hose", quantity: "0" }).success).toBe(false));
  it("accepts a valid cost", () => expect(maintenanceCostSchema.safeParse({ workOrderId, costType: "parts", amount: "150", incurredOn: "2026-08-07" }).success).toBe(true));
  it("rejects a negative cost", () => expect(maintenanceCostSchema.safeParse({ workOrderId, costType: "parts", amount: "-1", incurredOn: "2026-08-07" }).success).toBe(false));
  it("rejects an unknown cost type", () => expect(maintenanceCostSchema.safeParse({ workOrderId, costType: "fuel", amount: "10", incurredOn: "2026-08-07" }).success).toBe(false));
});

describe("service schedule validation", () => {
  const schedule = { equipmentId, name: "250 hour service" };

  it("accepts a meter interval", () => expect(maintenanceScheduleSchema.safeParse({ ...schedule, intervalMeter: "250" }).success).toBe(true));
  it("accepts a day interval", () => expect(maintenanceScheduleSchema.safeParse({ ...schedule, intervalDays: "90" }).success).toBe(true));

  // A schedule with neither interval could never come due; the database rejects it too.
  it("rejects a schedule with no interval at all", () =>
    expect(maintenanceScheduleSchema.safeParse(schedule).success).toBe(false));

  it("rejects blank intervals as no interval", () =>
    expect(maintenanceScheduleSchema.safeParse({ ...schedule, intervalMeter: "", intervalDays: "" }).success).toBe(false));

  it("rejects a zero interval", () =>
    expect(maintenanceScheduleSchema.safeParse({ ...schedule, intervalDays: "0" }).success).toBe(false));
});
