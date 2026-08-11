import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baselineHeaders, contentSecurityPolicy, createNonce, cspReportPath } from "@/lib/security/headers";

const supabaseUrl = "https://abcdefgh.supabase.co";

/**
 * The proxy calls the real Supabase middleware, which makes a network request to refresh the
 * session. That is not what these tests are about, so it is replaced.
 *
 * `vi.hoisted` because `vi.mock` is lifted above everything else in the file, so a plain `let` here
 * would not exist yet when the replacement runs.
 */
const session = vi.hoisted(() => ({ signedIn: false }));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: () => ({
    response: new Response(null, { headers: { "x-passed-through": "yes" } }),
    supabase: { auth: { getUser: async () => ({ data: { user: session.signedIn ? { id: "u1" } : null } }) } },
  }),
}));

const policy = (overrides: Partial<Parameters<typeof contentSecurityPolicy>[0]> = {}) =>
  contentSecurityPolicy({ nonce: "test-nonce", supabaseUrl, isProduction: false, ...overrides });

/** The directives, split out so a test can say what a single one contains. */
const directive = (name: string, source = policy()) =>
  source.split("; ").find((part) => part === name || part.startsWith(`${name} `));

describe("what the policy allows", () => {
  it("carries the nonce and refuses to trust same-origin scripts on their own", () => {
    // Without 'strict-dynamic', `'self'` readmits every same-origin URL and the nonce decides
    // nothing. The whole value of the nonce is that an injected <script src="/x"> is refused even
    // though it came from our own host.
    expect(directive("script-src")).toContain("'nonce-test-nonce'");
    expect(directive("script-src")).toContain("'strict-dynamic'");
  });

  it("never allows an inline script", () => {
    expect(policy()).not.toContain("'unsafe-inline' 'strict-dynamic'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
  });

  it("lets the browser reach Supabase, over both http and the socket", () => {
    // The Supabase client runs in the page. Miss this and the product does not load at all: no
    // sign-in, no queries, no uploads — and the failure is a console message, not an error screen.
    expect(directive("connect-src")).toContain("https://abcdefgh.supabase.co");
    expect(directive("connect-src")).toContain("wss://abcdefgh.supabase.co");
  });

  it("reads the Supabase host from configuration rather than hard-coding one", () => {
    const other = policy({ supabaseUrl: "https://zyxwvuts.supabase.co" });
    expect(other).toContain("https://zyxwvuts.supabase.co");
    expect(other).not.toContain("abcdefgh");
  });

  it("still produces a usable policy when the URL is unreadable", () => {
    // publicEnv() validates the URL, so this should be unreachable. If it ever is reached, a policy
    // missing one origin is a recoverable annoyance; a thrown error in the proxy is every page down.
    expect(() => policy({ supabaseUrl: "not-a-url" })).not.toThrow();
    expect(directive("default-src", policy({ supabaseUrl: "not-a-url" }))).toBe("default-src 'self'");
  });

  it("closes both framing directions", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("frame-src")).toBe("frame-src 'none'");
  });

  it("pins where a form may post and what a base tag may claim", () => {
    // Both are how an injected tag redirects an authenticated request somewhere else.
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
  });

  it("names a place to send violations in both syntaxes", () => {
    // Firefox implements report-uri, Chrome implements report-to. One of them means hearing from
    // half the browsers, which reads as a quiet policy rather than an unheard one.
    expect(directive("report-uri")).toBe(`report-uri ${cspReportPath}`);
    expect(directive("report-to")).toBe("report-to mantara-csp");
  });

  it("only upgrades insecure requests in production", () => {
    // On a local http server this directive rewrites every request to https and nothing answers.
    expect(policy({ isProduction: true })).toContain("upgrade-insecure-requests");
    expect(policy({ isProduction: false })).not.toContain("upgrade-insecure-requests");
  });
});

