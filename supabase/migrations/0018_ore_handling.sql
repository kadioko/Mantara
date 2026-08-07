-- Ore handling: ties mine output to bagging and dispatch to a processing plant.
-- Grade is deliberately stored in PPM, the field measure used at the mine. For gold, 1 PPM is
-- approximately 1 gram per tonne, but Mantara keeps the recorded laboratory value rather than
-- silently converting or estimating it.

create type public.ore_lot_status as enum ('bagged', 'in_transit', 'dispatched');
create type public.ore_dispatch_status as enum ('in_transit', 'received');

create table public.ore_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  shift_id uuid references public.shifts(id),
  lot_number text not null check (char_length(trim(lot_number)) between 2 and 80),
  produced_on date not null default current_date,
  source_location text,
  ore_tonnes numeric(14,3) not null check (ore_tonnes > 0),
  grade_ppm numeric(14,4) not null check (grade_ppm >= 0),
  grade_method text,
  bag_count integer not null check (bag_count > 0),
  bag_weight_kg numeric(12,3) not null check (bag_weight_kg > 0),
  bagged_weight_kg numeric(16,3) generated always as (bag_count * bag_weight_kg) stored,
  status public.ore_lot_status not null default 'bagged',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, lot_number),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, shift_id) references public.shifts(organization_id, id)
);

create table public.ore_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  ore_lot_id uuid not null references public.ore_lots(id),
  processing_plant text not null check (char_length(trim(processing_plant)) between 2 and 160),
  dispatched_on date not null default current_date,
  dispatched_tonnes numeric(14,3) not null check (dispatched_tonnes > 0),
  dispatched_bags integer not null check (dispatched_bags > 0),
  vehicle_reference text,
  dispatch_reference text,
  status public.ore_dispatch_status not null default 'in_transit',
  received_on date,
  receipt_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (received_on is null or received_on >= dispatched_on),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, ore_lot_id) references public.ore_lots(organization_id, id)
);

create index ore_lots_site_date_idx on public.ore_lots(organization_id, mine_site_id, produced_on desc);
create index ore_lots_site_status_idx on public.ore_lots(organization_id, mine_site_id, status);
create index ore_dispatches_lot_date_idx on public.ore_dispatches(ore_lot_id, dispatched_on desc);

create trigger ore_lots_updated_at before update on public.ore_lots for each row execute function public.set_updated_at();
create trigger ore_dispatches_updated_at before update on public.ore_dispatches for each row execute function public.set_updated_at();

-- Dispatching is a locked operation: concurrent dispatches cannot take more tonnes or bags than
-- the lot contains, and the API cannot forge a dispatch for a different organization or mine site.
create or replace function public.record_ore_dispatch(
  requested_lot_id uuid,
  requested_processing_plant text,
  requested_dispatched_on date,
  requested_tonnes numeric,
  requested_bags integer,
  requested_vehicle_reference text default null,
  requested_dispatch_reference text default null,
  requested_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_lot record;
  dispatched_tonnes_so_far numeric;
  dispatched_bags_so_far integer;
  new_dispatch_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if requested_tonnes is null or requested_tonnes <= 0 then raise exception 'Dispatched tonnes must be greater than zero' using errcode = 'P0001'; end if;
  if requested_bags is null or requested_bags <= 0 then raise exception 'Dispatched bags must be greater than zero' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(requested_processing_plant, ''))) < 2 then raise exception 'Name the processing plant' using errcode = 'P0001'; end if;

  select * into target_lot from public.ore_lots where id = requested_lot_id for update;
  if not found then raise exception 'Ore lot not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target_lot.organization_id, 'production.update') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if target_lot.status = 'dispatched' then raise exception 'This ore lot has already been fully dispatched' using errcode = 'P0001'; end if;

  select coalesce(sum(d.dispatched_tonnes), 0), coalesce(sum(d.dispatched_bags), 0)
  into dispatched_tonnes_so_far, dispatched_bags_so_far
  from public.ore_dispatches d where d.ore_lot_id = target_lot.id;

  if dispatched_tonnes_so_far + requested_tonnes > target_lot.ore_tonnes then
    raise exception 'Only % tonnes remain in this ore lot', target_lot.ore_tonnes - dispatched_tonnes_so_far using errcode = 'P0001';
  end if;
  if dispatched_bags_so_far + requested_bags > target_lot.bag_count then
    raise exception 'Only % bags remain in this ore lot', target_lot.bag_count - dispatched_bags_so_far using errcode = 'P0001';
  end if;

  insert into public.ore_dispatches (id, organization_id, mine_site_id, ore_lot_id, processing_plant, dispatched_on, dispatched_tonnes, dispatched_bags, vehicle_reference, dispatch_reference, notes, created_by, updated_by)
  values (new_dispatch_id, target_lot.organization_id, target_lot.mine_site_id, target_lot.id, trim(requested_processing_plant), requested_dispatched_on, requested_tonnes, requested_bags, nullif(trim(requested_vehicle_reference), ''), nullif(trim(requested_dispatch_reference), ''), nullif(trim(requested_notes), ''), auth.uid(), auth.uid());

  update public.ore_lots
  set status = case when dispatched_tonnes_so_far + requested_tonnes = ore_tonnes and dispatched_bags_so_far + requested_bags = bag_count then 'dispatched'::public.ore_lot_status else 'in_transit'::public.ore_lot_status end,
      updated_by = auth.uid()
  where id = target_lot.id;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (target_lot.organization_id, auth.uid(), 'ore.dispatched', 'ore_dispatch', new_dispatch_id,
    jsonb_build_object('lot_number', target_lot.lot_number, 'processing_plant', trim(requested_processing_plant), 'tonnes', requested_tonnes, 'bags', requested_bags));
  return new_dispatch_id;
end;
$$;

alter table public.ore_lots enable row level security;
alter table public.ore_dispatches enable row level security;

create policy "ore lots read permitted" on public.ore_lots for select using (public.has_permission(organization_id, 'production.read'));
create policy "ore lots create permitted" on public.ore_lots for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'production.create'));
create policy "ore dispatches read permitted" on public.ore_dispatches for select using (public.has_permission(organization_id, 'production.read'));

revoke all on function public.record_ore_dispatch(uuid, text, date, numeric, integer, text, text, text) from public, anon;
grant execute on function public.record_ore_dispatch(uuid, text, date, numeric, integer, text, text, text) to authenticated;
