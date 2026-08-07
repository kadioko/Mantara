import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Boots a real PostgreSQL (compiled to WebAssembly) and applies the actual migration files, so the
 * behaviour these tests assert is the behaviour the deployed database will have. No Docker or remote
 * Supabase project is needed, which is why these can run in ordinary CI.
 *
 * Supabase provides the `auth` schema, `auth.uid()`, and the API roles at runtime; they are stubbed
 * here so the migrations run unmodified. `auth.uid()` reads a session setting the tests control.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const SUPABASE_STUB = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.test_user', true), '')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

grant usage on schema public to anon, authenticated;

-- Supabase grants the API roles access to objects in public as they are created. Modelling that here
-- (rather than granting after the fact) is what makes the migrations' REVOKE statements meaningful:
-- a helper that is only revoked from PUBLIC would still be callable, and the tests would catch it.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export type TestDatabase = PGlite;

export async function createTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);

  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    // gen_random_uuid() is core from PostgreSQL 13, so pgcrypto is unnecessary in this harness.
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(/create extension if not exists pgcrypto;?/gi, "");
    await db.exec(sql);
  }

  return db;
}

/** Creates an auth user; the foundation trigger creates the matching profile row. */
export async function createUser(db: TestDatabase, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0].id;
}

/** Makes subsequent statements run as `userId` for the purposes of auth.uid(). */
export async function actAs(db: TestDatabase, userId: string) {
  await db.query("select set_config('request.test_user', $1, false)", [userId]);
}

/** Runs statements with RLS enforced, as Supabase's `authenticated` role would. */
export async function asAuthenticatedRole<T>(db: TestDatabase, run: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

export type Workspace = { userId: string; organizationId: string; siteId: string };

/** Creates a user, organization, and first mine site through the real onboarding function. */
export async function createWorkspace(db: TestDatabase, email: string, organizationName: string): Promise<Workspace> {
  const userId = await createUser(db, email);
  await actAs(db, userId);
  const { rows } = await db.query<{ create_organization_with_owner: string }>(
    "select public.create_organization_with_owner($1, $2)",
    [organizationName, `${organizationName} Site`],
  );
  const organizationId = rows[0].create_organization_with_owner;
  const { rows: siteRows } = await db.query<{ id: string }>(
    "select id from public.mine_sites where organization_id = $1",
    [organizationId],
  );
  return { userId, organizationId, siteId: siteRows[0].id };
}

/** Captures the error message from a statement expected to be rejected by the database. */
export async function expectRejection(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the database to reject this statement, but it succeeded.");
}
