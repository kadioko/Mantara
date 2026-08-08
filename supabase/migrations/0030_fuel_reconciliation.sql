-- Fuel reconciliation, and consumption per machine.
--
-- The roadmap's pilot success criteria include "a measurable reduction in reporting delay, missing
-- records, or fuel/inventory variance". Mantara records every litre in and every litre out, and then
-- measures no variance at all. Fuel is the loss that matters most at a mine site — it is portable,
-- saleable, and the shortfall shows up as a number nobody was watching.
--
-- Two things here, and neither asks anyone to capture anything new.
--
-- **A stock take** is someone dipping the tank and writing down what is actually in it. The book
-- says 4,000 litres; the stick says 3,600. Today that gets recorded as an adjustment with a
-- free-text reason, which corrects the balance and destroys the finding: there is no number left to
-- trend, and "400" and "shortfall after dip" read the same to a database. This records the measured
-- figure and the book figure side by side, keeps the difference as a column, and then corrects the
-- book through the ordinary adjustment path so the two never disagree afterwards.
--
-- **Consumption per machine** needs no new data whatsoever. Every fuel issue already records the
-- equipment's meter. Between two consecutive issues to the same machine, the litres given at the
-- first were burned over the meter distance to the second. An excavator that has been running at
-- 18 litres an hour for a year and is suddenly at 25 is either developing a fault or not receiving
-- all of what it is issued. Both are worth a conversation, and neither is visible today.

