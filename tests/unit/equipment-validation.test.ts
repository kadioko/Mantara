import { describe, expect, it } from "vitest";
import {
  equipmentAssignmentSchema,
  equipmentSchema,
  equipmentStatusUpdateSchema,
  meterReadingSchema,
} from "@/features/equipment/schemas";

const equipmentId = "22222222-2222-4222-8222-222222222222";
const workerId = "33333333-3333-4333-8333-333333333333";
const base = { name: "CAT 320", category: "excavator", meterType: "hours" };

describe("equipment validation", () => {
  it("accepts a minimal asset", () => expect(equipmentSchema.safeParse(base).success).toBe(true));

  it("requires a usable name", () => expect(equipmentSchema.safeParse({ ...base, name: "" }).success).toBe(false));

  it("rejects an unknown category", () => expect(equipmentSchema.safeParse({ ...base, category: "spaceship" }).success).toBe(false));

  // Empty form fields arrive as "" and must not coerce to 0, which would invent a meter reading.
  it("treats a blank opening meter as absent rather than zero", () => {
    const parsed = equipmentSchema.safeParse({ ...base, currentMeter: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.currentMeter).toBeUndefined();
  });

  it("treats a blank year as absent rather than zero", () => {
    const parsed = equipmentSchema.safeParse({ ...base, yearOfManufacture: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.yearOfManufacture).toBeUndefined();
  });

  it("still reads a supplied opening meter", () => {
    const parsed = equipmentSchema.safeParse({ ...base, currentMeter: "1250.5" });
    expect(parsed.success && parsed.data.currentMeter).toBe(1250.5);
  });

  it("rejects an implausible year", () => expect(equipmentSchema.safeParse({ ...base, yearOfManufacture: "1700" }).success).toBe(false));
});

describe("meter reading validation", () => {
  it("accepts a positive reading", () => expect(meterReadingSchema.safeParse({ equipmentId, reading: "1300" }).success).toBe(true));

  it("accepts a zero reading", () => expect(meterReadingSchema.safeParse({ equipmentId, reading: "0" }).success).toBe(true));

  it("rejects a negative reading", () => expect(meterReadingSchema.safeParse({ equipmentId, reading: "-5" }).success).toBe(false));

  it("rejects a non-uuid equipment id", () => expect(meterReadingSchema.safeParse({ equipmentId: "nope", reading: "10" }).success).toBe(false));
});

describe("equipment status validation", () => {
  it("accepts a known status", () => expect(equipmentStatusUpdateSchema.safeParse({ equipmentId, status: "breakdown" }).success).toBe(true));

  it("rejects an unknown status", () => expect(equipmentStatusUpdateSchema.safeParse({ equipmentId, status: "on_fire" }).success).toBe(false));
});

describe("equipment assignment validation", () => {
  const assignment = { equipmentId, assignmentName: "Day shift", startsOn: "2026-08-07" };

  it("accepts an open-ended assignment", () => expect(equipmentAssignmentSchema.safeParse(assignment).success).toBe(true));

  it("accepts an unassigned operator", () => expect(equipmentAssignmentSchema.safeParse({ ...assignment, workerId: "" }).success).toBe(true));

  it("accepts a named operator", () => expect(equipmentAssignmentSchema.safeParse({ ...assignment, workerId }).success).toBe(true));

  it("rejects an end date before the start date", () =>
    expect(equipmentAssignmentSchema.safeParse({ ...assignment, endsOn: "2026-08-01" }).success).toBe(false));

  it("accepts an end date on the start date", () =>
    expect(equipmentAssignmentSchema.safeParse({ ...assignment, endsOn: "2026-08-07" }).success).toBe(true));
});
