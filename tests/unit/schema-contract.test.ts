import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every table, view, column and RPC the application names must exist in the migrations.
 *
 * The Supabase client here is untyped, so none of this is checked at compile time: a table renamed
 * in a migration, a column that never existed, an RPC argument spelled differently from its
 * parameter — all of them typecheck, lint, build, and then fail at runtime in front of an operator.
 *
 * This is the same shape as tests/unit/permission-codes.test.ts, which was written after
 * `expense.manage` shipped as a permission that does not exist. That one found a real bug the day it
 * was added, and the surface here is far larger: 55 tables and 41 functions.
 *
 * The parsing is deliberately conservative. A check that reports things which are fine is worse than
 * no check, because people stop reading it.
 */

const root = process.cwd();
const MIGRATIONS = join(root, "supabase", "migrations");

const migrationSql = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(MIGRATIONS, name), "utf8"))
  .join("\n");

/** Tables and views the schema defines, with their columns. */
function readSchema() {
  const columns = new Map<string, Set<string>>();

  for (const match of migrationSql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const [, table, body] = match;
    const set = columns.get(table) ?? new Set<string>();
    // A compact migration may place more than one column on a line. A column begins either at the
    // start of the body or immediately after a comma; constraints begin with a reserved word and do
    // not match a supported SQL type here.
    for (const column of body.matchAll(/(?:^\s*|,\s*)(\w+)\s+(uuid|text|numeric|integer|bigint|boolean|date|timestamptz|jsonb|inet|char|public\.)/gm)) {
      set.add(column[1]);
    }
    columns.set(table, set);
  }

  // Columns added after the table was created.
  for (const match of migrationSql.matchAll(/alter table (?:only )?public\.(\w+)\s+add column (?:if not exists )?(\w+)/g)) {
    columns.get(match[1])?.add(match[2]);
  }

  // Views expose the aliases in their select list.
  for (const match of migrationSql.matchAll(/create (?:or replace )?view public\.(\w+)([\s\S]*?);\n/g)) {
    const [, view, body] = match;
    const set = columns.get(view) ?? new Set<string>();
    // Both `as name,` and the last column of the list, which carries no trailing comma. Missing
    // that second case reported inventory_stock_overview.below_reorder — a real column — as absent.
    for (const alias of body.matchAll(/ as (\w+)\s*(?:,|$)/gm)) set.add(alias[1]);
    // Unaliased columns are written `table.column,` or, at the end of the list, without the comma.
    for (const bare of body.matchAll(/^\s+\w+\.(\w+)\s*(?:,|$)/gm)) set.add(bare[1]);
    columns.set(view, set);
  }

  return columns;
}

/**
 * Function name to the set of its parameter names.
 *
 * The parameter list is read by balancing brackets rather than by regex. A default value can contain
 * its own parentheses, and not every function ends its signature with `returns` — apply_fuel_movement
 * uses OUT parameters and continues straight to `language`. A regex that assumed otherwise ran past
 * the end of one signature and swallowed the next function's, reporting two perfectly real functions
 * as missing.
 */
function readFunctions() {
  const functions = new Map<string, Set<string>>();

  for (const match of migrationSql.matchAll(/create (?:or replace )?function public\.(\w+)\s*\(/g)) {
    const name = match[1];
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < migrationSql.length && depth > 0) {
      if (migrationSql[index] === "(") depth += 1;
      else if (migrationSql[index] === ")") depth -= 1;
      index += 1;
    }
    const params = migrationSql.slice(match.index + match[0].length, index - 1);

    const set = new Set<string>();
    // Split on commas that are not inside brackets, so a default like `array[...]` stays whole.
    let bracket = 0;
    let current = "";
    for (const character of `${params},`) {
      if (character === "(" || character === "[") bracket += 1;
      if (character === ")" || character === "]") bracket -= 1;
      if (character === "," && bracket === 0) {
        const named = /^\s*(?:out\s+|inout\s+)?(\w+)\s+\w/.exec(current);
        if (named) set.add(named[1]);
        current = "";
      } else {
        current += character;
      }
    }
    functions.set(name, set);
  }
  return functions;
}

const schema = readSchema();
const functions = readFunctions();

const sourceFiles = (() => {
  const skip = new Set(["node_modules", ".next", ".git", "supabase", "tests", "scripts"]);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full);
    }
  };
  walk(root);
  return found;
})();

type Finding = { file: string; detail: string };

/**
 * `from("table")` anywhere in the source, with or without a leading dot.
 *
 * Defined once, as a constant, deliberately. An earlier version wrote these patterns inline and an
 * edit passing through another quoting layer replaced the word-boundary escape with a literal
 * backspace character. The regex then matched nothing, and both checks below passed while reading no
 * code at all — the exact failure they exist to prevent, occurring inside the check itself. Only the
 * teeth test at the end of this file caught it.
 */
