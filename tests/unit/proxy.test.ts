import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The proxy matches every path except static assets, so anything that must answer without a session
 * has to be named explicitly. Getting this wrong is silent: the request is redirected to /login,
 * which answers 200, so a caller expecting JSON gets a login page and calls it success.
 */
const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

describe("paths that answer without a session", () => {
  it("includes the health endpoint", () => {
    // An uptime monitor has no session and never will. Redirected to /login it would see a 200 and
    // report the service healthy while the database was unreachable.
    expect(proxy).toMatch(/publicPaths[\s\S]*"\/api\/health"/);
  });

  it("includes the authentication screens and the callback", () => {
    for (const path of ["/login", "/register", "/auth/callback"]) {
      expect(proxy, path).toContain(`"${path}"`);
    }
  });

  it("does not exempt the report export", () => {
    // Reports read tenant records and are gated on each module's read permission. A public export
    // route would hand them to anyone with the URL.
    expect(proxy).not.toContain("/reports/export");
  });
});
