import { z } from "zod";

export const maintenancePriorities = ["low", "medium", "high", "critical"] as const;
export const requestStatuses = ["open", "planned", "closed", "cancelled"] as const;
export const workOrderStatuses = ["planned", "in_progress", "on_hold", "completed", "cancelled"] as const;
export const costTypes = ["labour", "parts", "contractor", "other"] as const;

export const priorityLabels: Record<(typeof maintenancePriorities)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const workOrderStatusLabels: Record<(typeof workOrderStatuses)[number], string> = {
  planned: "Planned",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const requestStatusLabels: Record<(typeof requestStatuses)[number], string> = {
  open: "Open",
  planned: "Planned",
  closed: "Closed",
  cancelled: "Cancelled",
};

/**
 * Mirrors validate_work_order_transition() in 0006_maintenance.sql. `completed` is deliberately absent:
 * completion goes through complete_work_order() so the meter and service schedule are rolled forward.
 */
export const allowedWorkOrderTransitions: Record<(typeof workOrderStatuses)[number], string[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["on_hold", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export const costTypeLabels: Record<(typeof costTypes)[number], string> = {
  labour: "Labour",
  parts: "Parts",
  contractor: "Contractor",
  other: "Other",
};

/** FormData sends empty fields as "", which `z.coerce.number()` would silently turn into 0. */
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const maintenanceRequestSchema = z.object({
  equipmentId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(2, "Describe what needs attention.").max(160),
  description: z.string().trim().max(2_000).optional(),
  priority: z.enum(maintenancePriorities),
  reportedByWorkerId: z.string().uuid().optional().or(z.literal("")),
  reportedOn: z.string().date(),
});

export const workOrderSchema = z.object({
  requestId: z.string().uuid().optional().or(z.literal("")),
  equipmentId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(2, "Name the work order.").max(160),
  description: z.string().trim().max(2_000).optional(),
  priority: z.enum(maintenancePriorities),
  assignedWorkerId: z.string().uuid().optional().or(z.literal("")),
  scheduledFor: z.string().date().optional().or(z.literal("")),
});

export const workOrderStatusSchema = z.object({
  workOrderId: z.string().uuid(),
  status: z.enum(workOrderStatuses),
});

export const workOrderCompletionSchema = z.object({
  workOrderId: z.string().uuid(),
  meterAtService: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "A meter reading cannot be negative.").max(9_999_999).optional(),
  ),
  notes: z.string().trim().max(2_000).optional(),
});

export const maintenancePartSchema = z.object({
  workOrderId: z.string().uuid(),
  partName: z.string().trim().min(2, "Name the part.").max(160),
  quantity: z.coerce.number().positive("Use a quantity greater than zero.").max(9_999_999),
  unitCost: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "Unit cost cannot be negative.").max(9_999_999).optional(),
  ),
  notes: z.string().trim().max(500).optional(),
});

export const maintenanceCostSchema = z.object({
  workOrderId: z.string().uuid(),
  costType: z.enum(costTypes),
  amount: z.coerce.number().min(0, "A cost cannot be negative.").max(999_999_999),
  description: z.string().trim().max(500).optional(),
  incurredOn: z.string().date(),
});

export const maintenanceScheduleSchema = z
  .object({
    equipmentId: z.string().uuid(),
    name: z.string().trim().min(2, "Name the service schedule.").max(160),
    intervalMeter: z.preprocess(
      blankToUndefined,
      z.coerce.number().positive("A meter interval must be greater than zero.").max(9_999_999).optional(),
    ),
    intervalDays: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().positive("A day interval must be greater than zero.").max(3_650).optional(),
    ),
    nextDueOn: z.string().date().optional().or(z.literal("")),
    notes: z.string().trim().max(500).optional(),
  })
  // A schedule with neither interval can never come due; the database rejects it too.
  .refine((value) => value.intervalMeter !== undefined || value.intervalDays !== undefined, {
    message: "Set a meter interval, a day interval, or both.",
    path: ["intervalDays"],
  });
