-- Counting the store, and keeping what the count found.
--
-- 0030 did this for fuel. Inventory has the same hole and loses the same finding the same way: when
-- a physical count disagrees with the system, somebody records a stock adjustment with a free-text
-- reason, the balance is corrected, and the discrepancy stops existing as a number. Shrinkage is
-- exactly the thing a storekeeper is meant to be watching, and it was being written into a text
-- field nobody can total.
--
-- Inventory differs from fuel in one way that shapes the design: a count is not one measurement, it
-- is a store walked shelf by shelf. So a count is a session with many lines, entered over an hour or
-- an afternoon, and applied once at the end.
--
-- **The book quantity is captured when the count is applied, not when it is entered.** This is the
-- decision that makes the numbers trustworthy. Stock keeps moving while somebody is counting; if the
-- book figure were read at entry time, a legitimate issue made an hour later would be silently
-- reversed by the correction and would show up as a variance that never happened.

-- Guarded because a type cannot declare IF NOT EXISTS, and this migration has to survive being run
-- twice: applied through the SQL editor there is no enclosing transaction, so a failure part-way
-- leaves the file half applied and the natural next move is to run it again.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'stock_count_status') then
    create type public.stock_count_status as enum ('draft', 'applied', 'cancelled');
  end if;
end $$;

