import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./harness";

/**
 * Properties a migration needs to have before it is applied to a live database.
 *
 * The pending migrations are applied in one sitting. If one fails part-way — a timeout, a dropped
 * connection, a mistyped psql invocation — the operator's next move is to run it again. Applied
 * through the Supabase SQL editor there is no enclosing transaction, so "again" means the statements
 * that already succeeded run a second time. A migration that cannot survive that turns a recoverable
 * hiccup into a hand repair on production at the worst possible moment.
 *
 * Migrations `0001`–`0018` are already deployed and will never be applied again, so they are
 * exempt: editing a migration that has already run rewrites history for no benefit.
 */

const DIR = join(process.cwd(), "supabase", "migrations");
const FIRST_PENDING = 19;

const files = readdirSync(DIR).filter((name) => name.endsWith(".sql")).sort();
const pending = files.filter((name) => Number(name.slice(0, 4)) >= FIRST_PENDING);
const sqlFor = (file: string) =>
  readFileSync(join(DIR, file), "utf8").replace(/create extension if not exists pgcrypto;?/gi, "");

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 180_000);

afterAll(async () => { await db?.close(); });

describe("the migrations that have not been deployed yet", () => {
  it("finds them, so the checks below are not vacuous", () => {
    expect(pending.length).toBeGreaterThan(5);
    expect(pending[0]).toMatch(/^0019/);
  });

  for (const file of pending) {
    it(`${file} can be applied twice`, async () => {
      // The harness has already applied every migration once. Running this one again is exactly
      // what an operator does after a failure they believe was transient.
      await expect(db.exec(sqlFor(file))).resolves.toBeDefined();
    });
  }
});

describe("statements that would need a guard", () => {
  // A create without a guard is the specific thing that breaks a re-run. Catching it here is
  // cheaper than catching it on a live database.
  const unguarded: { file: string; line: number; statement: string }[] = [];

  for (const file of pending) {
    const lines = sqlFor(file).split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (/^create (table|index|unique index) (?!if not exists)/i.test(trimmed)) {
        unguarded.push({ file, line: index + 1, statement: trimmed.slice(0, 70) });
      }
      // A policy or trigger has no IF NOT EXISTS, so it needs a preceding DROP instead.
      if (/^create (policy|trigger) /i.test(trimmed)) {
        const name = /^create (?:policy|trigger) "?([^"\s]+)"?/i.exec(trimmed)?.[1];
        const dropped = name && lines.slice(0, index).some((earlier) =>
          earlier.includes("drop policy if exists") || earlier.includes("drop trigger if exists"))
          && lines.slice(Math.max(0, index - 3), index).some((earlier) => earlier.includes(name));
        if (!dropped) unguarded.push({ file, line: index + 1, statement: trimmed.slice(0, 70) });
      }
    });
  }

  it("has none left in the pending migrations", () => {
    expect(unguarded.map((entry) => `${entry.file}:${entry.line} ${entry.statement}`)).toEqual([]);
  });
});

describe("what a re-run must not do", () => {
  it("does not duplicate seeded permissions", async () => {
    // Several migrations insert permission rows. Running one twice must not leave two copies, or
    // every permission check starts returning duplicates and the roles screen lists them twice.
    const { rows } = await db.query<{ code: string }>(
      `select code from public.permissions group by code having count(*) > 1`);
    expect(rows).toEqual([]);
  });

  it("does not duplicate role permission defaults", async () => {
    const { rows } = await db.query<{ role_code: string }>(
      `select role_code from public.role_permission_defaults
       group by role_code, permission_code having count(*) > 1`);
    expect(rows).toEqual([]);
  });

  it("leaves exactly one site-restriction policy per table", async () => {
    // 0028 generates these in a loop. A re-run that appended rather than replaced would leave two,
    // which is harmless but is the kind of drift that makes a later diff unreadable.
    const { rows } = await db.query<{ tablename: string; count: string }>(
      `select tablename, count(*) as count from pg_policies
       where schemaname = 'public' and policyname = 'site restriction'
       group by tablename having count(*) > 1`);
    expect(rows).toEqual([]);
  });
});
