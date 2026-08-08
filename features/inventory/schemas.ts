import { z } from "zod";

export const stockMovementReasons = ["purchase", "consumption", "transfer", "correction", "loss", "return"] as const;

export const reasonLabels: Record<(typeof stockMovementReasons)[number], string> = {
  purchase: "Purchase",
  consumption: "Consumption",
  transfer: "Transfer",
  correction: "Correction",
  loss: "Loss",
  return: "Return",
};

export const issueReasons = ["consumption", "loss", "return"] as const;
export const adjustmentReasons = ["correction", "loss", "return"] as const;

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(2, "Name the item.").max(160),
  sku: z.string().trim().max(80).optional(),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  unit: z.string().trim().min(1).max(20),
  reorderLevel: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "A reorder level cannot be negative.").max(9_999_999).optional(),
  ),
  notes: z.string().trim().max(2_000).optional(),
});

export const inventoryCategorySchema = z.object({
  name: z.string().trim().min(2, "Name the category.").max(120),
});

export const inventoryLocationSchema = z.object({
  name: z.string().trim().min(2, "Name the store.").max(120),
  notes: z.string().trim().max(500).optional(),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Name the supplier.").max(160),
  contactName: z.string().trim().max(160).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).email("Enter a valid email address.").optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

const withId = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.extend({ id: z.string().uuid() });

export const inventoryItemEditSchema = withId(inventoryItemSchema);
export const inventoryCategoryEditSchema = withId(inventoryCategorySchema);
export const inventoryLocationEditSchema = withId(inventoryLocationSchema);
export const supplierEditSchema = withId(supplierSchema);

/** Retiring and restoring share one shape; the action decides which way it goes. */
export const catalogueStatusSchema = z.object({
  id: z.string().uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const stockReceiptSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  supplierId: z.string().uuid().optional().or(z.literal("")),
  quantity: z.coerce.number().positive("Enter a quantity greater than zero.").max(9_999_999),
  unitCost: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "Unit cost cannot be negative.").max(9_999_999).optional(),
  ),
  reference: z.string().trim().max(120).optional(),
  receivedOn: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});

export const stockIssueSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  workOrderId: z.string().uuid().optional().or(z.literal("")),
  equipmentId: z.string().uuid().optional().or(z.literal("")),
  workerId: z.string().uuid().optional().or(z.literal("")),
  quantity: z.coerce.number().positive("Enter a quantity greater than zero.").max(9_999_999),
  reason: z.enum(issueReasons),
  issuedOn: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});

export const stockTransferSchema = z
  .object({
    itemId: z.string().uuid(),
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
    quantity: z.coerce.number().positive("Enter a quantity greater than zero.").max(9_999_999),
    transferredOn: z.string().date(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.fromLocationId !== value.toLocationId, {
    message: "Choose two different stores.",
    path: ["toLocationId"],
  });

export const stockAdjustmentSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantityDelta: z.coerce
    .number()
    .refine((value) => value !== 0, "An adjustment cannot be zero.")
    .min(-9_999_999)
    .max(9_999_999),
  reason: z.enum(adjustmentReasons),
  explanation: z.string().trim().min(2, "Explain the adjustment.").max(200),
  adjustedOn: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});

/** Opens a count session for one store. Lines are added to it afterwards. */
export const stockCountSchema = z.object({
  locationId: z.string().uuid(),
  reference: z.string().trim().max(120).optional(),
  countedOn: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});

/**
 * One counted item.
 *
 * There is no field for the book quantity or the variance. Both are established by the database when
 * the count is applied — reading the book figure at entry time would turn an issue made later the
 * same afternoon into a phantom shortfall.
 */
export const stockCountLineSchema = z.object({
  stockCountId: z.string().uuid(),
  itemId: z.string().uuid(),
  countedQuantity: z.coerce.number().min(0, "A counted quantity cannot be negative.").max(9_999_999),
  notes: z.string().trim().max(200).optional(),
});

export const applyStockCountSchema = z.object({ stockCountId: z.string().uuid() });
