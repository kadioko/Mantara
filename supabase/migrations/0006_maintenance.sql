-- Maintenance module: requests, work orders, parts, costs, and service schedules.
create type public.maintenance_priority as enum ('low', 'medium', 'high', 'critical');
create type public.maintenance_request_status as enum ('open', 'planned', 'closed', 'cancelled');
create type public.work_order_status as enum ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled');
create type public.maintenance_cost_type as enum ('labour', 'parts', 'contractor', 'other');

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  equipment_id uuid references public.equipment(id),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text,
  priority public.maintenance_priority not null default 'medium',
  status public.maintenance_request_status not null default 'open',
  reported_by_worker_id uuid references public.workers(id),
  reported_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, equipment_id) references public.equipment(organization_id, id)
);

create table public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  equipment_id uuid references public.equipment(id),
  request_id uuid references public.maintenance_requests(id),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text,
  priority public.maintenance_priority not null default 'medium',
  status public.work_order_status not null default 'planned',
  assigned_worker_id uuid references public.workers(id),
  scheduled_for date,
  started_at timestamptz,
  completed_at timestamptz,
  meter_at_service numeric(14,2) check (meter_at_service is null or meter_at_service >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, id),
  check (completed_at is null or started_at is null or completed_at >= started_at),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, equipment_id) references public.equipment(organization_id, id),
  foreign key (organization_id, request_id) references public.maintenance_requests(organization_id, id)
);

create table public.maintenance_parts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete cascade,
  part_name text not null check (char_length(trim(part_name)) between 2 and 160),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, work_order_id) references public.maintenance_work_orders(organization_id, id)
);

create table public.maintenance_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete cascade,
  cost_type public.maintenance_cost_type not null default 'other',
  amount numeric(16,2) not null check (amount >= 0),
  description text,
  incurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, work_order_id) references public.maintenance_work_orders(organization_id, id)
);

create table public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  equipment_id uuid not null references public.equipment(id),
  name text not null check (char_length(trim(name)) between 2 and 160),
  interval_meter numeric(14,2) check (interval_meter is null or interval_meter > 0),
  interval_days integer check (interval_days is null or interval_days > 0),
  last_service_meter numeric(14,2) check (last_service_meter is null or last_service_meter >= 0),
  last_service_on date,
  next_due_meter numeric(14,2) check (next_due_meter is null or next_due_meter >= 0),
  next_due_on date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  -- A schedule with neither interval can never come due, so it would be silently useless.
  check (interval_meter is not null or interval_days is not null),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, equipment_id) references public.equipment(organization_id, id)
);

create index maintenance_requests_open_idx on public.maintenance_requests(organization_id, mine_site_id, reported_on desc) where status = 'open';
create index maintenance_work_orders_site_idx on public.maintenance_work_orders(organization_id, mine_site_id, scheduled_for desc);
create index maintenance_work_orders_open_idx on public.maintenance_work_orders(organization_id, status) where status in ('planned', 'in_progress', 'on_hold');
create index maintenance_work_orders_equipment_idx on public.maintenance_work_orders(equipment_id, created_at desc);
create index maintenance_parts_order_idx on public.maintenance_parts(work_order_id);
create index maintenance_costs_order_idx on public.maintenance_costs(work_order_id);
create index maintenance_schedules_due_idx on public.maintenance_schedules(organization_id, next_due_on) where is_active;

create trigger maintenance_requests_updated_at before update on public.maintenance_requests for each row execute function public.set_updated_at();
create trigger maintenance_work_orders_updated_at before update on public.maintenance_work_orders for each row execute function public.set_updated_at();
create trigger maintenance_parts_updated_at before update on public.maintenance_parts for each row execute function public.set_updated_at();
create trigger maintenance_costs_updated_at before update on public.maintenance_costs for each row execute function public.set_updated_at();
create trigger maintenance_schedules_updated_at before update on public.maintenance_schedules for each row execute function public.set_updated_at();

-- Work-order lifecycle is enforced in the database, and the timestamps are stamped rather than trusted
-- from the client so "when did this job start and finish" stays reliable.
create or replace function public.validate_work_order_transition() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'planned' and new.status in ('in_progress', 'cancelled'))
    or (old.status = 'in_progress' and new.status in ('on_hold', 'completed', 'cancelled'))
    or (old.status = 'on_hold' and new.status in ('in_progress', 'cancelled'))
  ) then
    raise exception 'Cannot move a work order from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'in_progress' and new.started_at is null then new.started_at = now(); end if;
  if new.status = 'completed' then new.completed_at = now(); end if;
  return new;
end; $$;

