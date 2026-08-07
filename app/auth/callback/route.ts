import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/dashboard", request.url));
  if (!code) return response;
  const env = publicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    // Turns any invitation addressed to this person into membership, so an invited colleague lands in
    // the organization that invited them rather than being asked to create one of their own.
    await supabase.rpc("accept_pending_invitations");
  }
  return response;
}
