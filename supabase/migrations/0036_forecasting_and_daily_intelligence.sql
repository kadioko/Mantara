-- Revenue-backed operational forecasts. Assumptions are explicit, versioned by update timestamp,
-- tenant/site scoped, and never presented as recorded revenue or a mineral-resource estimate.

create table if not exists public.site_forecast_assumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  commodity text not null default 'Gold',
  currency_code char(3) not null default 'USD',
  price_per_ounce numeric(18,2) not null check (price_per_ounce >= 0),
  recovery_percent numeric(6,3) not null check (recovery_percent between 0 and 100),
  forecast_days integer not null default 30 check (forecast_days between 1 and 366),
  effective_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, mine_site_id, commodity, currency_code),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create index if not exists site_forecast_assumptions_site_idx
  on public.site_forecast_assumptions(mine_site_id, effective_on desc);
drop trigger if exists site_forecast_assumptions_updated_at on public.site_forecast_assumptions;
create trigger site_forecast_assumptions_updated_at before update on public.site_forecast_assumptions
  for each row execute function public.set_updated_at();

alter table public.site_forecast_assumptions enable row level security;
drop policy if exists "forecast assumptions read permitted" on public.site_forecast_assumptions;
create policy "forecast assumptions read permitted" on public.site_forecast_assumptions for select
  using (public.has_permission(organization_id, 'production.read') and public.has_permission(organization_id, 'expense.read'));
drop policy if exists "forecast assumptions create permitted" on public.site_forecast_assumptions;
create policy "forecast assumptions create permitted" on public.site_forecast_assumptions for insert
  with check (created_by = auth.uid() and public.has_permission(organization_id, 'production.update') and public.has_permission(organization_id, 'expense.update'));
drop policy if exists "forecast assumptions update permitted" on public.site_forecast_assumptions;
create policy "forecast assumptions update permitted" on public.site_forecast_assumptions for update
  using (public.has_permission(organization_id, 'production.update') and public.has_permission(organization_id, 'expense.update'))
  with check (updated_by = auth.uid() and public.has_permission(organization_id, 'production.update') and public.has_permission(organization_id, 'expense.update'));
drop policy if exists "forecast assumptions site restriction" on public.site_forecast_assumptions;
create policy "forecast assumptions site restriction" on public.site_forecast_assumptions as restrictive for all
  using (public.may_reach_site(organization_id, mine_site_id))
  with check (public.may_reach_site(organization_id, mine_site_id));

drop trigger if exists audit_forecast_assumption on public.site_forecast_assumptions;
create trigger audit_forecast_assumption after insert or update on public.site_forecast_assumptions
  for each row execute function public.audit_row_change('intelligence.assumption_saved','site_forecast_assumption');

