-- site_operational_summary() gated every figure behind a single `site.read` check, then returned
-- numbers drawn from equipment, production, fuel, maintenance, inventory, compliance, and safety.
--
-- Each of those modules has its own read permission, and the roles do not overlap. A maintenance
-- officer, for instance, holds site.read and equipment.read but neither production.read nor
-- fuel.read — yet the summary told them the day's approved tonnage and the fuel on hand. One
-- permission was standing in for seven.
--
-- Each figure is now gated on the permission that guards the records it counts. A caller sees zero
-- for a module they cannot read, which is the same answer they would get by querying it directly
-- under RLS, rather than a number they were never entitled to.
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
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select organization_id into requested_organization_id
  from public.mine_sites
  where id = requested_site_id and deleted_at is null;

  if requested_organization_id is null then
    raise exception 'Mine site not found' using errcode = 'P0002';
  end if;
  if not public.has_permission(requested_organization_id, 'site.read') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

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

revoke all on function public.site_operational_summary(uuid) from public;
revoke all on function public.site_operational_summary(uuid) from anon;
grant execute on function public.site_operational_summary(uuid) to authenticated;
