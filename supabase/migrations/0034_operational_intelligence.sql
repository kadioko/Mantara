-- Auditable operational intelligence derived from approved records only.
-- Cost results stay separated by currency; adding TZS and USD would produce a plausible-looking lie.

create or replace function public.site_operational_intelligence(
  requested_site_id uuid,
  requested_from date default date_trunc('month', current_date)::date,
  requested_to date default current_date
) returns table (
  currency_code text,
  period_days integer,
  production_tonnes numeric,
  contained_grams numeric,
  contained_ounces numeric,
  approved_spend numeric,
  budget_amount numeric,
  budget_variance numeric,
  budget_used_percent numeric,
  cost_per_tonne numeric,
  cost_per_gram numeric,
  cost_per_ounce numeric,
  present_worker_days numeric,
  tonnes_per_worker_day numeric,
  recorded_equipment_hours numeric,
  scheduled_shift_hours numeric,
  equipment_utilization_percent numeric,
  projected_30_day_tonnes numeric,
  projected_30_day_spend numeric
) language plpgsql stable security definer set search_path = public as $$
declare
  owning_organization uuid;
  days integer;
begin
  if requested_from is null or requested_to is null or requested_to < requested_from then
    raise exception 'Choose a valid intelligence period' using errcode = '22007';
  end if;
  days := requested_to - requested_from + 1;
  if days > 366 then raise exception 'The intelligence period cannot exceed 366 days' using errcode = '22007'; end if;

  owning_organization := public.assert_site_readable(requested_site_id, 'site.read');
  if not public.has_permission(owning_organization, 'production.read')
     or not public.has_permission(owning_organization, 'expense.read') then
    raise exception 'Production and expense access are required' using errcode = '42501';
  end if;

  return query
  with production as (
    select
      coalesce(sum(p.quantity) filter (where lower(trim(p.unit)) in ('t', 'tonne', 'tonnes')), 0) as tonnes,
      coalesce(sum(p.quantity * p.grade) filter (
        where lower(trim(p.unit)) in ('t', 'tonne', 'tonnes') and p.grade is not null
      ), 0) as grams
    from public.production_entries p
    where p.organization_id = owning_organization and p.mine_site_id = requested_site_id
      and p.status = 'approved' and p.entry_date between requested_from and requested_to
  ),
  currencies as (
    select e.currency_code::text as code from public.expenses e
      where e.organization_id = owning_organization and e.mine_site_id = requested_site_id
        and e.status in ('approved', 'paid') and e.incurred_on between requested_from and requested_to
    union
    select b.currency_code::text from public.budgets b
      where b.organization_id = owning_organization
        and (b.mine_site_id is null or b.mine_site_id = requested_site_id)
        and b.starts_on <= requested_to and b.ends_on >= requested_from
    union select 'TZS'::text
  ),
  spending as (
    select c.code,
      coalesce((select sum(e.amount) from public.expenses e
        where e.organization_id = owning_organization and e.mine_site_id = requested_site_id
          and e.currency_code::text = c.code and e.status in ('approved', 'paid')
          and e.incurred_on between requested_from and requested_to), 0) as actual,
      coalesce((select sum(
        b.amount * ((least(b.ends_on, requested_to) - greatest(b.starts_on, requested_from) + 1)::numeric
          / (b.ends_on - b.starts_on + 1)::numeric)
      ) from public.budgets b
        where b.organization_id = owning_organization
          and (b.mine_site_id is null or b.mine_site_id = requested_site_id)
          and b.currency_code::text = c.code
          and b.starts_on <= requested_to and b.ends_on >= requested_from), 0) as budget
    from currencies c
  ),
  workforce as (
    select case when public.has_permission(owning_organization, 'worker.read')
      then count(*) filter (where a.status in ('present', 'late'))::numeric else null end as worker_days
    from public.attendance_records a
    where a.organization_id = owning_organization and a.mine_site_id = requested_site_id
      and a.attendance_date between requested_from and requested_to
  ),
  shift_capacity as (
    select case when public.has_permission(owning_organization, 'equipment.read') then
      coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0)
        filter (where s.starts_at is not null and s.ends_at is not null), 0) else null end as hours
    from public.shifts s
    where s.organization_id = owning_organization and s.mine_site_id = requested_site_id
      and s.shift_date between requested_from and requested_to
  ),
  equipment_use as (
    select case when public.has_permission(owning_organization, 'equipment.read') then
      coalesce(sum(greatest(readings.maximum - readings.minimum, 0)), 0) else null end as hours
    from (
      select r.equipment_id, max(r.reading_value) as maximum, min(r.reading_value) as minimum
      from public.equipment_meter_readings r
      join public.equipment e on e.id = r.equipment_id and e.meter_type = 'hours'
      where r.organization_id = owning_organization and r.mine_site_id = requested_site_id
        and r.reading_at::date between requested_from and requested_to
      group by r.equipment_id
    ) readings
  )
  select s.code, days,
    round(p.tonnes, 3), round(p.grams, 3), round(p.grams / 31.1034768, 3),
    round(s.actual, 2), round(s.budget, 2), round(s.budget - s.actual, 2),
    case when s.budget > 0 then round(s.actual / s.budget * 100, 1) end,
    case when p.tonnes > 0 then round(s.actual / p.tonnes, 2) end,
    case when p.grams > 0 then round(s.actual / p.grams, 2) end,
    case when p.grams > 0 then round(s.actual / (p.grams / 31.1034768), 2) end,
    w.worker_days,
    case when w.worker_days > 0 then round(p.tonnes / w.worker_days, 3) end,
    round(eu.hours, 2), round(sc.hours, 2),
    case when sc.hours > 0 then round(least(eu.hours / sc.hours * 100, 100), 1) end,
    round(p.tonnes / days * 30, 3), round(s.actual / days * 30, 2)
  from spending s cross join production p cross join workforce w cross join shift_capacity sc cross join equipment_use eu
  order by s.code;
end; $$;

revoke all on function public.site_operational_intelligence(uuid, date, date) from public, anon;
grant execute on function public.site_operational_intelligence(uuid, date, date) to authenticated;

create index if not exists equipment_meter_readings_site_date_idx
  on public.equipment_meter_readings (mine_site_id, reading_at, equipment_id);

