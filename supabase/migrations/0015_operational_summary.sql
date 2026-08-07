-- A permission-checked operational summary for future dashboards and reports.
--
-- This is a security-definer function because it combines several tenant tables, so it checks the
-- requested site belongs to an organization the caller may read before it touches operational data.
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
declare requested_organization_id uuid;
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

  return query
  select
    (select count(*) from public.equipment e
      where e.mine_site_id = requested_site_id and e.deleted_at is null and e.status = 'operational'),
    (select count(*) from public.equipment e
      where e.mine_site_id = requested_site_id and e.deleted_at is null and e.status in ('maintenance', 'breakdown')),
    coalesce((select sum(p.quantity) from public.production_entries p
      where p.mine_site_id = requested_site_id and p.entry_date = current_date and p.status = 'approved'), 0),
    coalesce((select sum(f.current_balance_litres) from public.fuel_storage_locations f
      where f.mine_site_id = requested_site_id and f.is_active), 0),
    (select count(*) from public.maintenance_work_orders w
      where w.mine_site_id = requested_site_id and w.status in ('planned', 'in_progress', 'on_hold')),
    (select count(*) from public.inventory_stock_balances b
      join public.inventory_locations l on l.id = b.inventory_location_id
      join public.inventory_items i on i.id = b.inventory_item_id
      where l.mine_site_id = requested_site_id and i.reorder_level is not null and b.quantity <= i.reorder_level),
    (select count(*) from public.compliance_tasks c
      where c.mine_site_id = requested_site_id and c.status in ('open', 'in_progress')),
    (select count(*) from public.corrective_actions a
      where a.mine_site_id = requested_site_id and a.status in ('open', 'in_progress'));
end; $$;

revoke all on function public.site_operational_summary(uuid) from public;
revoke all on function public.site_operational_summary(uuid) from anon;
grant execute on function public.site_operational_summary(uuid) to authenticated;
