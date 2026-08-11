import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { excludedTables, exportPermissions, exportedTables, isAccountedFor } from "@/features/exports/catalogue";

/**
 * The export promises a client its own data. The failure that would break that promise is not a
 * crash — it is a table added six months from now that nobody remembers to list, so the file quietly
 * stops being complete while still calling itself complete.
 *
 * These read the real schema out of the migrations, the same way the permission-code and
 * schema-contract checks do, because the Supabase client is untyped and none of this is visible to
 * the compiler.
 */

const migrations = () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
};

/** Every table that carries organization_id — that is, everything a tenant can own. */
const tenantTables = () => {
  const found = new Set<string>();
  for (const [, name, body] of migrations().matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g)) {
    if (/organization_id/.test(body)) found.add(name);
  }
  return found;
};

const permissionCodes = () => {
  const codes = new Set<string>();
  for (const match of migrations().matchAll(/\('([a-z_]+\.[a-z_]+)',\s*'/g)) codes.add(match[1]);
  return codes;
};

describe("the catalogue keeps up with the schema", () => {
  it("accounts for every table an organization can own", () => {
    // The one that matters. A missing table is a client told they have all their data when they
    // do not, and nothing anywhere would say so.
    const missing = [...tenantTables()].filter((table) => !isAccountedFor(table)).sort();
    expect(missing, `add these to exportedTables or excludedTables: ${missing.join(", ")}`).toEqual([]);
  });

  it("is not vacuous", () => {
    // If the regex above ever stops matching, the check before this one passes by finding nothing.
    expect(tenantTables().size).toBeGreaterThan(50);
    expect(exportedTables.length).toBeGreaterThan(50);
  });

  it("names only tables that exist", () => {
    // A typo would export nothing under that name and report a count of zero, which reads as "you
    // have no equipment" rather than "this line is wrong".
    const real = tenantTables();
    for (const entry of exportedTables) {
      expect(real.has(entry.table), `${entry.table} is not a table in the migrations`).toBe(true);
    }
  });

  it("gates each table on a permission the database actually defines", () => {
    // has_permission() returns false for a code nobody holds, so a typo here would withhold a table
    // from everyone forever and look like a deliberate decision. The same failure as expense.manage.
    const codes = permissionCodes();
    for (const entry of exportedTables) {
      expect(codes.has(entry.permission), `${entry.table} asks for ${entry.permission}, which does not exist`).toBe(true);
    }
  });

  it("lists no table twice", () => {
    const names = exportedTables.map((entry) => entry.table);
    expect(names.length).toBe(new Set(names).size);
  });

  it("never both exports and excludes the same table", () => {
    const exported = new Set(exportedTables.map((entry) => entry.table));
    for (const entry of excludedTables) expect(exported.has(entry.table)).toBe(false);
  });
});

describe("what is deliberately withheld", () => {
  it("gives a reason for every exclusion, long enough to be a reason", () => {
    // "internal" is not a reason. Somebody has to be able to disagree with it.
    for (const entry of excludedTables) {
      expect(entry.reason.length, `${entry.table} needs a real reason`).toBeGreaterThan(80);
    }
  });

  it("withholds the sensitive safety detail", () => {
    // Every read of it is audited one record at a time. A bulk file would convert that into an
    // unaudited copy of everything, which is the protection the separate table exists to give.
    expect(excludedTables.map((entry) => entry.table)).toContain("safety_incident_details");
  });
});

describe("the permissions consulted", () => {
  it("covers every module, so no module's records are exported unguarded", () => {
    for (const permission of ["production.read", "fuel.read", "inventory.read", "expense.read",
      "compliance.read", "safety.read", "worker.read", "equipment.read", "maintenance.read",
      "geology.read", "audit_log.read"]) {
      expect(exportPermissions(), permission).toContain(permission);
    }
  });
});
