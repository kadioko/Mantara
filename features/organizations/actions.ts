"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "./schemas";

export type OnboardingState = { error?: string };

export async function createOrganization(_: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter an organization name and your first mine site." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization_with_owner", {
    organization_name: parsed.data.organizationName,
    initial_site_name: parsed.data.siteName,
    initial_site_country: parsed.data.country.toUpperCase(),
  });
  if (error || !data) return { error: "We could not create the organization. Please try again." };
  redirect("/dashboard");
}