describe("the headers that ship enforcing", () => {
  const headers = (isProduction = false) => baselineHeaders({ isProduction });

  it("stops a browser guessing what the CSV export is", () => {
    // text/csv full of text an operator typed, served from our own origin. A browser that sniffed
    // it as HTML would run it with the session attached.
    expect(headers()["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("agrees with the policy about framing", () => {
    // Two headers saying the same thing to different readers. If they ever disagree, the weaker one
    // is what an old webview obeys.
    expect(headers()["X-Frame-Options"]).toBe("DENY");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("sends no referrer to another site at all", () => {
    // Not strict-origin-when-cross-origin: a URL here names a record, and the mere fact that a
    // particular record was open is not something an external site should be told.
    expect(headers()["Referrer-Policy"]).toBe("same-origin");
  });

  it("denies the hardware the product has never asked for", () => {
    const permissions = headers()["Permissions-Policy"];
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(permissions, feature).toContain(`${feature}=()`);
    }
  });

  it("asks for HTTPS only where HTTPS exists", () => {
    expect(headers(true)["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(headers(false)["Strict-Transport-Security"]).toBeUndefined();
  });

  it("does not ask to be preloaded", () => {
    // Preloading is a one-way door: it is granted by browser vendors, slow to undo, and it applies
    // to every subdomain of the registered domain including ones this project does not control.
    expect(headers(true)["Strict-Transport-Security"]).not.toContain("preload");
  });
});

describe("the nonce", () => {
  it("is different every time", () => {
    // A fixed nonce is worth exactly nothing: an injected script can read it off the page.
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
  });

  it("contains nothing that would end the directive early", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(createNonce()).not.toMatch(/['";]/);
    }
  });
});

describe("what the proxy actually sends", () => {
  // The existing proxy test reads proxy.ts as text, which cannot tell whether a header is attached
  // to a real response. This runs the function.
  const run = async (path: string) => {
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    return proxy(new NextRequest(new Request(`https://mantara.example${path}`)));
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
    session.signedIn = false;
  });

  afterEach(() => { vi.resetModules(); });

  it("puts them on an ordinary page", async () => {
    session.signedIn = true;
    const response = await run("/dashboard");
    expect(response.headers.get("x-passed-through")).toBe("yes");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("frame-ancestors 'none'");
  });

  it("puts them on the redirect to the login screen", async () => {
    // The branch that gets forgotten, and the one an attacker can reach without a session: a bare
    // 307 carrying no policy at all.
    const response = await run("/production");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("script-src");
  });

  it("puts them on the redirect away from the login screen", async () => {
    session.signedIn = true;
    const response = await run("/login");
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin");
  });

  it("sends the policy report-only, so a mistake in it cannot take the product down", async () => {
    session.signedIn = true;
    const response = await run("/dashboard");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeTruthy();
  });

  it("gives each response its own nonce", async () => {
    session.signedIn = true;
    const first = (await run("/dashboard")).headers.get("Content-Security-Policy-Report-Only");
    const second = (await run("/dashboard")).headers.get("Content-Security-Policy-Report-Only");
    expect(first).not.toBe(second);
  });

  it("lets the violation report through without a session", async () => {
    // A blocked page reports with no credentials. Redirected to /login, the report is never seen and
    // the collector looks healthy because it is being asked for nothing.
    const response = await run(cspReportPath);
    expect(response.status).not.toBe(307);
  });

  it("lets the web manifest through without a session", async () => {
    // Linked from the head of /login itself and fetched without credentials. It was answering a 307
    // to a login page, so installing the app failed on the only screen a signed-out visitor sees.
    const response = await run("/manifest.webmanifest");
    expect(response.status).not.toBe(307);
  });
});

describe("allowances that are declared but never spent", () => {
  /**
   * `document.upload` sat in the table for weeks with nothing calling it. Nothing failed, nothing
   * was logged, and the rate-limit tests all passed — they exercise the database function, which
   * works perfectly and was being asked nothing. An allowance nobody consumes is a comment.
   */
  const source = () => {
    const skip = new Set(["node_modules", ".next", ".git", ".claude", "supabase", "tests"]);
    const parts: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (skip.has(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(full) && !full.includes("rate-limit")) parts.push(readFileSync(full, "utf8"));
      }
    };
    walk(process.cwd());
    return parts.join("\n");
  };

  it("has none", async () => {
    const { rateLimits } = await import("@/lib/auth/rate-limit");
    const code = source();
    for (const bucket of Object.keys(rateLimits)) {
      expect(code, `${bucket} is declared but nothing consumes it`).toContain(`withinRateLimit("${bucket}")`);
    }
  });
});
