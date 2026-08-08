import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Paths that must answer without a session.
 *
 * `/api/health` is here because an uptime monitor has no session and never will. Without it the
 * probe was redirected to /login, which answers 200 — so the monitor would have reported the service
 * healthy while the database was unreachable. A monitor that lies is worse than no monitor, and this
 * was live for several commits before anything caught it.
 *
 * Nothing else under /api belongs here. The report export is deliberately authenticated.
 */
const publicPaths = new Set(["/login", "/register", "/auth/callback", "/api/health"]);

export async function proxy(request: NextRequest) {
  const { response, supabase } = updateSession(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !publicPaths.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
