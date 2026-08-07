import { z } from "zod";

export const workerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the worker's full name.").max(160),
  employeeNumber: z.string().trim().max(80).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  employmentType: z.enum(["employee", "contractor", "casual"]),
  startDate: z.string().date().optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(160).optional(),
  emergencyContactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const attendanceStatuses = ["present", "absent", "late", "leave"] as const;

export const attendanceStatusSchema = z.enum(attendanceStatuses);

export const attendanceEntrySchema = z.object({
  workerId: z.string().uuid(),
  status: attendanceStatusSchema,
});

export const attendanceRosterSchema = z.object({
  date: z.string().date(),
  entries: z.array(attendanceEntrySchema).min(1, "Add at least one worker before saving attendance."),
});

export const workerStatuses = ["active", "inactive", "terminated"] as const;

export const workerStatusUpdateSchema = z.object({
  workerId: z.string().uuid(),
  status: z.enum(workerStatuses),
});

export const assignmentSchema = z
  .object({
    workerId: z.string().uuid(),
    assignmentName: z.string().trim().min(2, "Name the assignment.").max(160),
    startsOn: z.string().date(),
    endsOn: z.string().date().optional().or(z.literal("")),
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    message: "The assignment cannot end before it starts.",
    path: ["endsOn"],
  });

export const trainingSchema = z
  .object({
    workerId: z.string().uuid(),
    trainingName: z.string().trim().min(2, "Name the training.").max(160),
    completedOn: z.string().date(),
    expiresOn: z.string().date().optional().or(z.literal("")),
  })
  .refine((value) => !value.expiresOn || value.expiresOn >= value.completedOn, {
    message: "Training cannot expire before it was completed.",
    path: ["expiresOn"],
  });

export const ppeIssueSchema = z.object({
  workerId: z.string().uuid(),
  itemName: z.string().trim().min(2, "Name the PPE item.").max(160),
  quantity: z.coerce.number().positive("Issue a quantity greater than zero.").max(100_000),
  issuedOn: z.string().date(),
  notes: z.string().trim().max(2_000).optional(),
});
