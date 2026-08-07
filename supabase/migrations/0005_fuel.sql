-- Fuel module: storage locations with a transactionally maintained balance, plus receipts, issues,
-- and adjustments. Every movement goes through a function that locks the storage row, so concurrent
-- issues cannot drive a tank negative.
create type public.fuel_type as enum ('diesel', 'petrol', 'kerosene', 'lubricant');

create table public.fuel_storage_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  fuel_type public.fuel_type not null default 'diesel',
  capacity_litres numeric(14,3) check (capacity_litres is null or capacity_litres > 0),
  current_balance_litres numeric(14,3) not null default 0 check (current_balance_litres >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (mine_site_id, name),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.fuel_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  storage_location_id uuid not null references public.fuel_storage_locations(id),
  litres numeric(14,3) not null check (litres > 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  supplier text,
  reference text,
  received_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, storage_location_id) references public.fuel_storage_locations(organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.fuel_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  storage_location_id uuid not null references public.fuel_storage_locations(id),
  equipment_id uuid references public.equipment(id),
  worker_id uuid references public.workers(id),
  litres numeric(14,3) not null check (litres > 0),
  equipment_meter numeric(14,2) check (equipment_meter is null or equipment_meter >= 0),
  issued_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, storage_location_id) references public.fuel_storage_locations(organization_id, id),
  foreign key (organization_id, equipment_id) references public.equipment(organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.fuel_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  storage_location_id uuid not null references public.fuel_storage_locations(id),
  litres_delta numeric(14,3) not null check (litres_delta <> 0),
  reason text not null check (char_length(trim(reason)) between 2 and 200),
  adjusted_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, storage_location_id) references public.fuel_storage_locations(organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create index fuel_locations_site_idx on public.fuel_storage_locations(organization_id, mine_site_id) where is_active;
create index fuel_receipts_location_idx on public.fuel_receipts(storage_location_id, received_on desc);
create index fuel_issues_location_idx on public.fuel_issues(storage_location_id, issued_on desc);
create index fuel_issues_equipment_idx on public.fuel_issues(equipment_id, issued_on desc) where equipment_id is not null;
create index fuel_adjustments_location_idx on public.fuel_adjustments(storage_location_id, adjusted_on desc);

create trigger fuel_storage_locations_updated_at before update on public.fuel_storage_locations for each row execute function public.set_updated_at();
create trigger fuel_receipts_updated_at before update on public.fuel_receipts for each row execute function public.set_updated_at();
create trigger fuel_issues_updated_at before update on public.fuel_issues for each row execute function public.set_updated_at();
create trigger fuel_adjustments_updated_at before update on public.fuel_adjustments for each row execute function public.set_updated_at();

-- Locks the storage row, checks permission, and confirms the resulting balance stays within bounds.
-- Every fuel movement funnels through here so the balance can never be updated without its check.
-- OUT parameters are deliberately prefixed so they cannot collide with the column names referenced below.
create or replace function public.apply_fuel_movement(
  requested_location_id uuid,
  delta numeric,
  required_permission text,
  out movement_organization_id uuid,
  out movement_mine_site_id uuid
) language plpgsql security definer set search_path = public as $$
declare target record; new_balance numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id, organization_id, mine_site_id, current_balance_litres, capacity_litres, is_active
  into target
  from public.fuel_storage_locations where id = requested_location_id for update;
  if not found then raise exception 'Fuel storage location not found' using errcode = 'P0002'; end if;
  if not target.is_active then raise exception 'That fuel store is no longer active' using errcode = 'P0001'; end if;
  if not public.has_permission(target.organization_id, required_permission) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  new_balance := target.current_balance_litres + delta;
  if new_balance < 0 then
    raise exception 'Only % litres remain; that movement would leave %', target.current_balance_litres, new_balance using errcode = 'P0001';
  end if;
  if target.capacity_litres is not null and new_balance > target.capacity_litres then
    raise exception 'That movement would exceed the % litre capacity', target.capacity_litres using errcode = 'P0001';
  end if;
  update public.fuel_storage_locations
  set current_balance_litres = new_balance, updated_by = auth.uid()
  where id = requested_location_id;
  movement_organization_id := target.organization_id;
  movement_mine_site_id := target.mine_site_id;
end; $$;

create or replace function public.record_fuel_receipt(
  requested_location_id uuid,
  litres numeric,
  supplier text default null,
  reference text default null,
  unit_cost numeric default null,
  received_on date default current_date,
  receipt_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_site uuid; new_id uuid := gen_random_uuid();
begin
  if litres is null or litres <= 0 then raise exception 'Enter a delivery greater than zero litres' using errcode = 'P0001'; end if;
  select m.movement_organization_id, m.movement_mine_site_id into v_org, v_site
  from public.apply_fuel_movement(requested_location_id, litres, 'fuel.receive') m;
  insert into public.fuel_receipts (id, organization_id, mine_site_id, storage_location_id, litres, unit_cost, supplier, reference, received_on, notes, created_by, updated_by)
  values (new_id, v_org, v_site, requested_location_id, litres, unit_cost, supplier, reference, received_on, receipt_notes, auth.uid(), auth.uid());
  return new_id;
end; $$;

create or replace function public.record_fuel_issue(
  requested_location_id uuid,
  litres numeric,
  requested_equipment_id uuid default null,
  requested_worker_id uuid default null,
  equipment_meter numeric default null,
  issued_on date default current_date,
  issue_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_site uuid; new_id uuid := gen_random_uuid();
begin
  if litres is null or litres <= 0 then raise exception 'Enter an issue greater than zero litres' using errcode = 'P0001'; end if;
  select m.movement_organization_id, m.movement_mine_site_id into v_org, v_site
  from public.apply_fuel_movement(requested_location_id, -litres, 'fuel.issue') m;
  insert into public.fuel_issues (id, organization_id, mine_site_id, storage_location_id, equipment_id, worker_id, litres, equipment_meter, issued_on, notes, created_by, updated_by)
  values (new_id, v_org, v_site, requested_location_id, requested_equipment_id, requested_worker_id, litres, equipment_meter, issued_on, issue_notes, auth.uid(), auth.uid());
  return new_id;
end; $$;

create or replace function public.record_fuel_adjustment(
  requested_location_id uuid,
  litres_delta numeric,
  reason text,
  adjusted_on date default current_date,
  adjustment_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_site uuid; new_id uuid := gen_random_uuid();
begin
  if litres_delta is null or litres_delta = 0 then raise exception 'An adjustment cannot be zero litres' using errcode = 'P0001'; end if;
  select m.movement_organization_id, m.movement_mine_site_id into v_org, v_site
  from public.apply_fuel_movement(requested_location_id, litres_delta, 'fuel.adjust') m;
  insert into public.fuel_adjustments (id, organization_id, mine_site_id, storage_location_id, litres_delta, reason, adjusted_on, notes, created_by, updated_by)
  values (new_id, v_org, v_site, requested_location_id, litres_delta, reason, adjusted_on, adjustment_notes, auth.uid(), auth.uid());
  return new_id;
end; $$;

insert into public.permissions (code, name, description) values
  ('fuel.read', 'View fuel', 'View fuel stores, balances, and movements'),
  ('fuel.manage', 'Manage fuel stores', 'Create and edit fuel storage locations'),
  ('fuel.receive', 'Receive fuel', 'Record fuel deliveries into a store'),
  ('fuel.issue', 'Issue fuel', 'Record fuel issued to equipment and workers'),
  ('fuel.adjust', 'Adjust fuel', 'Record fuel stock corrections')
on conflict (code) do nothing;

insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager', 'fuel.read'),
  ('mine_manager', 'fuel.manage'),
  ('mine_manager', 'fuel.receive'),
  ('mine_manager', 'fuel.issue'),
  ('mine_manager', 'fuel.adjust'),
  ('storekeeper', 'fuel.read'),
  ('storekeeper', 'fuel.receive'),
  ('storekeeper', 'fuel.issue'),
  ('storekeeper', 'fuel.adjust'),
  ('site_supervisor', 'fuel.read'),
  ('site_supervisor', 'fuel.issue'),
  ('accountant', 'fuel.read')
on conflict do nothing;

select public.sync_role_permission_defaults();

alter table public.fuel_storage_locations enable row level security;
alter table public.fuel_receipts enable row level security;
alter table public.fuel_issues enable row level security;
alter table public.fuel_adjustments enable row level security;

create policy "fuel locations read permitted" on public.fuel_storage_locations for select using (public.has_permission(organization_id, 'fuel.read'));
create policy "fuel locations create permitted" on public.fuel_storage_locations for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'fuel.manage'));
create policy "fuel locations update permitted" on public.fuel_storage_locations for update using (public.has_permission(organization_id, 'fuel.manage')) with check (public.has_permission(organization_id, 'fuel.manage'));

-- Movement tables are read-only to clients. record_fuel_receipt/issue/adjustment are the only writers,
-- so a movement can never be recorded without the locked balance check that accompanies it.
create policy "fuel receipts read permitted" on public.fuel_receipts for select using (public.has_permission(organization_id, 'fuel.read'));
create policy "fuel issues read permitted" on public.fuel_issues for select using (public.has_permission(organization_id, 'fuel.read'));
create policy "fuel adjustments read permitted" on public.fuel_adjustments for select using (public.has_permission(organization_id, 'fuel.read'));

-- apply_fuel_movement is an internal helper: the three recording functions call it, clients never do.
revoke all on function public.apply_fuel_movement(uuid, numeric, text) from public;
revoke all on function public.record_fuel_receipt(uuid, numeric, text, text, numeric, date, text) from public;
grant execute on function public.record_fuel_receipt(uuid, numeric, text, text, numeric, date, text) to authenticated;
revoke all on function public.record_fuel_issue(uuid, numeric, uuid, uuid, numeric, date, text) from public;
grant execute on function public.record_fuel_issue(uuid, numeric, uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.record_fuel_adjustment(uuid, numeric, text, date, text) from public;
grant execute on function public.record_fuel_adjustment(uuid, numeric, text, date, text) to authenticated;
