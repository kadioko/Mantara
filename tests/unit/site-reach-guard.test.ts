import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `SECURITY DEFINER` function that reports on one mine site must check the caller may reach it.
 *
 * `SECURITY DEFINER` bypasses row-level security by design, so the restrictive site policies added
 * by `0028` do not apply inside one. Eleven functions were written without that check and every
 * headline figure in the product was readable for a site the caller was explicitly restricted from:
 * a member limited to Pit One could not list Pit Two's rows, and could ask `production_totals` for
 * its tonnage and be told. `0039` fixed them in one place.
 *
 * This is the part that stops it happening again. A new reporting function is exactly the kind of
 * thing that gets added later, by someone who has read that permissions are checked and reasonably
 * assumes that is the whole story — permission was never what was missing here. Reach was.
 */

const migrations = () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
};

/**
 * Two functions take a site id, are SECURITY DEFINER, and legitimately do not ask about reach.
 *
 * `may_reach_site` is the check itself. `apply_fuel_movement` is an internal helper revoked from
 * `anon` and `authenticated` alike, so no client can reach it at all — the callers that use it are
 * themselves guarded. `set_member_sites` assigns restrictions rather than reading through them and
 * is gated on `member.update_role`; requiring reach there would stop an administrator naming a site.
 */
const exempt = new Map([
  ["may_reach_site", "it is the check itself, and cannot be asked to call itself"],
  ["apply_fuel_movement", "internal helper, execute revoked from anon and authenticated"],
  ["set_member_sites", "assigns restrictions rather than reading through them; gated on member.update_role"],
  ["assert_site_readable", "it is the shared gate, and performs the check itself"],
]);

/** Every SECURITY DEFINER function taking a site id, and whether it consults reach. */
const siteFunctions = () => {
  const found = new Map<string, { guarded: boolean; file: string }>();
  for (const { name: file, sql } of migrations()) {
    const pattern = /create or replace function public\.([a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\$\$;/g;
    for (const match of sql.matchAll(pattern)) {
      const [, fn, args, body] = match;
      if (!/security definer/i.test(body)) continue;
      if (!/site_id/.test(args)) continue;
      const guarded = body.includes("assert_site_readable") || body.includes("may_reach_site");
      // Later migrations replace earlier definitions, so the last one wins — the same way the
      // database resolves it.
      found.set(fn, { guarded, file });
    }
  }
  return found;
};

describe("site reach inside SECURITY DEFINER functions", () => {
  it("every function reporting on a site checks the caller may reach it", () => {
    const unguarded = [...siteFunctions()]
      .filter(([fn, { guarded }]) => !guarded && !exempt.has(fn))
      .map(([fn, { file }]) => `${fn} (${file})`);
    expect(
      unguarded,
      `call assert_site_readable(), or may_reach_site() directly, in:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });

  it("finds the functions at all, so the check above is not vacuous", () => {
    const found = siteFunctions();
    expect(found.size).toBeGreaterThan(10);
    expect([...found.keys()]).toContain("production_totals");
    expect([...found.keys()]).toContain("site_operational_summary");
  });

  it("every exemption is still a real function, and still says why", () => {
    // An exemption for a function that no longer exists is a hole waiting for a name collision.
    const found = siteFunctions();
    for (const [fn, reason] of exempt) {
      expect(found.has(fn), `${fn} is exempted but no longer exists`).toBe(true);
      expect(reason.length, `${fn} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("the shared gate actually consults reach", () => {
    // If this ever stops being true, the check above passes for ten functions that no longer check
    // anything — they only call a helper that used to.
    const gate = migrations()
      .map(({ sql }) => sql.match(/create or replace function public\.assert_site_readable[\s\S]*?\$\$;/g) ?? [])
      .flat()
      .pop();
    expect(gate).toBeDefined();
    expect(gate).toContain("may_reach_site");
  });
});
