import { describe, expect, it } from "vitest";
import {
  downtimeSchema,
  productionEntrySchema,
  productionReviewSchema,
  shiftSchema,
} from "@/features/production/schemas";

const entryId = "44444444-4444-4444-8444-444444444444";
const entry = { entryDate: "2026-08-07", material: "Gold ore", quantity: "120.5", unit: "tonnes" };

describe("shift validation", () => {
  const shift = { name: "Day shift", shiftDate: "2026-08-07" };

  it("accepts a minimal shift", () => expect(shiftSchema.safeParse(shift).success).toBe(true));
  it("requires a usable name", () => expect(shiftSchema.safeParse({ ...shift, name: "" }).success).toBe(false));
  it("accepts a start and end time", () => expect(shiftSchema.safeParse({ ...shift, startsAt: "06:00", endsAt: "18:00" }).success).toBe(true));
  it("rejects an end time before the start time", () => expect(shiftSchema.safeParse({ ...shift, startsAt: "18:00", endsAt: "06:00" }).success).toBe(false));
});

describe("production entry validation", () => {
  it("accepts a valid entry", () => expect(productionEntrySchema.safeParse(entry).success).toBe(true));
  it("accepts a zero quantity", () => expect(productionEntrySchema.safeParse({ ...entry, quantity: "0" }).success).toBe(true));
  it("rejects a negative quantity", () => expect(productionEntrySchema.safeParse({ ...entry, quantity: "-1" }).success).toBe(false));
  it("requires a material", () => expect(productionEntrySchema.safeParse({ ...entry, material: "" }).success).toBe(false));

  // A blank grade must stay absent rather than coercing to a real measured zero.
  it("treats a blank grade as absent rather than zero", () => {
    const parsed = productionEntrySchema.safeParse({ ...entry, grade: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.grade).toBeUndefined();
  });

  it("still reads a supplied grade", () => {
    const parsed = productionEntrySchema.safeParse({ ...entry, grade: "3.25" });
    expect(parsed.success && parsed.data.grade).toBe(3.25);
  });
});

describe("production review validation", () => {
  it("accepts an approval", () => expect(productionReviewSchema.safeParse({ entryId, decision: "approved" }).success).toBe(true));
  it("accepts a rejection", () => expect(productionReviewSchema.safeParse({ entryId, decision: "rejected" }).success).toBe(true));
  it("rejects an unknown decision", () => expect(productionReviewSchema.safeParse({ entryId, decision: "maybe" }).success).toBe(false));
  it("rejects a non-uuid entry id", () => expect(productionReviewSchema.safeParse({ entryId: "nope", decision: "approved" }).success).toBe(false));
});

describe("downtime validation", () => {
  const downtime = { reason: "Belt failure", minutes: "90" };

  it("accepts a valid record", () => expect(downtimeSchema.safeParse(downtime).success).toBe(true));
  it("rejects zero minutes", () => expect(downtimeSchema.safeParse({ ...downtime, minutes: "0" }).success).toBe(false));
  it("rejects negative minutes", () => expect(downtimeSchema.safeParse({ ...downtime, minutes: "-30" }).success).toBe(false));
  it("rejects fractional minutes", () => expect(downtimeSchema.safeParse({ ...downtime, minutes: "1.5" }).success).toBe(false));
  it("requires a reason", () => expect(downtimeSchema.safeParse({ ...downtime, reason: "" }).success).toBe(false));
});
