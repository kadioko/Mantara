import { z } from "zod";

export const licenceStatuses = ["active", "pending", "suspended", "surrendered", "expired"] as const;
export const recurrenceIntervals = ["none", "monthly", "quarterly", "annual"] as const;
export const complianceTaskStatuses = ["open", "in_progress", "completed", "cancelled"] as const;

export const licenceStatusLabels: Record<(typeof licenceStatuses)[number], string> = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
  surrendered: "Surrendered",
  expired: "Expired",
};

export const recurrenceLabels: Record<(typeof recurrenceIntervals)[number], string> = {
  none: "One off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export const taskStatusLabels: Record<(typeof complianceTaskStatuses)[number], string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const licenceSchema = z
  .object({
    licenceNumber: z.string().trim().min(1, "Enter the licence number.").max(120),
    licenceType: z.string().trim().min(2, "Describe the licence type.").max(120),
    issuingAuthority: z.string().trim().max(160).optional(),
    holderName: z.string().trim().max(160).optional(),
    issuedOn: z.string().date().optional().or(z.literal("")),
    expiresOn: z.string().date().optional().or(z.literal("")),
    status: z.enum(licenceStatuses),
    siteScoped: z.coerce.boolean().optional(),
    notes: z.string().trim().max(2_000).optional(),
  })
  .refine((value) => !value.issuedOn || !value.expiresOn || value.expiresOn >= value.issuedOn, {
    message: "A licence cannot expire before it was issued.",
    path: ["expiresOn"],
  });

export const requirementSchema = z.object({
  name: z.string().trim().min(2, "Name the requirement.").max(160),
  description: z.string().trim().max(2_000).optional(),
  category: z.string().trim().max(120).optional(),
  recurrence: z.enum(recurrenceIntervals),
});

export const complianceTaskSchema = z.object({
  requirementId: z.string().uuid().optional().or(z.literal("")),
  licenceId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(2, "Name the task.").max(160),
  details: z.string().trim().max(2_000).optional(),
  dueOn: z.string().date(),
  assignedWorkerId: z.string().uuid().optional().or(z.literal("")),
  siteScoped: z.coerce.boolean().optional(),
});

export const completeTaskSchema = z.object({
  taskId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
  completedOn: z.string().date(),
});
