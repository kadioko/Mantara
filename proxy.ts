import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { publicEnv } from "@/lib/env";
import { contentSecurityPolicy, createNonce, securityHeaders } from "@/lib/security/headers";

/**
 * Paths that must answer without a session.
 *
 * `/api/health` is here because an uptime monitor has no session and never will. Without it the
 * probe was redirected to /login, which answers 200 — so the monitor would have reported the service
 * healthy while the database was unreachable. A monitor that lies is worse than no monitor, and this
 * was live for several commits before anything caught it.
 *
 * `/api/csp-report` is here for the same shape of reason: the browser posts a violation report with
 * no credentials, and a report redirected to a login page is a report nobody ever sees.
 *
 * `/manifest.webmanifest` is linked from the head of every page including /login, and browsers
 * fetch it without credentials. It was answering a 307 to a login page, so installing the app was
 * broken on the one screen where somebody would try. It holds the product name, the brand colour
 * and an icon — nothing that belongs to a tenant.
 *
 * Nothing else under /api belongs here. The report export is deliberately authenticated.
 */
const publicPaths = new Set([
  "/login", "/register", "/auth/callback",
  "/api/health", "/api/csp-report", "/manifest.webmanifest",
]);

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const options = {
    nonce,
    supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    isProduction: process.env.NODE_ENV === "production",
  };

  // Sent inward so the renderer can find the nonce; the browser is sent the report-only copy below.
  const { response, supabase } = updateSession(request, {
    "content-security-policy": contentSecurityPolicy(options),
  });

  /**
   * Applied to every response this function can return, including the redirects.
   *
   * The redirect is the one that gets forgotten, and it is a real response an attacker can cause:
   * a signed-out visitor lands on a bare 307 with no policy on it. Naming the function once and
   * calling it on each branch is what stops the next person adding a branch that forgets.
   */
  const secured = <T extends Response>(target: T) => {
    for (const [name, value] of Object.entries(securityHeaders(options))) target.headers.set(name, value);
    return target;
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !publicPaths.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return secured(NextResponse.redirect(url));
  }
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/register")) {
    return secured(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  return secured(response);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
