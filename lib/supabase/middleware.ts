import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Refreshes the session and hands back the response the proxy should return.
 *
 * `extraRequestHeaders` are added to the request the renderer sees, not to the response. That is how
 * the CSP nonce reaches Next.js: it reads `content-security-policy` off the incoming request and
 * stamps the nonce onto the script tags it generates. Nothing else in the product reads it.
 *
 * The headers are rebuilt from the request on each call rather than snapshotted once, because
 * `request.cookies.set` writes through to the request's own cookie header — a refreshed session
 * carried on a stale copy would be silently dropped, and the user would be signed out on the next
 * request for no visible reason.
 */
export function updateSession(request: NextRequest, extraRequestHeaders: Record<string, string> = {}) {
  const forwarded = () => {
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(extraRequestHeaders)) headers.set(name, value);
    return headers;
  };

  let response = NextResponse.next({ request: { headers: forwarded() } });
  const env = publicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: forwarded() } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  return { response, supabase };
}