create table if not exists public.inventory_stock_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  inventory_location_id uuid not null references public.inventory_locations(id),
  reference text,
  status public.stock_count_status not null default 'draft',
  counted_on date not null default current_date,
  applied_at timestamptz,
  applied_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, id),
  foreign key (organization_id, inventory_location_id) references public.inventory_locations(organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table if not exists public.inventory_stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stock_count_id uuid not null references public.inventory_stock_counts(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  counted_quantity numeric(16,3) not null check (counted_quantity >= 0),
  -- Null until the count is applied. Filled from the live balance at that moment, which is what
  -- makes the variance mean something.
  book_quantity numeric(16,3),
  variance_quantity numeric(16,3) generated always as (counted_quantity - book_quantity) stored,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  -- One line per item per count. Counting the same shelf twice should correct the first line, not
  -- add a second that silently doubles the correction.
  unique (stock_count_id, inventory_item_id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items(organization_id, id)
);

create index if not exists stock_counts_site_date_idx
  on public.inventory_stock_counts (mine_site_id, counted_on desc);
create index if not exists stock_count_lines_count_idx
  on public.inventory_stock_count_lines (stock_count_id);
-- Shrinkage per item over time, which is the report this whole thing exists to make possible.
create index if not exists stock_count_lines_item_idx
  on public.inventory_stock_count_lines (organization_id, inventory_item_id);

alter table public.inventory_stock_counts enable row level security;
alter table public.inventory_stock_count_lines enable row level security;

drop policy if exists "stock counts read permitted" on public.inventory_stock_counts;
create policy "stock counts read permitted" on public.inventory_stock_counts
  for select using (public.has_permission(organization_id, 'inventory.read'));

drop policy if exists "stock counts write permitted" on public.inventory_stock_counts;
create policy "stock counts write permitted" on public.inventory_stock_counts
  for all using (public.has_permission(organization_id, 'inventory.adjust'))
  with check (public.has_permission(organization_id, 'inventory.adjust'));

drop policy if exists "stock count lines read permitted" on public.inventory_stock_count_lines;
create policy "stock count lines read permitted" on public.inventory_stock_count_lines
  for select using (public.has_permission(organization_id, 'inventory.read'));

drop policy if exists "stock count lines write permitted" on public.inventory_stock_count_lines;
create policy "stock count lines write permitted" on public.inventory_stock_count_lines
  for all using (public.has_permission(organization_id, 'inventory.adjust'))
  with check (public.has_permission(organization_id, 'inventory.adjust'));

-- 0028 generated a site-restriction policy for every table that carried a mine_site_id at the time.
-- The count table carries one now, so it needs its own. The lines do not: they reach a site only
-- through their count, and the restriction on the count is what governs access to both.
drop policy if exists "site restriction" on public.inventory_stock_counts;
create policy "site restriction" on public.inventory_stock_counts
  as restrictive for all
  using (public.may_reach_site(organization_id, mine_site_id))
  with check (public.may_reach_site(organization_id, mine_site_id));

/**
 * A line cannot be changed once its count is applied.
 *
 * Without this, editing a counted quantity afterwards would rewrite the variance and leave it
 * disagreeing with the adjustment that was actually made — the record would say one thing happened
 * and the stock ledger another, with nothing to say which was right.
 *
 * The exception is apply_inventory_stock_count() itself, which has to write each line's book
 * quantity *after* marking the count applied — marking it first is what stops anything else editing
 * a line while the loop runs. It announces itself through a transaction-local setting, the same way
 * the equipment status trigger receives its reason. Transaction-local matters: the flag cannot
 * outlive the statement that set it, so it is not a switch anyone can leave on.
 */
create or replace function public.protect_applied_stock_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare count_status public.stock_count_status;
begin
  if current_setting('mantara.applying_stock_count', true)
     = coalesce(new.stock_count_id, old.stock_count_id)::text then
    return coalesce(new, old);
  end if;

  select status into count_status from public.inventory_stock_counts
  where id = coalesce(new.stock_count_id, old.stock_count_id);
  if count_status = 'applied' then
    raise exception 'That stock count has been applied and can no longer be changed'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end; $$;

drop trigger if exists protect_applied_stock_count on public.inventory_stock_count_lines;
create trigger protect_applied_stock_count
before insert or update or delete on public.inventory_stock_count_lines
for each row execute function public.protect_applied_stock_count();

revoke all on function public.protect_applied_stock_count() from public, anon, authenticated;

/**
 * Applies a stock count: reads each item's live balance, records it against what was counted, and
 * writes the correcting adjustments.
 *
 * Returns the number of lines that disagreed with the book — the count of findings, which is the
 * number worth putting in front of a person.
 *
 * Lines are processed in item order. Every other multi-row write in this schema locks in a fixed
 * order for the same reason: two counts applied at the same moment in two different stores can touch
 * the same items, and without an agreed order they can each hold what the other needs.
 */
create or replace function public.apply_inventory_stock_count(requested_count_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare target record; line record; findings integer := 0; book numeric; difference numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select id, organization_id, mine_site_id, inventory_location_id, status, counted_on
  into target
  from public.inventory_stock_counts where id = requested_count_id for update;
  if not found then raise exception 'Stock count not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'inventory.adjust') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.status <> 'draft' then
    raise exception 'That stock count is already %', target.status using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.inventory_stock_count_lines where stock_count_id = requested_count_id) then
    raise exception 'That stock count has no lines to apply' using errcode = 'P0001';
  end if;

  -- Mark it applied first. The trigger above then refuses any further edit to a line, so nothing can
  -- change underneath the loop that follows. The flag lets this function past its own guard, and
  -- being transaction-local it cannot outlive the call.
  perform set_config('mantara.applying_stock_count', requested_count_id::text, true);

  update public.inventory_stock_counts
  set status = 'applied', applied_at = now(), applied_by = auth.uid(), updated_by = auth.uid()
  where id = requested_count_id;

  for line in
    select l.id, l.inventory_item_id, l.counted_quantity
    from public.inventory_stock_count_lines l
    where l.stock_count_id = requested_count_id
    order by l.inventory_item_id
  loop
    -- The balance is read here, at apply time, not when the line was entered. Stock keeps moving
    -- while somebody walks the shelves; reading it earlier would turn a legitimate issue into a
    -- phantom variance and silently reverse it.
    insert into public.inventory_stock_balances
      (organization_id, inventory_item_id, inventory_location_id, quantity, updated_by)
    values (target.organization_id, line.inventory_item_id, target.inventory_location_id, 0, auth.uid())
    on conflict (inventory_item_id, inventory_location_id) do nothing;

    select quantity into book
    from public.inventory_stock_balances
    where inventory_item_id = line.inventory_item_id
      and inventory_location_id = target.inventory_location_id
    for update;

    update public.inventory_stock_count_lines
    set book_quantity = book
    where id = line.id;

    difference := line.counted_quantity - book;

    if difference <> 0 then
      findings := findings + 1;
      perform public.record_stock_adjustment(
        line.inventory_item_id,
        target.inventory_location_id,
        difference,
        'Stock count correction',
        'correction'::public.stock_movement_reason,
        target.counted_on,
        'Applied from stock count ' || requested_count_id
      );
    end if;
  end loop;

  perform set_config('mantara.applying_stock_count', '', true);
  return findings;
end; $$;

revoke all on function public.apply_inventory_stock_count(uuid) from public, anon;
grant execute on function public.apply_inventory_stock_count(uuid) to authenticated;

/**
 * Shrinkage by item over a period: what the counts found, totalled.
 *
 * A single negative variance is a miscount as often as a loss. The same item short in three counts
 * running is the thing worth acting on, and that is only visible once the findings are kept as
 * numbers and added up.
 */
create or replace function public.inventory_shrinkage(
  requested_site_id uuid,
  from_date date default current_date - 365,
  to_date date default current_date
) returns table (
  item_id uuid,
  item_name text,
  item_unit text,
  counts bigint,
  counted_total numeric,
  book_total numeric,
  variance_total numeric
) language plpgsql stable security definer set search_path = public as $$
declare owning_organization uuid;
begin
  owning_organization := public.assert_site_readable(requested_site_id, 'inventory.read');

  return query
  select
    item.id,
    item.name,
    item.unit,
    count(*)::bigint,
    sum(line.counted_quantity),
    sum(line.book_quantity),
    sum(line.variance_quantity)
  from public.inventory_stock_count_lines line
  join public.inventory_stock_counts stock_count
    on stock_count.id = line.stock_count_id
   and stock_count.status = 'applied'
   and stock_count.mine_site_id = requested_site_id
   and stock_count.counted_on between from_date and to_date
  join public.inventory_items item
    on item.id = line.inventory_item_id and item.deleted_at is null
  group by item.id, item.name, item.unit
  -- Worst shortfall first: the point of the report is the losses, not the tidy shelves.
  order by 7 asc nulls last;
end; $$;

revoke all on function public.inventory_shrinkage(uuid, date, date) from public, anon;
grant execute on function public.inventory_shrinkage(uuid, date, date) to authenticated;

-- Every create in this file is guarded, so the whole migration can be applied twice.
