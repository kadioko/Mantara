-- This period against the one before it.
--
-- One of the pilot success criteria is that "the mine owner can see yesterday's operational position
-- remotely". The dashboard shows that position — but as bare figures with nothing to compare them
-- to. 1,240 tonnes is not information. 1,240 tonnes when last month was 1,350 is a question somebody
-- asks at the morning meeting, and that question is the whole product.
--
-- It also puts the variance work somewhere an owner will actually look. A storekeeper sees shrinkage
-- on the inventory screen and a fuel officer sees it on the fuel screen; the person who cares most
-- about both opens the dashboard and nothing else.
--
-- **Each measure carries whether up is good.** Production rising is good news, shrinkage rising is
-- not, and fuel issued rising is neither on its own — it depends on whether production rose with it.
-- Putting that with the measure means the screen colours a change correctly without a second list of
-- rules living in the UI, drifting away from this one.
--
-- Measures are gated on the same read permission as the records behind them. A maintenance officer
-- must not learn the month's production from a trend line any more than from a figure, which is the
-- leak 0016 fixed in operational_summary.

/**
 * Compares the last `window_days` against the `window_days` before that.
 *
 * Returns one row per measure the caller may see. A measure with no data in either period is
 * returned as zero rather than omitted: "no incidents this month or last" is worth showing, and an
 * absent row would read as a screen that failed to load.
 */
create or replace function public.site_period_comparison(
  requested_site_id uuid,
  window_days integer default 30
) returns table (
  measure text,
  unit text,
  current_value numeric,
  previous_value numeric,
  -- true: more is better. false: less is better. null: neither, so show the change without judging it.
  higher_is_better boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  owning_organization uuid;
  current_from date;
  previous_from date;
  may_read_production boolean;
  may_read_fuel boolean;
  may_read_inventory boolean;
  may_read_safety boolean;
  may_read_expenses boolean;
begin
  if window_days < 1 or window_days > 365 then
    raise exception 'A comparison window must be between 1 and 365 days' using errcode = 'P0001';
  end if;

  -- site.read alone gets you the shape of the answer; each measure needs its own module permission.
  owning_organization := public.assert_site_readable(requested_site_id, 'site.read');

  current_from := current_date - window_days;
  previous_from := current_date - (window_days * 2);

  may_read_production := public.has_permission(owning_organization, 'production.read');
  may_read_fuel := public.has_permission(owning_organization, 'fuel.read');
  may_read_inventory := public.has_permission(owning_organization, 'inventory.read');
  may_read_safety := public.has_permission(owning_organization, 'safety.read');
  may_read_expenses := public.has_permission(owning_organization, 'expense.read');

  if may_read_production then
    return query
    select
      'Approved production'::text,
      'tonnes'::text,
      coalesce(sum(quantity) filter (where entry_date > current_from), 0),
      coalesce(sum(quantity) filter (where entry_date > previous_from and entry_date <= current_from), 0),
      true
    from public.production_entries
    where mine_site_id = requested_site_id and status = 'approved' and entry_date > previous_from;

    -- Downtime has no date of its own; it belongs to a shift. Where there is no shift, the day it
    -- was recorded is the closest honest answer.
    return query
    select
      'Downtime'::text,
      'hours'::text,
      round(coalesce(sum(d.minutes) filter (where coalesce(s.shift_date, d.created_at::date) > current_from), 0) / 60.0, 1),
      round(coalesce(sum(d.minutes) filter (where coalesce(s.shift_date, d.created_at::date) > previous_from
                                              and coalesce(s.shift_date, d.created_at::date) <= current_from), 0) / 60.0, 1),
      false
    from public.downtime_records d
    left join public.shifts s on s.id = d.shift_id
    where d.mine_site_id = requested_site_id
      and coalesce(s.shift_date, d.created_at::date) > previous_from;
  end if;

  if may_read_fuel then
    -- Litres issued is neither good nor bad on its own: burning more fuel while producing more ore
    -- is what a busy month looks like. Shown so it can be read alongside production, not judged.
    return query
    select
      'Fuel issued'::text,
      'litres'::text,
      coalesce(sum(litres) filter (where issued_on > current_from), 0),
      coalesce(sum(litres) filter (where issued_on > previous_from and issued_on <= current_from), 0),
      null::boolean
    from public.fuel_issues
    where mine_site_id = requested_site_id and issued_on > previous_from;

    -- This one is a judgement. A negative total is fuel the records say is there and the dip stick
    -- says is not, and it is the number this whole module exists to surface.
    return query
    select
      'Fuel variance'::text,
      'litres'::text,
      coalesce(sum(variance_litres) filter (where taken_on > current_from), 0),
      coalesce(sum(variance_litres) filter (where taken_on > previous_from and taken_on <= current_from), 0),
      true
    from public.fuel_stock_takes
    where mine_site_id = requested_site_id and taken_on > previous_from;
  end if;

  if may_read_inventory then
    return query
    select
      'Stock variance'::text,
      'items'::text,
      coalesce(sum(l.variance_quantity) filter (where c.counted_on > current_from), 0),
      coalesce(sum(l.variance_quantity) filter (where c.counted_on > previous_from and c.counted_on <= current_from), 0),
      true
    from public.inventory_stock_count_lines l
    join public.inventory_stock_counts c
      on c.id = l.stock_count_id and c.status = 'applied' and c.mine_site_id = requested_site_id
    where c.counted_on > previous_from;
  end if;

  if may_read_safety then
    return query
    select
      'Safety incidents'::text,
      'incidents'::text,
      coalesce(count(*) filter (where reported_on > current_from), 0)::numeric,
      coalesce(count(*) filter (where reported_on > previous_from and reported_on <= current_from), 0)::numeric,
      false
    from public.safety_incidents
    where mine_site_id = requested_site_id and reported_on > previous_from;
  end if;

  if may_read_expenses then
    -- Approved and paid both count: the money has left either way.
    return query
    select
      'Approved spend'::text,
      'currency'::text,
      coalesce(sum(amount) filter (where incurred_on > current_from), 0),
      coalesce(sum(amount) filter (where incurred_on > previous_from and incurred_on <= current_from), 0),
      null::boolean
    from public.expenses
    where mine_site_id = requested_site_id
      and status in ('approved', 'paid')
      and incurred_on > previous_from;
  end if;
end; $$;

revoke all on function public.site_period_comparison(uuid, integer) from public, anon;
grant execute on function public.site_period_comparison(uuid, integer) to authenticated;

-- Each measure filters on a site and a date. These are the access patterns; without them every
-- dashboard load reads the whole table twice over.
create index if not exists production_entries_site_date_idx
  on public.production_entries (mine_site_id, entry_date);
create index if not exists fuel_issues_site_date_idx
  on public.fuel_issues (mine_site_id, issued_on);
create index if not exists safety_incidents_site_reported_idx
  on public.safety_incidents (mine_site_id, reported_on);
create index if not exists expenses_site_incurred_idx
  on public.expenses (mine_site_id, incurred_on);
create index if not exists downtime_records_site_idx
  on public.downtime_records (mine_site_id, created_at);

-- Every create in this file is guarded, so the whole migration can be applied twice.
