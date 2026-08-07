import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  asAuthenticatedRole,
  createTestDatabase,
  createUser,
  expectRejection,
  type TestDatabase,
} from "./harness";

let db: TestDatabase;
let alice: string;
let bob: string;

const consume = async (bucket: string, max = 3, windowSeconds = 3600) => {
  const { rows } = await db.query<{ consume_rate_limit: boolean }>(
    "select public.consume_rate_limit($1, $2, $3)", [bucket, max, windowSeconds]);
  return rows[0].consume_rate_limit;
};

beforeAll(async () => {
  db = await createTestDatabase();
  alice = await createUser(db, "alice@acme.test");
  bob = await createUser(db, "bob@acme.test");
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("the allowance", () => {
  it("permits attempts up to the limit and refuses the next", async () => {
    await actAs(db, alice);
    expect(await consume("test.basic", 3)).toBe(true);
    expect(await consume("test.basic", 3)).toBe(true);
    expect(await consume("test.basic", 3)).toBe(true);
    expect(await consume("test.basic", 3)).toBe(false);
  });

  it("keeps refusing while the caller keeps trying", async () => {
    await actAs(db, alice);
    expect(await consume("test.basic", 3)).toBe(false);
    expect(await consume("test.basic", 3)).toBe(false);
  });

  it("counts each bucket separately", async () => {
    await actAs(db, alice);
    expect(await consume("test.other", 3)).toBe(true);
  });

  it("ignores attempts that fall outside the window", async () => {
    await actAs(db, alice);
    await consume("test.window", 2);
    await consume("test.window", 2);
    expect(await consume("test.window", 2)).toBe(false);
    // Age the earlier attempts out of a one-second window.
    await db.query("update public.rate_limit_events set occurred_at = now() - interval '10 seconds' where bucket = 'test.window'");
    expect(await consume("test.window", 2, 1)).toBe(true);
  });
});

describe("one caller cannot spend another's allowance", () => {
  // The subject comes from auth.uid(), never from an argument. If it were an argument, exhausting
  // someone else's allowance would be a way to lock them out.
  it("keeps allowances separate between callers", async () => {
    await actAs(db, alice);
    await consume("test.isolation", 2);
    await consume("test.isolation", 2);
    expect(await consume("test.isolation", 2)).toBe(false);

    await actAs(db, bob);
    expect(await consume("test.isolation", 2)).toBe(true);
  });

  it("takes no subject argument at all", async () => {
    const { rows } = await db.query<{ args: string }>(
      `select pg_get_function_arguments(p.oid) as args from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'consume_rate_limit'`);
    expect(rows[0].args).not.toMatch(/subject|user/i);
  });
});

describe("guards", () => {
  it("refuses an unauthenticated caller", async () => {
    await db.query("select set_config('request.test_user', '', false)");
    const message = await expectRejection(() => consume("test.anon"));
    expect(message).toMatch(/authentication required/i);
  });

  it("rejects a nonsensical allowance", async () => {
    await actAs(db, alice);
    const message = await expectRejection(() => consume("test.bad", 0, 60));
    expect(message).toMatch(/positive allowance/i);
  });

  it("keeps the event trail unreadable from the client", async () => {
    await actAs(db, alice);
    const rows = await asAuthenticatedRole(db, async () =>
      (await db.query("select id from public.rate_limit_events")).rows);
    expect(rows).toHaveLength(0);
  });

  it("has no policy permitting any client access", async () => {
    const { rows } = await db.query(
      "select policyname from pg_policies where schemaname = 'public' and tablename = 'rate_limit_events'");
    expect(rows).toEqual([]);
  });
});

describe("housekeeping", () => {
  it("prunes old events and leaves recent ones", async () => {
    await actAs(db, alice);
    await consume("test.prune", 5);
    await db.query("update public.rate_limit_events set occurred_at = now() - interval '3 days' where bucket = 'test.prune'");
    await consume("test.prune", 5);

    const { rows } = await db.query<{ prune_rate_limit_events: number }>("select public.prune_rate_limit_events(86400)");
    expect(rows[0].prune_rate_limit_events).toBeGreaterThan(0);

    const { rows: left } = await db.query<{ count: string }>(
      "select count(*) as count from public.rate_limit_events where bucket = 'test.prune'");
    expect(Number(left[0].count)).toBe(1);
  });

  it("is not callable by an ordinary user", async () => {
    const { rows } = await db.query<{ granted: boolean }>(
      `select has_function_privilege('authenticated', p.oid, 'execute') as granted
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'prune_rate_limit_events'`);
    expect(rows[0].granted).toBe(false);
  });
});
