-- A site-scoped stock overview the database can filter, order and page.
--
-- The inventory screen previously read every stock balance in the organization and narrowed it to
-- the active site in JavaScript. That is not merely slow: PostgREST caps a response at 1000 rows,
-- so past that point the screen quietly showed a *subset* of the stock as if it were all of it.
-- Wrong stock figures that look right are worse than a slow page, and worse than an error.
--
-- Joining item and location here also lets the list be ordered by item name and searched by name or
-- SKU, neither of which PostgREST can do across an embedded resource.

create or replace view public.inventory_stock_overview
-- security_invoker is the whole safety story for this view. Without it a view runs with its
-- owner's privileges, which in Supabase means it would read straight past every RLS policy on the
-- underlying tables and hand one organization another's stock. With it, the policies on
-- inventory_stock_balances, inventory_items and inventory_locations all still apply to the caller.
with (security_invoker = true) as
select
  balance.id,
  balance.organization_id,
  location.mine_site_id,
  balance.quantity,
  balance.updated_at,
  item.id as item_id,
  item.name as item_name,
  item.sku as item_sku,
  item.unit as item_unit,
  item.reorder_level,
  location.id as location_id,
  location.name as location_name,
  location.is_active as location_is_active,
  (item.reorder_level is not null and balance.quantity <= item.reorder_level) as below_reorder
from public.inventory_stock_balances as balance
join public.inventory_items as item
  on item.id = balance.inventory_item_id and item.deleted_at is null
join public.inventory_locations as location
  on location.id = balance.inventory_location_id;

comment on view public.inventory_stock_overview is
  'Stock balances joined to their item and store, scoped by RLS to the caller. Filter on mine_site_id for one site.';

-- The query behind the screen is: this organization, this site, ordered by item name. Without this
-- the planner sorts the whole site's stock on every page turn.
create index if not exists inventory_stock_balances_org_item_idx
  on public.inventory_stock_balances (organization_id, inventory_item_id);
create index if not exists inventory_locations_site_idx
  on public.inventory_locations (mine_site_id, organization_id);

-- Anonymous callers have no membership, so RLS already returns them nothing; this makes that
-- explicit rather than relying on it.
revoke all on public.inventory_stock_overview from anon;
grant select on public.inventory_stock_overview to authenticated;
