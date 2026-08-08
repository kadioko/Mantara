/**
 * Probe: how does the stock-overview plan change as the stock matrix grows?
 *
 * Not a test. This exists to answer a question empirically rather than by assertion — whether the
 * planner switches from "read every balance and sort" to "walk items in name order and stop" once
 * the table is big enough to make the difference matter. Run it, read the plans, decide.
 *
 *   node scripts/plan-probe.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

await db.exec(`
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
`);

const dir = join(process.cwd(), "supabase", "migrations");
for (const file of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(dir, file), "utf8").replace(/create extension if not exists pgcrypto;?/gi, ""));
}

const { rows: userRows } = await db.query("insert into auth.users (email) values ('probe@acme.test') returning id");
const userId = userRows[0].id;
await db.query("select set_config('request.test_user', $1, false)", [userId]);
const { rows: orgRows } = await db.query(
  "select public.create_organization_with_owner($1, $2) as id", ["Probe Mining", "Probe Site"]);
const organizationId = orgRows[0].id;
const { rows: siteRows } = await db.query(
  "select id from public.mine_sites where organization_id = $1", [organizationId]);
const siteId = siteRows[0].id;

async function probe(items, stores) {
  await db.query("delete from public.inventory_stock_balances");
  await db.query("delete from public.inventory_items");
  await db.query("delete from public.inventory_locations");
  await db.query(
    `insert into public.inventory_items (organization_id, name, sku, unit, created_by)
     select $1::uuid, 'Part ' || lpad(g::text, 6, '0'), 'SKU-' || g, 'each', $2::uuid
     from generate_series(1, $3) g`, [organizationId, userId, items]);
  await db.query(
    `insert into public.inventory_locations (organization_id, mine_site_id, name, created_by)
     select $1::uuid, $2::uuid, 'Store ' || g, $3::uuid from generate_series(1, $4) g`,
    [organizationId, siteId, userId, stores]);
  await db.query(
    `insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity)
     select $1::uuid, i.id, l.id, 10 from public.inventory_items i cross join public.inventory_locations l`,
    [organizationId]);
  await db.query("analyze");

  const { rows } = await db.query(
    `explain (analyze) select item_name, location_name, quantity from public.inventory_stock_overview
     where organization_id = $1 and mine_site_id = $2 order by item_name limit 25`,
    [organizationId, siteId]);
  const text = rows.map((r) => Object.values(r)[0]).join("\n");

  const interesting = text.split("\n").filter((line) =>
    /Seq Scan on inventory_stock_balances|Sort Method|Nested Loop|Index Scan using|Execution Time|Limit/.test(line));
  process.stdout.write(`\n===== ${items} items x ${stores} stores = ${items * stores} balances =====\n`);
  process.stdout.write(interesting.join("\n") + "\n");
}

await probe(400, 8);
await probe(2000, 10);
await probe(10000, 10);
await db.close();
