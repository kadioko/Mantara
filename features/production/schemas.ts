import { z } from "zod";

export const shiftStatuses = ["planned", "active", "closed"] as const;
export const productionStatuses = ["draft", "submitted", "approved", "rejected"] as const;
export const approvalDecisions = ["approved", "rejected"] as const;

export const productionStatusLabels: Record<(typeof productionStatuses)[number], string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
};

export const shiftStatusLabels: Record<(typeof shiftStatuses)[number], string> = {
  planned: "Planned",
  active: "Active",
  closed: "Closed",
};

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const shiftSchema = z
  .object({
    name: z.string().trim().min(2, "Name the shift.").max(80),
    shiftDate: z.string().date(),
    startsAt: z.string().optional().or(z.literal("")),
    endsAt: z.string().optional().or(z.literal("")),
    supervisorWorkerId: z.string().uuid().optional().or(z.literal("")),
    notes: z.string().trim().max(2_000).optional(),
  })
  .refine((value) => !value.startsAt || !value.endsAt || value.endsAt >= value.startsAt, {
    message: "The shift cannot end before it starts.",
    path: ["endsAt"],
  });

export const productionEntrySchema = z.object({
  shiftId: z.string().uuid().optional().or(z.literal("")),
  entryDate: z.string().date(),
  material: z.string().trim().min(2, "Name the material produced.").max(120),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative.").max(9_999_999),
  unit: z.string().trim().min(1).max(20),
  grade: z.preprocess(blankToUndefined, z.coerce.number().min(0, "Grade cannot be negative.").max(1_000_000).optional()),
  location: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const productionReviewSchema = z.object({
  entryId: z.string().uuid(),
  decision: z.enum(approvalDecisions),
  notes: z.string().trim().max(500).optional(),
});

export const productionSubmitSchema = z.object({
  entryId: z.string().uuid(),
});

export const downtimeSchema = z.object({
  shiftId: z.string().uuid().optional().or(z.literal("")),
  equipmentId: z.string().uuid().optional().or(z.literal("")),
  reason: z.string().trim().min(2, "Describe the downtime reason.").max(200),
  minutes: z.coerce.number().int().positive("Downtime must be greater than zero minutes.").max(44_640),
  notes: z.string().trim().max(2_000).optional(),
});
