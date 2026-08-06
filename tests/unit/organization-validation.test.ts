import { describe, expect, it } from "vitest";
import { onboardingSchema } from "@/features/organizations/schemas";

describe("organization onboarding validation", () => {
  it("accepts a valid first organization and mine site", () => {
    expect(onboardingSchema.safeParse({ organizationName: "Mantara Mining", siteName: "North Pit", country: "TZ" }).success).toBe(true);
  });

  it("rejects blank operational names", () => {
    expect(onboardingSchema.safeParse({ organizationName: "", siteName: "", country: "TZ" }).success).toBe(false);
  });
});
