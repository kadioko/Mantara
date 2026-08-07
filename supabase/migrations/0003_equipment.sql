-- Equipment module: asset register, assignments, meter readings, status history, and documents.
create type public.equipment_status as enum ('operational', 'standby', 'maintenance', 'breakdown', 'retired');
create type public.equipment_category as enum ('excavator', 'loader', 'haul_truck', 'drill', 'crusher', 'generator', 'pump', 'light_vehicle', 'other');
create type public.meter_type as enum ('hours', 'kilometres');

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  asset_code text,
  name text not null check (char_length(trim(name)) between 2 and 160),
  category public.equipment_category not null default 'other',
  make text,
  model text,
  serial_number text,
  year_of_manufacture smallint check (year_of_manufacture is null or year_of_manufacture between 1900 and 2100),
  status public.equipment_status not null default 'operational',
  meter_type public.meter_type not null default 'hours',
  current_meter numeric(14,2) check (current_meter is null or current_meter >= 0),
  acquired_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (organization_id, asset_code),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  equipment_id uuid not null references public.equipment(id),
  worker_id uuid references public.workers(id),
  assignment_name text,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.equipment_meter_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  equipment_id uuid not null references public.equipment(id),
  reading_value numeric(14,2) not null check (reading_value >= 0),
  reading_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.equipment_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  equipment_id uuid not null references public.equipment(id),
  previous_status public.equipment_status,
  new_status public.equipment_status not null,
  reason text,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id)
);

create table public.equipment_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.equipment(id),
  document_name text not null,
  document_path text not null,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index equipment_organization_site_active_idx on public.equipment(organization_id, mine_site_id, name) where deleted_at is null;
create index equipment_status_idx on public.equipment(organization_id, status) where deleted_at is null;
create index equipment_meter_readings_equipment_idx on public.equipment_meter_readings(equipment_id, reading_at desc);
create index equipment_status_history_equipment_idx on public.equipment_status_history(equipment_id, changed_at desc);
create index equipment_assignments_equipment_idx on public.equipment_assignments(equipment_id, starts_on desc);
create index equipment_documents_expiry_idx on public.equipment_documents(organization_id, expires_on) where expires_on is not null;

create trigger equipment_updated_at before update on public.equipment for each row execute function public.set_updated_at();
create trigger equipment_assignments_updated_at before update on public.equipment_assignments for each row execute function public.set_updated_at();
create trigger equipment_meter_readings_updated_at before update on public.equipment_meter_readings for each row execute function public.set_updated_at();
create trigger equipment_documents_updated_at before update on public.equipment_documents for each row execute function public.set_updated_at();

-- Status history is written by the database so every write path produces an audit trail. The reason is
-- passed through a transaction-local setting because a trigger cannot otherwise see caller-supplied text.
create or replace function public.log_equipment_status_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.equipment_status_history (organization_id, mine_site_id, equipment_id, previous_status, new_status, reason, changed_by)
    values (new.organization_id, new.mine_site_id, new.id, old.status, new.status, nullif(current_setting('mantara.status_reason', true), ''), auth.uid());
  end if;
  return new;
end; $$;

create trigger equipment_status_history_log after update of status on public.equipment for each row execute function public.log_equipment_status_change();

