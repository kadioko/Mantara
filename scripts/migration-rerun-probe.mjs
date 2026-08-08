/**
 * Probe: which migrations survive being run twice?
 *
 * This matters because eleven are about to be applied to a live database in one sitting. If number
 * eight fails half way — a timeout, a dropped connection, a typo in the psql invocation — the
 * operator's instinct is to run it again. A migration that cannot be re-run turns a recoverable
 * hiccup into a manual repair on a production database at the worst possible moment.
 *
 * Applies every migration in order, then applies each one a second time and reports what happens.
 *
 *   node scripts/migration-rerun-probe.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STUB = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.test_user', true), '')::uuid; $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
const sqlFor = (file) =>
  readFileSync(join(dir, file), "utf8").replace(/create extension if not exists pgcrypto;?/gi, "");

const db = new PGlite();
await db.exec(SUPABASE_STUB);
for (const file of files) await db.exec(sqlFor(file));

console.log(`Applied ${files.length} migrations. Re-running each:\n`);

const failures = [];
for (const file of files) {
  try {
    await db.exec(sqlFor(file));
    console.log(`  ok      ${file}`);
  } catch (error) {
    const message = String(error?.message ?? error).split("\n")[0];
    console.log(`  RERUN   ${file}  ${message}`);
    failures.push({ file, message });
  }
}

console.log(`\n${failures.length} of ${files.length} migrations cannot be run twice.`);
if (failures.length) {
  console.log("\nThese are the ones where a half-finished apply cannot simply be repeated:");
  for (const { file, message } of failures) console.log(`  ${file}\n    ${message}`);
}
await db.close();