create trigger maintenance_work_orders_transition before update of status on public.maintenance_work_orders for each row execute function public.validate_work_order_transition();

-- Closing a work order rolls its service point onto the schedule so the next due figures stay current.
create or replace function public.complete_work_order(
  requested_work_order_id uuid,
  service_meter numeric default null,
  completion_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id, organization_id, equipment_id, status into target
  from public.maintenance_work_orders where id = requested_work_order_id for update;
  if not found then raise exception 'Work order not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'maintenance.update') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.status <> 'in_progress' then
    raise exception 'Only a work order that is in progress can be completed; this one is %', target.status using errcode = 'P0001';
  end if;
  update public.maintenance_work_orders
  set status = 'completed',
      meter_at_service = coalesce(service_meter, meter_at_service),
      notes = coalesce(completion_notes, notes),
      updated_by = auth.uid()
  where id = requested_work_order_id;

  if target.equipment_id is not null then
    update public.maintenance_schedules s
    set last_service_on = current_date,
        last_service_meter = coalesce(service_meter, s.last_service_meter),
        next_due_on = case when s.interval_days is null then s.next_due_on else current_date + s.interval_days end,
        next_due_meter = case
          when s.interval_meter is null or coalesce(service_meter, s.last_service_meter) is null then s.next_due_meter
          else coalesce(service_meter, s.last_service_meter) + s.interval_meter end,
        updated_by = auth.uid()
    where s.equipment_id = target.equipment_id and s.organization_id = target.organization_id and s.is_active;
  end if;
end; $$;

insert into public.permissions (code, name, description) values
  ('maintenance.read', 'View maintenance', 'View maintenance requests, work orders, and schedules'),
  ('maintenance.create', 'Raise maintenance', 'Raise maintenance requests and work orders'),
  ('maintenance.update', 'Manage maintenance', 'Update work orders, parts, costs, and schedules')
on conflict (code) do nothing;

insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager', 'maintenance.read'),
  ('mine_manager', 'maintenance.create'),
  ('mine_manager', 'maintenance.update'),
  ('maintenance_officer', 'maintenance.read'),
  ('maintenance_officer', 'maintenance.create'),
  ('maintenance_officer', 'maintenance.update'),
  ('site_supervisor', 'maintenance.read'),
  ('site_supervisor', 'maintenance.create'),
  ('accountant', 'maintenance.read')
on conflict do nothing;

select public.sync_role_permission_defaults();

alter table public.maintenance_requests enable row level security;
alter table public.maintenance_work_orders enable row level security;
alter table public.maintenance_parts enable row level security;
alter table public.maintenance_costs enable row level security;
alter table public.maintenance_schedules enable row level security;

create policy "maintenance requests read permitted" on public.maintenance_requests for select using (public.has_permission(organization_id, 'maintenance.read'));
create policy "maintenance requests create permitted" on public.maintenance_requests for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'maintenance.create'));
create policy "maintenance requests update permitted" on public.maintenance_requests for update using (public.has_permission(organization_id, 'maintenance.update')) with check (public.has_permission(organization_id, 'maintenance.update'));
create policy "work orders read permitted" on public.maintenance_work_orders for select using (public.has_permission(organization_id, 'maintenance.read'));
create policy "work orders create permitted" on public.maintenance_work_orders for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'maintenance.create'));
create policy "work orders update permitted" on public.maintenance_work_orders for update using (public.has_permission(organization_id, 'maintenance.update')) with check (public.has_permission(organization_id, 'maintenance.update'));
create policy "maintenance parts read permitted" on public.maintenance_parts for select using (public.has_permission(organization_id, 'maintenance.read'));
create policy "maintenance parts write permitted" on public.maintenance_parts for all using (public.has_permission(organization_id, 'maintenance.update')) with check (public.has_permission(organization_id, 'maintenance.update'));
create policy "maintenance costs read permitted" on public.maintenance_costs for select using (public.has_permission(organization_id, 'maintenance.read'));
create policy "maintenance costs write permitted" on public.maintenance_costs for all using (public.has_permission(organization_id, 'maintenance.update')) with check (public.has_permission(organization_id, 'maintenance.update'));
create policy "maintenance schedules read permitted" on public.maintenance_schedules for select using (public.has_permission(organization_id, 'maintenance.read'));
create policy "maintenance schedules write permitted" on public.maintenance_schedules for all using (public.has_permission(organization_id, 'maintenance.update')) with check (public.has_permission(organization_id, 'maintenance.update'));

revoke all on function public.complete_work_order(uuid, numeric, text) from public;
grant execute on function public.complete_work_order(uuid, numeric, text) to authenticated;
