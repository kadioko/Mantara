"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";

const uuidSchema = z.string().uuid();
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };

export async function setActiveOrganization(formData: FormData) {
  const organizationId = uuidSchema.safeParse(formData.get("organizationId"));
  if (!organizationId.success) redirect("/dashboard");
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("organization_memberships").select("id").eq("organization_id", organizationId.data).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!data) redirect("/dashboard");
  const cookieStore = await cookies();
  cookieStore.set("mantara-org-id", organizationId.data, cookieOptions);
  cookieStore.delete("mantara-site-id");
  redirect("/dashboard");
}

export async function setActiveSite(formData: FormData) {
  const siteId = uuidSchema.safeParse(formData.get("siteId"));
  const organizationId = uuidSchema.safeParse(formData.get("organizationId"));
  if (!siteId.success || !organizationId.success) redirect("/dashboard");
  const { supabase } = await requireUser();
  const { data } = await supabase.from("mine_sites").select("id").eq("id", siteId.data).eq("organization_id", organizationId.data).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (!data) redirect("/dashboard");
  const cookieStore = await cookies();
  cookieStore.set("mantara-site-id", siteId.data, cookieOptions);
  redirect("/dashboard");
}
