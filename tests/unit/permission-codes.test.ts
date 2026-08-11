import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every permission code the application asks for must be one the database actually defines.
 *
 * A typo here fails silently and in the worst possible direction: `has_permission()` returns false
 * for a code nobody holds, so the screen simply denies everyone, forever, with a message that reads
 * like a deliberate decision. Nothing throws and no test of the feature itself would notice.
 * `expense.manage` was written for exactly this reason and caught by exactly this test.
 */

const root = process.cwd();

const migrationCodes = () => {
  const dir = join(root, "supabase", "migrations");
  const codes = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, file), "utf8");
    // Permissions are seeded as ('domain.action', 'Label', 'Description').
    for (const match of sql.matchAll(/\('([a-z_]+\.[a-z_]+)',\s*'/g)) codes.add(match[1]);
  }
  return codes;
};

const sourceFiles = () => {
  const skip = new Set(["node_modules", ".next", ".git", ".claude", "supabase", "scripts"]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) files.push(full);
    }
  };
  walk(root);
  return files;
};

/** Every permission code named by requireScope, hasPermission or hasPermissions in the app. */
const requestedCodes = () => {
  const found: { code: string; file: string }[] = [];
  for (const file of sourceFiles()) {
    if (file.includes(`${join("tests", "unit")}`)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/requireScope\(\s*"([^"]+)"/g)) {
      found.push({ code: match[1], file: relative(root, file) });
    }
    for (const match of source.matchAll(/hasPermission\(\s*[a-zA-Z.$_]+,\s*"([^"]+)"/g)) {
      found.push({ code: match[1], file: relative(root, file) });
    }
    // hasPermissions takes an array literal of codes.
    for (const match of source.matchAll(/hasPermissions\(\s*[a-zA-Z.$_]+,\s*\[([^\]]+)\]/gs)) {
      for (const literal of match[1].matchAll(/"([a-z_]+\.[a-z_]+)"/g)) {
        found.push({ code: literal[1], file: relative(root, file) });
      }
    }
  }
  return found;
};

describe("permission codes", () => {
  const defined = migrationCodes();
  const requested = requestedCodes();

  it("finds the seeded codes and the call sites, so the check below is not vacuous", () => {
    expect(defined.size).toBeGreaterThan(20);
    expect(requested.length).toBeGreaterThan(20);
  });

  it("only asks for codes the database defines", () => {
    const unknown = requested.filter((entry) => !defined.has(entry.code));
    expect(
      unknown.map((entry) => `${entry.code} (${entry.file})`),
      "these permission codes are requested by the app but never seeded, so they deny everyone",
    ).toEqual([]);
  });

  it("uses the domain.action shape throughout", () => {
    for (const { code, file } of requested) {
      expect(code, `${code} in ${file}`).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});
