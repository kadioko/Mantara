-- Headline figures for the module screens, computed where the data is.
--
-- Every one of these was previously worked out in JavaScript from whatever rows the page happened to
-- have fetched — a page of 25 work orders, the last 50 ore lots, the first 1000 approved expenses.
-- The result was a site-wide claim made from a page-sized sample. The clearest symptom is that
-- "Open work orders" changed when the reader turned the page; the quieter and worse one is a tonnage
-- or a spend figure that is simply short, with nothing on screen to say so.
--
-- Each function is gated on the same read permission as the records it counts, so a headline number
-- can never disclose a module the caller is not allowed to open. This follows the shape and the
-- reasoning of operational_summary() in 0016, which was fixed for exactly that leak.

/** Shared preamble: resolve the organization from the site and refuse anyone who cannot see it. */
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
  return owning_organization;
end; $$;

create or replace function public.production_totals(requested_site_id uuid)
returns table (
  approved_quantity numeric,
  submitted_count bigint,
  ore_ready_tonnes numeric,
  ore_weighted_grade_ppm numeric
) language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid;
begin
  owning_organization := public.assert_site_readable(requested_site_id, 'production.read');

  return query
  select
    coalesce((select sum(e.quantity) from public.production_entries e
      where e.mine_site_id = requested_site_id and e.status = 'approved'), 0),
    (select count(*) from public.production_entries e
      where e.mine_site_id = requested_site_id and e.status = 'submitted'),
    coalesce((select sum(l.ore_tonnes) from public.ore_lots l
      where l.mine_site_id = requested_site_id and l.status <> 'dispatched'), 0),
    -- Grade is a tonnage-weighted mean, not an average of averages: a 100-tonne lot at 3 PPM and a
    -- 1-tonne lot at 30 PPM is 3.27 PPM overall, not 16.5. Averaging the lots would roughly double it.
    coalesce((select sum(l.ore_tonnes * l.grade_ppm) / nullif(sum(l.ore_tonnes), 0)
      from public.ore_lots l where l.mine_site_id = requested_site_id and l.status <> 'dispatched'), 0);
end; $$;

create or replace function public.maintenance_totals(requested_site_id uuid)
returns table (
  open_work_orders bigint,
  open_requests bigint,
  overdue_schedules bigint
) language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid;
begin
  owning_organization := public.assert_site_readable(requested_site_id, 'maintenance.read');

  return query
  select
    (select count(*) from public.maintenance_work_orders w
      where w.mine_site_id = requested_site_id and w.status in ('planned', 'in_progress', 'on_hold')),
    (select count(*) from public.maintenance_requests r
      where r.mine_site_id = requested_site_id and r.status = 'open'),
    (select count(*) from public.maintenance_schedules s
      where s.mine_site_id = requested_site_id and s.is_active and s.next_due_on < current_date);
end; $$;

create or replace function public.expense_totals(requested_site_id uuid)
returns table (
  approved_amount numeric,
  submitted_count bigint,
  active_budgets bigint
) language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid;
begin
  owning_organization := public.assert_site_readable(requested_site_id, 'expense.read');

  return query
  select
    -- Paid counts as approved spend: the money has left either way, and excluding it would understate
    -- what the site has committed.
    coalesce((select sum(e.amount) from public.expenses e
      where e.mine_site_id = requested_site_id and e.status in ('approved', 'paid')), 0),
    (select count(*) from public.expenses e
      where e.mine_site_id = requested_site_id and e.status = 'submitted'),
    -- A budget with no mine_site_id is organization-wide and applies to this site too.
    (select count(*) from public.budgets b
      where b.organization_id = owning_organization
        and (b.mine_site_id = requested_site_id or b.mine_site_id is null)
        and current_date between b.starts_on and b.ends_on);
end; $$;

create or replace function public.fuel_totals(requested_site_id uuid)
returns table (
  litres_on_hand numeric,
  active_stores bigint
) language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid;
begin
  owning_organization := public.assert_site_readable(requested_site_id, 'fuel.read');

  return query
  select
    coalesce((select sum(f.current_balance_litres) from public.fuel_storage_locations f
      where f.mine_site_id = requested_site_id and f.is_active), 0),
    (select count(*) from public.fuel_storage_locations f
      where f.mine_site_id = requested_site_id and f.is_active);
end; $$;

-- assert_site_readable is a building block, not an endpoint: nothing outside these functions should
-- be able to probe whether a site exists.
revoke all on function public.assert_site_readable(uuid, text) from public, anon, authenticated;

revoke all on function public.production_totals(uuid) from public, anon;
revoke all on function public.maintenance_totals(uuid) from public, anon;
revoke all on function public.expense_totals(uuid) from public, anon;
revoke all on function public.fuel_totals(uuid) from public, anon;
grant execute on function public.production_totals(uuid) to authenticated;
grant execute on function public.maintenance_totals(uuid) to authenticated;
grant execute on function public.expense_totals(uuid) to authenticated;
grant execute on function public.fuel_totals(uuid) to authenticated;

-- The counts above all filter on mine_site_id and a status, which is the access pattern these
-- indexes serve. Without them each page load sequentially scans the table.
create index if not exists production_entries_site_status_idx on public.production_entries (mine_site_id, status);
create index if not exists ore_lots_site_status_idx on public.ore_lots (mine_site_id, status);
create index if not exists work_orders_site_status_idx on public.maintenance_work_orders (mine_site_id, status);
create index if not exists maintenance_requests_site_status_idx on public.maintenance_requests (mine_site_id, status);
create index if not exists expenses_site_status_idx on public.expenses (mine_site_id, status);
