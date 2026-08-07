import { z } from "zod";

export const fuelTypes = ["diesel", "petrol", "kerosene", "lubricant"] as const;

export const fuelTypeLabels: Record<(typeof fuelTypes)[number], string> = {
  diesel: "Diesel",
  petrol: "Petrol",
  kerosene: "Kerosene",
  lubricant: "Lubricant",
};

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const fuelLocationSchema = z.object({
  name: z.string().trim().min(2, "Name the fuel store.").max(120),
  fuelType: z.enum(fuelTypes),
  capacityLitres: z.preprocess(
    blankToUndefined,
    z.coerce.number().positive("Capacity must be greater than zero.").max(9_999_999).optional(),
  ),
  notes: z.string().trim().max(2_000).optional(),
});

export const fuelReceiptSchema = z.object({
  locationId: z.string().uuid(),
  litres: z.coerce.number().positive("Enter a delivery greater than zero litres.").max(9_999_999),
  supplier: z.string().trim().max(160).optional(),
  reference: z.string().trim().max(120).optional(),
  unitCost: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "Unit cost cannot be negative.").max(9_999_999).optional(),
  ),
  receivedOn: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});

export const fuelIssueSchema = z.object({
  locationId: z.string().uuid(),
  litres: z.coerce.number().positive("Enter an issue greater than zero litres.").max(9_999_999),
  equipmentId: z.string().uuid().optional().or(z.literal("")),
  workerId: z.string().uuid().optional().or(z.literal("")),
  equipmentMeter: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "A meter reading cannot be negative.").max(9_999_999).optional(),
  ),
  issuedOn: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});

export const fuelAdjustmentSchema = z.object({
  locationId: z.string().uuid(),
  litresDelta: z.coerce
    .number()
    .refine((value) => value !== 0, "An adjustment cannot be zero litres.")
    .min(-9_999_999)
    .max(9_999_999),
  reason: z.string().trim().min(2, "Give a reason for the adjustment.").max(200),
  adjustedOn: z.string().date(),
  notes: z.string().trim().max(500).optional(),
});