create table if not exists public.fuel_stock_takes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  storage_location_id uuid not null references public.fuel_storage_locations(id),
  -- What the tank actually held, by dip or gauge.
  measured_litres numeric(14,3) not null check (measured_litres >= 0),
  -- What the system believed it held at that moment, captured so the finding survives the correction.
  book_litres numeric(14,3) not null check (book_litres >= 0),
  -- Negative means less fuel than the records claim: the direction that costs money.
  variance_litres numeric(14,3) generated always as (measured_litres - book_litres) stored,
  taken_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  foreign key (organization_id, storage_location_id) references public.fuel_storage_locations(organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create index if not exists fuel_stock_takes_site_date_idx
  on public.fuel_stock_takes (mine_site_id, taken_on desc);

alter table public.fuel_stock_takes enable row level security;

drop policy if exists "fuel stock takes read permitted" on public.fuel_stock_takes;
create policy "fuel stock takes read permitted" on public.fuel_stock_takes
  for select using (public.has_permission(organization_id, 'fuel.read'));
-- No write policy: record_fuel_stock_take() is the only writer, because a stock take that did not
-- also correct the book would leave the two disagreeing with nothing to say which is right.

drop policy if exists "site restriction" on public.fuel_stock_takes;
create policy "site restriction" on public.fuel_stock_takes
  as restrictive for all
  using (public.may_reach_site(organization_id, mine_site_id))
  with check (public.may_reach_site(organization_id, mine_site_id));

/**
 * Records a measured tank level and brings the book into line with it.
 *
 * Returns the variance in litres: negative for a shortfall, which is the case worth acting on.
 *
 * The tank row is locked for the whole operation. Without that, an issue recorded between reading
 * the balance and writing the correction would be silently erased by the correction — the fuel would
 * have left the tank and the book would show it had not.
 */
create or replace function public.record_fuel_stock_take(
  requested_location_id uuid,
  measured numeric,
  taken_date date default current_date,
  take_notes text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare target record; difference numeric; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if measured < 0 then raise exception 'A measured level cannot be negative' using errcode = 'P0001'; end if;

  select id, organization_id, mine_site_id, current_balance_litres, capacity_litres, is_active
  into target
  from public.fuel_storage_locations where id = requested_location_id for update;
  if not found then raise exception 'Fuel storage location not found' using errcode = 'P0002'; end if;
  if not target.is_active then raise exception 'That fuel store is no longer active' using errcode = 'P0001'; end if;

  -- Adjusting the balance is what a stock take does, so it needs the permission that guards it.
  if not public.has_permission(target.organization_id, 'fuel.adjust') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.capacity_litres is not null and measured > target.capacity_litres then
    raise exception 'A measurement of % litres exceeds the % litre capacity of this tank',
      measured, target.capacity_litres using errcode = 'P0001';
  end if;

  difference := measured - target.current_balance_litres;

  insert into public.fuel_stock_takes
    (organization_id, mine_site_id, storage_location_id, measured_litres, book_litres, taken_on, notes, created_by)
  values
    (target.organization_id, target.mine_site_id, requested_location_id, measured,
     target.current_balance_litres, taken_date, take_notes, auth.uid())
  returning id into new_id;

  if difference <> 0 then
    -- Recorded as an ordinary adjustment so the movement history stays complete and the balance is
    -- maintained by the same path as everything else. The reason names the stock take, so the two
    -- records can always be tied together.
    update public.fuel_storage_locations
    set current_balance_litres = measured, updated_by = auth.uid()
    where id = requested_location_id;

    insert into public.fuel_adjustments
      (organization_id, mine_site_id, storage_location_id, litres_delta, reason, adjusted_on, notes, created_by, updated_by)
    values
      (target.organization_id, target.mine_site_id, requested_location_id, difference,
       'Stock take correction', taken_date,
       'Measured ' || measured || ' L against a book balance of ' || target.current_balance_litres || ' L',
       auth.uid(), auth.uid());
  end if;

  return difference;
end; $$;

revoke all on function public.record_fuel_stock_take(uuid, numeric, date, text) from public, anon;
grant execute on function public.record_fuel_stock_take(uuid, numeric, date, text) to authenticated;

/**
 * Fuel consumption per machine over a period, from the meter readings already on each issue.
 *
 * The calculation: order a machine's issues by meter, and pair each with the next. The litres given
 * at one reading were burned over the distance to the next. The final issue is excluded because
 * nothing has measured what happened to it yet — counting it would understate consumption for every
 * machine, every time, by exactly one fill.
 *
 * Rows with no meter reading are skipped rather than guessed at, and a meter that has gone backwards
 * — a replacement unit, or a typo — is skipped too. Both would otherwise produce a confident,
 * meaningless number.
 */
create or replace function public.equipment_fuel_consumption(
  requested_site_id uuid,
  -- Defaulted so the period is decided by the database's clock rather than the web server's, and so
  -- the common case — the last quarter — needs no date arithmetic in a React component.
  from_date date default current_date - 90,
  to_date date default current_date
) returns table (
  equipment_id uuid,
  equipment_name text,
  meter_type text,
  issues bigint,
  litres_used numeric,
  meter_travelled numeric,
  litres_per_unit numeric
) language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid;
begin
  owning_organization := public.assert_site_readable(requested_site_id, 'fuel.read');

  return query
  with paired as (
    select
      issue.equipment_id as machine,
      issue.litres,
      lead(issue.equipment_meter) over (
        partition by issue.equipment_id order by issue.equipment_meter
      ) - issue.equipment_meter as span
    from public.fuel_issues issue
    where issue.mine_site_id = requested_site_id
      and issue.equipment_id is not null
      and issue.equipment_meter is not null
      and issue.issued_on between from_date and to_date
  )
  select
    e.id,
    e.name,
    e.meter_type::text,
    count(*)::bigint,
    sum(paired.litres),
    sum(paired.span),
    -- Total litres over total distance, not the average of per-fill rates. Averaging the rates would
    -- let one small top-up over a short distance count as much as a full tank over a long shift.
    round(sum(paired.litres) / nullif(sum(paired.span), 0), 3)
  from paired
  join public.equipment e on e.id = paired.machine and e.deleted_at is null
  where paired.span > 0
  group by e.id, e.name, e.meter_type
  order by 7 desc nulls last;
end; $$;

revoke all on function public.equipment_fuel_consumption(uuid, date, date) from public, anon;
grant execute on function public.equipment_fuel_consumption(uuid, date, date) to authenticated;

-- Serves both the pairing above and the fuel report.
create index if not exists fuel_issues_equipment_meter_idx
  on public.fuel_issues (mine_site_id, equipment_id, equipment_meter);

-- Re-runnable on purpose. Applied through the Supabase SQL editor a migration is not wrapped in a
-- transaction, so a failure part-way leaves it half applied and the natural next move is to run it
-- again. Guarding every create means that works instead of needing a hand repair on a live database.
