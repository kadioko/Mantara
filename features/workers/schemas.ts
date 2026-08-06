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
