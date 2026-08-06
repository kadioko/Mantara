import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function currentMembership() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("organization_memberships")
    .select("organization_id, role:roles(code, name), organization:organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return { supabase, user, membership: data };
}
