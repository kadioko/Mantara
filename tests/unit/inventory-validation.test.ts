import { describe, expect, it } from "vitest";
import {
  inventoryItemSchema,
  stockAdjustmentSchema,
  stockIssueSchema,
  stockReceiptSchema,
  stockTransferSchema,
  supplierSchema,
} from "@/features/inventory/schemas";

const itemId = "99999999-9999-4999-8999-999999999999";
const storeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const storeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("inventory item validation", () => {
  const item = { name: "Hydraulic hose", unit: "each" };

  it("accepts a minimal item", () => expect(inventoryItemSchema.safeParse(item).success).toBe(true));
  it("requires a name", () => expect(inventoryItemSchema.safeParse({ ...item, name: "" }).success).toBe(false));
  it("requires a unit", () => expect(inventoryItemSchema.safeParse({ ...item, unit: "" }).success).toBe(false));

  it("treats a blank reorder level as absent rather than zero", () => {
    const parsed = inventoryItemSchema.safeParse({ ...item, reorderLevel: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.reorderLevel).toBeUndefined();
  });

  it("keeps a genuine zero reorder level", () => {
    const parsed = inventoryItemSchema.safeParse({ ...item, reorderLevel: "0" });
    expect(parsed.success && parsed.data.reorderLevel).toBe(0);
  });
});

describe("supplier validation", () => {
  const supplier = { name: "Acme Supplies" };

  it("accepts a minimal supplier", () => expect(supplierSchema.safeParse(supplier).success).toBe(true));
  it("accepts a blank email", () => expect(supplierSchema.safeParse({ ...supplier, email: "" }).success).toBe(true));
  it("rejects a malformed email", () => expect(supplierSchema.safeParse({ ...supplier, email: "not-an-email" }).success).toBe(false));
});

describe("stock receipt validation", () => {
  const receipt = { itemId, locationId: storeA, quantity: "10", receivedOn: "2026-08-07" };

  it("accepts a valid receipt", () => expect(stockReceiptSchema.safeParse(receipt).success).toBe(true));
  it("rejects zero quantity", () => expect(stockReceiptSchema.safeParse({ ...receipt, quantity: "0" }).success).toBe(false));
  it("rejects negative quantity", () => expect(stockReceiptSchema.safeParse({ ...receipt, quantity: "-5" }).success).toBe(false));
});

describe("stock issue validation", () => {
  const issue = { itemId, locationId: storeA, quantity: "3", reason: "consumption", issuedOn: "2026-08-07" };

  it("accepts a valid issue", () => expect(stockIssueSchema.safeParse(issue).success).toBe(true));
  it("accepts blank optional references", () => expect(stockIssueSchema.safeParse({ ...issue, workOrderId: "", equipmentId: "", workerId: "" }).success).toBe(true));
  it("rejects zero quantity", () => expect(stockIssueSchema.safeParse({ ...issue, quantity: "0" }).success).toBe(false));
  it("rejects a reason that is not an issue reason", () => expect(stockIssueSchema.safeParse({ ...issue, reason: "purchase" }).success).toBe(false));
});

describe("stock transfer validation", () => {
  const transfer = { itemId, fromLocationId: storeA, toLocationId: storeB, quantity: "5", transferredOn: "2026-08-07" };

  it("accepts a valid transfer", () => expect(stockTransferSchema.safeParse(transfer).success).toBe(true));

  // The database rejects this too, via a check constraint and a guard in the function.
  it("rejects a transfer to the same store", () =>
    expect(stockTransferSchema.safeParse({ ...transfer, toLocationId: storeA }).success).toBe(false));

  it("rejects zero quantity", () => expect(stockTransferSchema.safeParse({ ...transfer, quantity: "0" }).success).toBe(false));
});

describe("stock adjustment validation", () => {
  const adjustment = { itemId, locationId: storeA, quantityDelta: "-2", reason: "correction", explanation: "Stock take", adjustedOn: "2026-08-07" };

  it("accepts a negative correction", () => expect(stockAdjustmentSchema.safeParse(adjustment).success).toBe(true));
  it("accepts a positive correction", () => expect(stockAdjustmentSchema.safeParse({ ...adjustment, quantityDelta: "2" }).success).toBe(true));
  it("rejects a zero adjustment", () => expect(stockAdjustmentSchema.safeParse({ ...adjustment, quantityDelta: "0" }).success).toBe(false));
  it("requires an explanation", () => expect(stockAdjustmentSchema.safeParse({ ...adjustment, explanation: "" }).success).toBe(false));
});
