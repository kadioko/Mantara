import { z } from "zod";

export const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  siteName: z.string().trim().min(2).max(120),
  country: z.string().trim().length(2).default("TZ"),
});