create or replace function public.site_cashflow_forecast(
  requested_site_id uuid,
  history_from date default (current_date - 29),
  history_to date default current_date
) returns table (
  commodity text,
  currency_code text,
  history_days integer,
  forecast_days integer,
  recorded_tonnes numeric,
  recorded_contained_ounces numeric,
  recovery_percent numeric,
  price_per_ounce numeric,
  forecast_tonnes numeric,
  forecast_recovered_ounces numeric,
  forecast_revenue numeric,
  recorded_paid_outflow numeric,
  forecast_outflow numeric,
  forecast_net_cashflow numeric,
  assumption_updated_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid; days integer;
begin
  if history_from is null or history_to is null or history_to < history_from then
    raise exception 'Choose a valid forecast history period' using errcode = '22007';
  end if;
  days := history_to - history_from + 1;
  if days > 366 then raise exception 'Forecast history cannot exceed 366 days' using errcode = '22007'; end if;
  owning_organization := public.assert_site_readable(requested_site_id, 'site.read');
  if not public.has_permission(owning_organization, 'production.read') or not public.has_permission(owning_organization, 'expense.read') then
    raise exception 'Production and expense access are required' using errcode = '42501';
  end if;

  return query
  with production as (
    select coalesce(sum(p.quantity) filter (where lower(trim(p.unit)) in ('t','tonne','tonnes')),0) tonnes,
      coalesce(sum(p.quantity * p.grade) filter (where lower(trim(p.unit)) in ('t','tonne','tonnes') and p.grade is not null),0) / 31.1034768 ounces
    from public.production_entries p
    where p.organization_id=owning_organization and p.mine_site_id=requested_site_id
      and p.status='approved' and p.entry_date between history_from and history_to
  )
  select a.commodity, a.currency_code::text, days, a.forecast_days,
    round(p.tonnes,3), round(p.ounces,3), a.recovery_percent, a.price_per_ounce,
    round(p.tonnes / days * a.forecast_days,3),
    round(p.ounces / days * a.forecast_days * a.recovery_percent / 100,3),
    round(p.ounces / days * a.forecast_days * a.recovery_percent / 100 * a.price_per_ounce,2),
    round(coalesce((select sum(e.amount) from public.expenses e where e.organization_id=owning_organization
      and e.mine_site_id=requested_site_id and e.currency_code=a.currency_code and e.status='paid'
      and e.incurred_on between history_from and history_to),0),2),
    round(coalesce((select sum(e.amount) from public.expenses e where e.organization_id=owning_organization
      and e.mine_site_id=requested_site_id and e.currency_code=a.currency_code and e.status in ('approved','paid')
      and e.incurred_on between history_from and history_to),0) / days * a.forecast_days,2),
    round((p.ounces / days * a.forecast_days * a.recovery_percent / 100 * a.price_per_ounce) -
      (coalesce((select sum(e.amount) from public.expenses e where e.organization_id=owning_organization
        and e.mine_site_id=requested_site_id and e.currency_code=a.currency_code and e.status in ('approved','paid')
        and e.incurred_on between history_from and history_to),0) / days * a.forecast_days),2),
    a.updated_at
  from public.site_forecast_assumptions a cross join production p
  where a.organization_id=owning_organization and a.mine_site_id=requested_site_id
  order by a.currency_code, a.commodity;
end; $$;

create or replace function public.site_daily_summary(requested_site_id uuid, requested_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid; result jsonb;
begin
  owning_organization := public.assert_site_readable(requested_site_id, 'site.read');
  select jsonb_build_object(
    'date', requested_date,
    'production', case when public.has_permission(owning_organization,'production.read') then jsonb_build_object(
      'approvedTonnes', coalesce((select sum(quantity) from public.production_entries where organization_id=owning_organization and mine_site_id=requested_site_id and entry_date=requested_date and status='approved' and lower(trim(unit)) in ('t','tonne','tonnes')),0),
      'entries', (select count(*) from public.production_entries where organization_id=owning_organization and mine_site_id=requested_site_id and entry_date=requested_date)) end,
    'attendance', case when public.has_permission(owning_organization,'worker.read') then jsonb_build_object(
      'presentOrLate', (select count(*) from public.attendance_records where organization_id=owning_organization and mine_site_id=requested_site_id and attendance_date=requested_date and status in ('present','late')),
      'recorded', (select count(*) from public.attendance_records where organization_id=owning_organization and mine_site_id=requested_site_id and attendance_date=requested_date)) end,
    'expenses', case when public.has_permission(owning_organization,'expense.read') then coalesce((select jsonb_agg(jsonb_build_object('currency',currency_code,'amount',amount)) from
      (select currency_code, sum(amount) amount from public.expenses where organization_id=owning_organization and mine_site_id=requested_site_id and incurred_on=requested_date and status in ('approved','paid') group by currency_code) x),'[]'::jsonb) end,
    'safety', case when public.has_permission(owning_organization,'safety.read') then jsonb_build_object(
      'incidents', (select count(*) from public.safety_incidents where organization_id=owning_organization and mine_site_id=requested_site_id and occurred_at::date=requested_date),
      'inspections', (select count(*) from public.safety_inspections where organization_id=owning_organization and mine_site_id=requested_site_id and inspected_on=requested_date)) end,
    'evidence', jsonb_build_array('production_entries','attendance_records','expenses','safety_incidents','safety_inspections')
  ) into result;
  return result;
end; $$;

revoke all on function public.site_cashflow_forecast(uuid,date,date) from public, anon;
revoke all on function public.site_daily_summary(uuid,date) from public, anon;
grant execute on function public.site_cashflow_forecast(uuid,date,date) to authenticated;
grant execute on function public.site_daily_summary(uuid,date) to authenticated;