const FROM_CALL = /from\("(\w+)"\)/g;
const FROM_SPLIT = /from\("/;

describe("the schema the tests read", () => {
  it("finds the application source, so the checks below are not vacuous", () => {
    // A check that reads no files passes for the wrong reason and reports nothing forever.
    expect(sourceFiles.length).toBeGreaterThan(100);
    expect(sourceFiles.some((file) => file.endsWith("actions.ts"))).toBe(true);
  });

  it("finds the tables and functions, so the checks below are not vacuous", () => {
    expect(schema.size).toBeGreaterThan(40);
    expect(functions.size).toBeGreaterThan(30);
    expect(schema.get("production_entries")?.has("quantity")).toBe(true);
    expect(functions.get("record_fuel_stock_take")?.has("measured")).toBe(true);
  });
});

describe("every table the application reads", () => {
  it("exists in the migrations", () => {
    const missing: Finding[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      // Matched without requiring a leading dot: the dashboard wraps the client in a local
      // `from(table)` helper, and those queries are just as capable of naming a table that is gone.
      for (const match of source.matchAll(FROM_CALL)) {
        if (!schema.has(match[1])) missing.push({ file: relative(root, file), detail: match[1] });
      }
    }
    expect(missing.map((entry) => `${entry.detail} (${entry.file})`)).toEqual([]);
  });
});

describe("every function the application calls", () => {
  it("exists in the migrations", () => {
    const missing: Finding[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\.rpc\("(\w+)"/g)) {
        if (!functions.has(match[1])) missing.push({ file: relative(root, file), detail: match[1] });
      }
    }
    expect(missing.map((entry) => `${entry.detail} (${entry.file})`)).toEqual([]);
  });

  it("passes only arguments that function declares", () => {
    // An argument named differently from its parameter is the failure this exists for. PostgREST
    // answers "could not find the function ... with these parameters", which reads like the function
    // is missing entirely and sends people looking in the wrong place.
    const wrong: Finding[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const call of source.matchAll(/\.rpc\("(\w+)",\s*\{([^}]*)\}/gs)) {
        const [, name, body] = call;
        const declared = functions.get(name);
        if (!declared) continue;
        for (const argument of body.matchAll(/(?:^|,)\s*(\w+)\s*:/g)) {
          if (!declared.has(argument[1])) {
            wrong.push({ file: relative(root, file), detail: `${name}({ ${argument[1]} }) — declares: ${[...declared].join(", ")}` });
          }
        }
      }
    }
    expect(wrong.map((entry) => `${entry.detail} (${entry.file})`)).toEqual([]);
  });
});

describe("every column the application filters or orders by", () => {
  // Only .eq/.order and friends are checked, not .select() — a select list can contain embedded
  // resources, aliases and PostgREST syntax that this has no business trying to parse. Filters and
  // orders are plain column names, so a mismatch there is unambiguous.
  it("exists on the table being queried", () => {
    const wrong: Finding[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      // Track the most recent from() so a filter can be attributed to a table. Splitting on the
      // bare word rather than `.from(` matters: the dashboard's local helper has no leading dot, so
      // a dot-only split left one chunk running to the end of the file and blamed every later
      // filter on whichever table happened to come first.
      const chunks = source.split(FROM_SPLIT);
      for (let index = 1; index < chunks.length; index += 1) {
        const table = /^(\w+)"/.exec(chunks[index])?.[1];
        const columns = table ? schema.get(table) : undefined;
        if (!columns) continue;
        // Only look as far as the end of this query chain.
        const chain = chunks[index].split(/;\n|\n\n/)[0];
        for (const filter of chain.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|is|in|like|ilike|order)\("(\w+)"/g)) {
          // An embedded filter names another table's column: `.eq("location.mine_site_id", …)`.
          if (filter[1].includes(".")) continue;
          if (!columns.has(filter[1])) {
            wrong.push({ file: relative(root, file), detail: `${table}.${filter[1]}` });
          }
        }
      }
    }

    expect(wrong.map((entry) => `${entry.detail} (${entry.file})`)).toEqual([]);
  });
});

describe("the checks can still see", () => {
  /**
   * The checks above are only as good as their patterns, and a broken pattern does not fail — it
   * matches nothing and reports a clean bill of health forever.
   *
   * That is not hypothetical. An edit to this file passing through another quoting layer replaced a
   * word-boundary escape with a literal backspace character. Both checks then read no code at all
   * and passed, and nothing revealed it until three deliberate mistakes were planted in real source
   * and none of them were caught.
   *
   * So the patterns are exercised here against a fragment written inline, where nothing can silently
   * change them.
   */
  const fragment = [
    'const a = supabase.from("workers").select("id").eq("mine_site_id", siteId);',
    'const b = from("expenses").eq("status", "submitted").order("incurred_on");',
    'const c = supabase.rpc("production_totals", { requested_site_id: siteId });',
  ].join("\n");

  it("finds a table named with a leading dot and one without", () => {
    const tables = [...fragment.matchAll(FROM_CALL)].map((match) => match[1]);
    expect(tables).toEqual(["workers", "expenses"]);
  });

  it("splits a file into one chunk per query", () => {
    // Two from() calls give three chunks: what precedes the first, and one per query.
    expect(fragment.split(FROM_SPLIT)).toHaveLength(3);
  });

  it("finds the columns a query filters and orders by", () => {
    const columns = [...fragment.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|is|in|like|ilike|order)\("(\w+)"/g)]
      .map((match) => match[1]);
    expect(columns).toEqual(["mine_site_id", "status", "incurred_on"]);
  });

  it("finds an RPC and its argument names", () => {
    const call = /\.rpc\("(\w+)",\s*\{([^}]*)\}/s.exec(fragment);
    expect(call?.[1]).toBe("production_totals");
    expect([...(call?.[2] ?? "").matchAll(/(?:^|,)\s*(\w+)\s*:/g)].map((m) => m[1]))
      .toEqual(["requested_site_id"]);
  });

  it("reads real columns out of a view, including the last one in the list", () => {
    // below_reorder is the final column of inventory_stock_overview and carries no trailing comma.
    expect(schema.get("inventory_stock_overview")?.has("below_reorder")).toBe(true);
    expect(schema.get("inventory_stock_overview")?.has("item_name")).toBe(true);
  });
});
