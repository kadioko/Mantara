import { z } from "zod";

export const organizationSuspensionSchema = z
  .object({
    organizationId: z.string().uuid(),
    suspend: z.enum(["true", "false"]).transform((value) => value === "true"),
    reason: z.string().trim().max(300).optional(),
  })
  // Suspending an organization stops its people working, so the record must say why.
  .refine((value) => !value.suspend || (value.reason?.length ?? 0) >= 4, {
    message: "Give a reason when suspending an organization.",
    path: ["reason"],
  });

export const grantAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the administrator's email address."),
  note: z.string().trim().max(200).optional(),
});

export const revokeAdminSchema = z.object({
  userId: z.string().uuid(),
});