-- Status changes go through this function so the reason reaches the trigger; a direct table update is
-- still permitted by RLS and still logged, just without a reason.
create or replace function public.set_equipment_status(
  requested_equipment_id uuid,
  requested_status public.equipment_status,
  reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id, organization_id into target
  from public.equipment where id = requested_equipment_id and deleted_at is null for update;
  if not found then raise exception 'Equipment not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'equipment.update') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  perform set_config('mantara.status_reason', coalesce(reason, ''), true);
  update public.equipment set status = requested_status, updated_by = auth.uid() where id = requested_equipment_id;
end; $$;

-- Meter readings must never move backwards. The row lock serializes concurrent submissions.
create or replace function public.record_equipment_meter_reading(
  requested_equipment_id uuid,
  reading numeric,
  reading_taken_at timestamptz default now(),
  reading_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare target record; new_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id, organization_id, mine_site_id, current_meter into target
  from public.equipment where id = requested_equipment_id and deleted_at is null for update;
  if not found then raise exception 'Equipment not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'equipment.update') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if reading is null or reading < 0 then
    raise exception 'A meter reading cannot be negative' using errcode = '22003';
  end if;
  if target.current_meter is not null and reading < target.current_meter then
    raise exception 'Meter reading % is below the recorded meter %', reading, target.current_meter using errcode = '22003';
  end if;
  insert into public.equipment_meter_readings (id, organization_id, mine_site_id, equipment_id, reading_value, reading_at, notes, created_by, updated_by)
  values (new_id, target.organization_id, target.mine_site_id, requested_equipment_id, reading, reading_taken_at, reading_notes, auth.uid(), auth.uid());
  update public.equipment set current_meter = reading, updated_by = auth.uid() where id = requested_equipment_id;
  return new_id;
end; $$;

insert into public.permissions (code, name, description) values
  ('equipment.read', 'View equipment', 'View the equipment register, meters, and history'),
  ('equipment.create', 'Create equipment', 'Add equipment to the register'),
  ('equipment.update', 'Manage equipment', 'Update equipment, record meters, and change status')
on conflict (code) do nothing;

-- Backfill the default role template for organizations that already exist.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where (
    (r.code in ('mine_manager', 'maintenance_officer') and p.code in ('equipment.read', 'equipment.create', 'equipment.update'))
    or (r.code = 'site_supervisor' and p.code in ('equipment.read', 'equipment.update'))
  )
on conflict do nothing;

-- Re-issued so newly created organizations receive the workforce and equipment defaults.
create or replace function public.create_organization_with_owner(organization_name text, initial_site_name text, initial_site_country char(2) default 'TZ') returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid := gen_random_uuid(); owner_role_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.organizations (id, name, country_code, created_by, updated_by) values (org_id, trim(organization_name), upper(initial_site_country), auth.uid(), auth.uid());
  insert into public.roles (id, organization_id, code, name, is_system, created_by, updated_by) values
    (owner_role_id, org_id, 'company_owner', 'Company owner', true, auth.uid(), auth.uid()),
    (gen_random_uuid(), org_id, 'mine_manager', 'Mine manager', true, auth.uid(), auth.uid()),
    (gen_random_uuid(), org_id, 'site_supervisor', 'Site supervisor', true, auth.uid(), auth.uid()),
    (gen_random_uuid(), org_id, 'accountant', 'Accountant', true, auth.uid(), auth.uid()),
    (gen_random_uuid(), org_id, 'storekeeper', 'Storekeeper', true, auth.uid(), auth.uid()),
    (gen_random_uuid(), org_id, 'maintenance_officer', 'Maintenance officer', true, auth.uid(), auth.uid()),
    (gen_random_uuid(), org_id, 'safety_officer', 'Safety officer', true, auth.uid(), auth.uid()),
    (gen_random_uuid(), org_id, 'viewer', 'Viewer', true, auth.uid(), auth.uid());
  insert into public.role_permissions (role_id, permission_id) select owner_role_id, id from public.permissions;
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.organization_id = org_id
    and ((r.code = 'mine_manager' and p.code in ('organization.read', 'site.read', 'site.create', 'site.update', 'member.read', 'worker.read', 'worker.create', 'worker.update', 'equipment.read', 'equipment.create', 'equipment.update'))
      or (r.code = 'site_supervisor' and p.code in ('site.read', 'worker.read', 'worker.create', 'worker.update', 'equipment.read', 'equipment.update'))
      or (r.code = 'maintenance_officer' and p.code in ('site.read', 'equipment.read', 'equipment.create', 'equipment.update')))
  on conflict do nothing;
  insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at, created_by, updated_by) values (org_id, auth.uid(), owner_role_id, 'active', now(), auth.uid(), auth.uid());
  insert into public.mine_sites (organization_id, name, country_code, created_by, updated_by) values (org_id, trim(initial_site_name), upper(initial_site_country), auth.uid(), auth.uid());
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values) values (org_id, auth.uid(), 'created', 'organization', org_id, jsonb_build_object('name', organization_name));
  return org_id;
end; $$;

alter table public.equipment enable row level security;
alter table public.equipment_assignments enable row level security;
alter table public.equipment_meter_readings enable row level security;
alter table public.equipment_status_history enable row level security;
alter table public.equipment_documents enable row level security;

create policy "equipment read permitted" on public.equipment for select using (deleted_at is null and public.has_permission(organization_id, 'equipment.read'));
create policy "equipment create permitted" on public.equipment for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'equipment.create'));
create policy "equipment update permitted" on public.equipment for update using (public.has_permission(organization_id, 'equipment.update')) with check (updated_by = auth.uid() and public.has_permission(organization_id, 'equipment.update'));
create policy "equipment assignments read permitted" on public.equipment_assignments for select using (public.has_permission(organization_id, 'equipment.read'));
create policy "equipment assignments write permitted" on public.equipment_assignments for all using (public.has_permission(organization_id, 'equipment.update')) with check (public.has_permission(organization_id, 'equipment.update'));
-- Meter readings and status history are intentionally read-only to clients: the only write paths are
-- record_equipment_meter_reading() and the status trigger, so the monotonic check and audit trail
-- cannot be bypassed by a direct insert.
create policy "equipment meter readings read permitted" on public.equipment_meter_readings for select using (public.has_permission(organization_id, 'equipment.read'));
create policy "equipment status history read permitted" on public.equipment_status_history for select using (public.has_permission(organization_id, 'equipment.read'));
create policy "equipment documents read permitted" on public.equipment_documents for select using (public.has_permission(organization_id, 'equipment.read'));
create policy "equipment documents write permitted" on public.equipment_documents for all using (public.has_permission(organization_id, 'equipment.update')) with check (public.has_permission(organization_id, 'equipment.update'));

revoke all on function public.record_equipment_meter_reading(uuid, numeric, timestamptz, text) from public;
grant execute on function public.record_equipment_meter_reading(uuid, numeric, timestamptz, text) to authenticated;
revoke all on function public.set_equipment_status(uuid, public.equipment_status, text) from public;
grant execute on function public.set_equipment_status(uuid, public.equipment_status, text) to authenticated;
revoke all on function public.create_organization_with_owner(text, text, char) from public;
grant execute on function public.create_organization_with_owner(text, text, char) to authenticated;
