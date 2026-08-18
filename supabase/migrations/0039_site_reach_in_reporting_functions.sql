-- Site restriction was not reaching the reporting functions.
--
-- `0028` restricts a member to particular mine sites with one restrictive RLS policy per site-scoped
-- table. That works: a member restricted to Pit One reads no Pit Two rows. But **`SECURITY DEFINER`
-- bypasses RLS by design**, and every headline figure in the product is computed inside such a
-- function. `assert_site_readable` resolved the organization from the site id and then checked
-- organization-level permissions -- `site.read` plus the module's own -- and never asked whether this
-- caller may reach *that* site.
--
-- So a member explicitly restricted to Pit One could not list Pit Two's production rows, and could
-- call `production_totals(pit_two)` and be handed its tonnage. For a mine that is the number that
-- matters: not which rows exist, but how much came out of the ground. The same held for
-- maintenance, expense and fuel totals, fuel consumption per machine, inventory shrinkage, the
-- period comparison, operational intelligence, the cash-flow forecast, the daily summary, and the
-- dashboard summary. Eleven functions.
--
-- The architecture note in the repository already says the rule this broke: "SECURITY DEFINER
-- functions bypass RLS by design, so each one re-checks permission itself." Each one did re-check
-- permission. Permission was never the thing that was missing -- reach was.
--
-- Fixed in one place rather than eleven. `assert_site_readable` is the gate ten of them already call,
-- so adding the check there fixes all ten at once and leaves no per-function edit to forget.
-- `site_operational_summary` predates that helper and carried its own copy of the preamble; it is
-- re-pointed at the helper here so there is exactly one gate in the product.
--
-- Safe to run twice. Both statements are CREATE OR REPLACE.
--
-- Guarded against recurrence by tests/unit/site-reach-guard.test.ts, which fails when a new
-- SECURITY DEFINER function takes a site id and consults neither assert_site_readable nor
-- may_reach_site. A new reporting function is exactly the kind of thing added later by someone
-- who has read that permissions are checked and reasonably assumes that is the whole story.

/**
 * Resolves the organization that owns a site and refuses a caller who may not read it.
 *
 * Three questions, all of which must pass. The third is new: a member with every permission in the
 * organization may still be restricted to a subset of its sites, and an aggregate is a disclosure
 * of the rows behind it.
 */
create or replace function public.assert_site_readable(requested_site_id uuid, module_permission text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select organization_id into owning_organization
  from public.mine_sites where id = requested_site_id and deleted_at is null;
  if owning_organization is null then raise exception 'Mine site not found' using errcode = 'P0002'; end if;

  -- Both checks matter. site.read establishes the caller belongs here at all; the module permission
  -- establishes they may see this particular kind of number.
  if not public.has_permission(owning_organization, 'site.read')
     or not public.has_permission(owning_organization, module_permission) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  -- And reach. Inert for a member with no site restriction, which is most of them, so this changes
  -- nothing for an ordinary organization. For a restricted member it is the difference between
  -- being unable to list another pit's rows and being unable to learn its tonnage.
  if not public.may_reach_site(owning_organization, requested_site_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return owning_organization;
end; $$;

revoke all on function public.assert_site_readable(uuid, text) from public, anon, authenticated;

-- The dashboard summary, re-pointed at the shared gate. Body otherwise unchanged.
create or replace function public.site_operational_summary(requested_site_id uuid)
returns table (
  operational_equipment bigint,
  equipment_needing_attention bigint,
  approved_production_today numeric,
  fuel_on_hand_litres numeric,
  open_work_orders bigint,
  inventory_items_at_reorder bigint,
  open_compliance_tasks bigint,
  open_corrective_actions bigint
) language plpgsql security definer set search_path = public as $$
declare
  requested_organization_id uuid;
  may_read_equipment boolean;
  may_read_production boolean;
  may_read_fuel boolean;
  may_read_maintenance boolean;
  may_read_inventory boolean;
  may_read_compliance boolean;
  may_read_safety boolean;
begin
  -- Its own copy of this preamble is what let the dashboard answer for a site the caller may not
  -- reach. One gate now, shared with the other ten reporting functions.
  requested_organization_id := public.assert_site_readable(requested_site_id, 'site.read');

  may_read_equipment := public.has_permission(requested_organization_id, 'equipment.read');
  may_read_production := public.has_permission(requested_organization_id, 'production.read');
  may_read_fuel := public.has_permission(requested_organization_id, 'fuel.read');
  may_read_maintenance := public.has_permission(requested_organization_id, 'maintenance.read');
  may_read_inventory := public.has_permission(requested_organization_id, 'inventory.read');
  may_read_compliance := public.has_permission(requested_organization_id, 'compliance.read');
  may_read_safety := public.has_permission(requested_organization_id, 'safety.read');

  return query
  select
    case when may_read_equipment then
      (select count(*) from public.equipment e
        where e.mine_site_id = requested_site_id and e.deleted_at is null and e.status = 'operational')
      else 0::bigint end,
    case when may_read_equipment then
      (select count(*) from public.equipment e
        where e.mine_site_id = requested_site_id and e.deleted_at is null and e.status in ('maintenance', 'breakdown'))
      else 0::bigint end,
    case when may_read_production then
      coalesce((select sum(p.quantity) from public.production_entries p
        where p.mine_site_id = requested_site_id and p.entry_date = current_date and p.status = 'approved'), 0)
      else 0::numeric end,
    case when may_read_fuel then
      coalesce((select sum(f.current_balance_litres) from public.fuel_storage_locations f
        where f.mine_site_id = requested_site_id and f.is_active), 0)
      else 0::numeric end,
    case when may_read_maintenance then
      (select count(*) from public.maintenance_work_orders w
        where w.mine_site_id = requested_site_id and w.status in ('planned', 'in_progress', 'on_hold'))
      else 0::bigint end,
    case when may_read_inventory then
      (select count(*) from public.inventory_stock_balances b
        join public.inventory_locations l on l.id = b.inventory_location_id
        join public.inventory_items i on i.id = b.inventory_item_id
        where l.mine_site_id = requested_site_id and i.reorder_level is not null and b.quantity <= i.reorder_level)
      else 0::bigint end,
    case when may_read_compliance then
      (select count(*) from public.compliance_tasks c
        where c.mine_site_id = requested_site_id and c.status in ('open', 'in_progress'))
      else 0::bigint end,
    case when may_read_safety then
      (select count(*) from public.corrective_actions a
        where a.mine_site_id = requested_site_id and a.status in ('open', 'in_progress'))
      else 0::bigint end;
end; $$;
