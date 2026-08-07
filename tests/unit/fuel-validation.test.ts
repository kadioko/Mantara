import { describe, expect, it } from "vitest";
import {
  fuelAdjustmentSchema,
  fuelIssueSchema,
  fuelLocationSchema,
  fuelReceiptSchema,
} from "@/features/fuel/schemas";

const locationId = "55555555-5555-4555-8555-555555555555";
const equipmentId = "66666666-6666-4666-8666-666666666666";

describe("fuel store validation", () => {
  const location = { name: "Main diesel tank", fuelType: "diesel" };

  it("accepts a minimal store", () => expect(fuelLocationSchema.safeParse(location).success).toBe(true));
  it("rejects an unknown fuel type", () => expect(fuelLocationSchema.safeParse({ ...location, fuelType: "hydrogen" }).success).toBe(false));
  it("rejects a zero capacity", () => expect(fuelLocationSchema.safeParse({ ...location, capacityLitres: "0" }).success).toBe(false));

  it("treats a blank capacity as absent rather than zero", () => {
    const parsed = fuelLocationSchema.safeParse({ ...location, capacityLitres: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.capacityLitres).toBeUndefined();
  });
});

describe("fuel receipt validation", () => {
  const receipt = { locationId, litres: "500", receivedOn: "2026-08-07" };

  it("accepts a valid delivery", () => expect(fuelReceiptSchema.safeParse(receipt).success).toBe(true));
  it("rejects zero litres", () => expect(fuelReceiptSchema.safeParse({ ...receipt, litres: "0" }).success).toBe(false));
  it("rejects negative litres", () => expect(fuelReceiptSchema.safeParse({ ...receipt, litres: "-10" }).success).toBe(false));

  it("treats a blank unit cost as absent rather than zero", () => {
    const parsed = fuelReceiptSchema.safeParse({ ...receipt, unitCost: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.unitCost).toBeUndefined();
  });
});

describe("fuel issue validation", () => {
  const issue = { locationId, litres: "80", issuedOn: "2026-08-07" };

  it("accepts a valid issue", () => expect(fuelIssueSchema.safeParse(issue).success).toBe(true));
  it("accepts an issue against equipment", () => expect(fuelIssueSchema.safeParse({ ...issue, equipmentId }).success).toBe(true));
  it("accepts a blank equipment reference", () => expect(fuelIssueSchema.safeParse({ ...issue, equipmentId: "" }).success).toBe(true));
  it("rejects zero litres", () => expect(fuelIssueSchema.safeParse({ ...issue, litres: "0" }).success).toBe(false));
  it("rejects a non-uuid store", () => expect(fuelIssueSchema.safeParse({ ...issue, locationId: "nope" }).success).toBe(false));

  it("treats a blank equipment meter as absent rather than zero", () => {
    const parsed = fuelIssueSchema.safeParse({ ...issue, equipmentMeter: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.equipmentMeter).toBeUndefined();
  });
});

describe("fuel adjustment validation", () => {
  const adjustment = { locationId, litresDelta: "-25", reason: "Stock take variance", adjustedOn: "2026-08-07" };

  it("accepts a negative correction", () => expect(fuelAdjustmentSchema.safeParse(adjustment).success).toBe(true));
  it("accepts a positive correction", () => expect(fuelAdjustmentSchema.safeParse({ ...adjustment, litresDelta: "25" }).success).toBe(true));
  it("rejects a zero adjustment", () => expect(fuelAdjustmentSchema.safeParse({ ...adjustment, litresDelta: "0" }).success).toBe(false));
  it("requires a reason", () => expect(fuelAdjustmentSchema.safeParse({ ...adjustment, reason: "" }).success).toBe(false));
});
