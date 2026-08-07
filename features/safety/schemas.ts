import { z } from "zod";

export const incidentCategories = ["injury", "near_miss", "property_damage", "environmental", "security", "other"] as const;
export const incidentSeverities = ["low", "medium", "high", "critical"] as const;
export const incidentStatuses = ["reported", "investigating", "closed"] as const;
export const correctiveActionStatuses = ["open", "in_progress", "completed", "cancelled"] as const;

export const categoryLabels: Record<(typeof incidentCategories)[number], string> = {
  injury: "Injury",
  near_miss: "Near miss",
  property_damage: "Property damage",
  environmental: "Environmental",
  security: "Security",
  other: "Other",
};

export const severityLabels: Record<(typeof incidentSeverities)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const statusLabels: Record<(typeof incidentStatuses)[number], string> = {
  reported: "Reported",
  investigating: "Investigating",
  closed: "Closed",
};

export const actionStatusLabels: Record<(typeof correctiveActionStatuses)[number], string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const incidentSchema = z.object({
  title: z.string().trim().min(2, "Describe what happened.").max(160),
  reference: z.string().trim().max(80).optional(),
  category: z.enum(incidentCategories),
  severity: z.enum(incidentSeverities),
  occurredOn: z.string().date(),
  occurredTime: z.string().optional().or(z.literal("")),
  location: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(4_000).optional(),
  reportedByWorkerId: z.string().uuid().optional().or(z.literal("")),
  equipmentId: z.string().uuid().optional().or(z.literal("")),
  peopleInvolved: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0, "People involved cannot be negative.").max(10_000).optional(),
  ),
  lostTimeHours: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "Lost time cannot be negative.").max(100_000).optional(),
  ),
});

export const incidentStatusSchema = z.object({
  incidentId: z.string().uuid(),
  status: z.enum(incidentStatuses),
});

/** Personal and medical information. Every read and write of this goes through an audited function. */
export const sensitiveDetailsSchema = z.object({
  incidentId: z.string().uuid(),
  injuredWorkerId: z.string().uuid().optional().or(z.literal("")),
  injuryDescription: z.string().trim().max(2_000).optional(),
  medicalNotes: z.string().trim().max(2_000).optional(),
  personalDetails: z.string().trim().max(2_000).optional(),
});

export const inspectionSchema = z.object({
  title: z.string().trim().min(2, "Name the inspection.").max(160),
  area: z.string().trim().max(160).optional(),
  inspectedOn: z.string().date(),
  inspectorWorkerId: z.string().uuid().optional().or(z.literal("")),
  findings: z.string().trim().max(4_000).optional(),
  isSatisfactory: z.enum(["yes", "no", ""]).optional(),
});

export const correctiveActionSchema = z
  .object({
    incidentId: z.string().uuid().optional().or(z.literal("")),
    inspectionId: z.string().uuid().optional().or(z.literal("")),
    description: z.string().trim().min(2, "Describe the action.").max(300),
    assignedWorkerId: z.string().uuid().optional().or(z.literal("")),
    dueOn: z.string().date().optional().or(z.literal("")),
  })
  // The database requires the same link, so an action can always be traced to why it was raised.
  .refine((value) => Boolean(value.incidentId || value.inspectionId), {
    message: "Attach the action to an incident or an inspection.",
    path: ["incidentId"],
  });

export const correctiveActionStatusSchema = z.object({
  actionId: z.string().uuid(),
  status: z.enum(correctiveActionStatuses),
  notes: z.string().trim().max(500).optional(),
});
