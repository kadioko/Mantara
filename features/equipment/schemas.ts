import { z } from "zod";

export const equipmentCategories = [
  "excavator",
  "loader",
  "haul_truck",
  "drill",
  "crusher",
  "generator",
  "pump",
  "light_vehicle",
  "other",
] as const;

export const equipmentStatuses = ["operational", "standby", "maintenance", "breakdown", "retired"] as const;
export const meterTypes = ["hours", "kilometres"] as const;

export const categoryLabels: Record<(typeof equipmentCategories)[number], string> = {
  excavator: "Excavator",
  loader: "Loader",
  haul_truck: "Haul truck",
  drill: "Drill",
  crusher: "Crusher",
  generator: "Generator",
  pump: "Pump",
  light_vehicle: "Light vehicle",
  other: "Other",
};

export const statusLabels: Record<(typeof equipmentStatuses)[number], string> = {
  operational: "Operational",
  standby: "Standby",
  maintenance: "In maintenance",
  breakdown: "Breakdown",
  retired: "Retired",
};

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const equipmentSchema = z.object({
  name: z.string().trim().min(2, "Name the equipment.").max(160),
  assetCode: z.string().trim().max(80).optional(),
  category: z.enum(equipmentCategories),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  yearOfManufacture: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1900, "Enter a year from 1900 onwards.").max(2100).optional(),
  ),
  meterType: z.enum(meterTypes),
  currentMeter: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "A meter reading cannot be negative.").max(9_999_999).optional(),
  ),
  acquiredOn: z.string().date().optional().or(z.literal("")),
  notes: z.string().trim().max(2_000).optional(),
});

export const meterReadingSchema = z.object({
  equipmentId: z.string().uuid(),
  reading: z.coerce.number().min(0, "A meter reading cannot be negative.").max(9_999_999),
  readingOn: z.string().date().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

export const equipmentStatusUpdateSchema = z.object({
  equipmentId: z.string().uuid(),
  status: z.enum(equipmentStatuses),
  reason: z.string().trim().max(500).optional(),
});

export const equipmentAssignmentSchema = z
  .object({
    equipmentId: z.string().uuid(),
    workerId: z.string().uuid().optional().or(z.literal("")),
    assignmentName: z.string().trim().min(2, "Name the assignment.").max(160),
    startsOn: z.string().date(),
    endsOn: z.string().date().optional().or(z.literal("")),
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    message: "The assignment cannot end before it starts.",
    path: ["endsOn"],
  });
