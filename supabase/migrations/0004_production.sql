-- Production module: shifts, production capture, approval lifecycle, and downtime.
-- Also replaces the hand-maintained role defaults inside create_organization_with_owner with a table, so
-- new organizations and the backfill for existing ones can no longer drift apart.

create table public.role_permission_defaults (
  role_code text not null check (role_code ~ '^[a-z_]+$'),
  permission_code text not null references public.permissions(code) on update cascade on delete cascade,
  primary key (role_code, permission_code)
);

alter table public.role_permission_defaults enable row level security;
create policy "role permission defaults read authenticated" on public.role_permission_defaults for select to authenticated using (true);

insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager', 'organization.read'),
  ('mine_manager', 'site.read'),
  ('mine_manager', 'site.create'),
  ('mine_manager', 'site.update'),
  ('mine_manager', 'member.read'),
  ('mine_manager', 'worker.read'),
  ('mine_manager', 'worker.create'),
  ('mine_manager', 'worker.update'),
  ('mine_manager', 'equipment.read'),
  ('mine_manager', 'equipment.create'),
  ('mine_manager', 'equipment.update'),
  ('site_supervisor', 'site.read'),
  ('site_supervisor', 'worker.read'),
  ('site_supervisor', 'worker.create'),
  ('site_supervisor', 'worker.update'),
  ('site_supervisor', 'equipment.read'),
  ('site_supervisor', 'equipment.update'),
  ('maintenance_officer', 'site.read'),
  ('maintenance_officer', 'equipment.read'),
  ('maintenance_officer', 'equipment.create'),
  ('maintenance_officer', 'equipment.update')
on conflict do nothing;

-- Grants every organization's system roles whatever the defaults table currently says.
create or replace function public.sync_role_permission_defaults() returns void language plpgsql security definer set search_path = public as $$
begin
  -- Owners keep every permission, including ones added by later migrations.
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p where r.code = 'company_owner'
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.role_permission_defaults d on d.role_code = r.code
  join public.permissions p on p.code = d.permission_code
  on conflict do nothing;
end; $$;

create type public.shift_status as enum ('planned', 'active', 'closed');
create type public.production_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.approval_decision as enum ('approved', 'rejected');

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  name text not null check (char_length(trim(name)) between 2 and 80),
  shift_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  supervisor_worker_id uuid references public.workers(id),
  status public.shift_status not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (mine_site_id, shift_date, name),
  unique (organization_id, id),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  worker_id uuid not null references public.workers(id),
  role_note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (shift_id, worker_id),
  foreign key (organization_id, shift_id) references public.shifts(organization_id, id)
);

create table public.production_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  shift_id uuid references public.shifts(id),
  entry_date date not null default current_date,
  material text not null check (char_length(trim(material)) between 2 and 120),
  quantity numeric(14,3) not null check (quantity >= 0),
  unit text not null default 'tonnes' check (char_length(trim(unit)) between 1 and 20),
  grade numeric(12,4) check (grade is null or grade >= 0),
  location text,
  status public.production_status not null default 'draft',
  notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, shift_id) references public.shifts(organization_id, id)
);

create table public.production_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  production_entry_id uuid not null references public.production_entries(id) on delete cascade,
  decision public.approval_decision not null,
  notes text,
  decided_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  foreign key (organization_id, production_entry_id) references public.production_entries(organization_id, id)
);

create table public.downtime_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  shift_id uuid references public.shifts(id),
  equipment_id uuid references public.equipment(id),
  reason text not null check (char_length(trim(reason)) between 2 and 200),
  minutes integer not null check (minutes > 0 and minutes <= 44640),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, equipment_id) references public.equipment(organization_id, id)
);

create index shifts_site_date_idx on public.shifts(organization_id, mine_site_id, shift_date desc);
create index production_entries_site_date_idx on public.production_entries(organization_id, mine_site_id, entry_date desc);
create index production_entries_status_idx on public.production_entries(organization_id, status) where status = 'submitted';
create index production_approvals_entry_idx on public.production_approvals(production_entry_id, decided_at desc);
create index downtime_site_idx on public.downtime_records(organization_id, mine_site_id, created_at desc);

create trigger shifts_updated_at before update on public.shifts for each row execute function public.set_updated_at();
create trigger production_entries_updated_at before update on public.production_entries for each row execute function public.set_updated_at();
create trigger downtime_records_updated_at before update on public.downtime_records for each row execute function public.set_updated_at();

-- The approval lifecycle is enforced in the database so no write path can skip a state.
create or replace function public.validate_production_transition() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status in ('approved', 'rejected'))
    or (old.status = 'rejected' and new.status = 'draft')
  ) then
    raise exception 'Cannot move a production entry from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'submitted' then new.submitted_at = now(); end if;
  return new;
end; $$;

create trigger production_entries_transition before update of status on public.production_entries for each row execute function public.validate_production_transition();

-- Approved entries are a financial record, so their figures are frozen once the decision is made.
create or replace function public.block_approved_production_edit() returns trigger language plpgsql as $$
begin
  if old.status = 'approved' and new.status = 'approved'
     and (new.quantity is distinct from old.quantity
       or new.material is distinct from old.material
       or new.grade is distinct from old.grade
       or new.entry_date is distinct from old.entry_date
       or new.unit is distinct from old.unit) then
    raise exception 'An approved production entry cannot be edited' using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger production_entries_freeze before update on public.production_entries for each row execute function public.block_approved_production_edit();

-- Records the decision and moves the entry in one transaction; the row lock stops a double review.
create or replace function public.review_production_entry(
  requested_entry_id uuid,
  decision public.approval_decision,
  review_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id, organization_id, status into target
  from public.production_entries where id = requested_entry_id for update;
  if not found then raise exception 'Production entry not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'production.approve') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.status <> 'submitted' then
    raise exception 'Only a submitted entry can be reviewed; this one is %', target.status using errcode = 'P0001';
  end if;
  insert into public.production_approvals (organization_id, production_entry_id, decision, notes, decided_by)
  values (target.organization_id, requested_entry_id, decision, review_notes, auth.uid());
  update public.production_entries
  set status = decision::text::public.production_status, updated_by = auth.uid()
  where id = requested_entry_id;
end; $$;

insert into public.permissions (code, name, description) values
  ('production.read', 'View production', 'View shifts, production entries, and downtime'),
  ('production.create', 'Capture production', 'Record shifts, production entries, and downtime'),
  ('production.update', 'Manage production', 'Edit and submit production entries'),
  ('production.approve', 'Approve production', 'Approve or reject submitted production entries')
on conflict (code) do nothing;

insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager', 'production.read'),
  ('mine_manager', 'production.create'),
  ('mine_manager', 'production.update'),
  ('mine_manager', 'production.approve'),
  ('site_supervisor', 'production.read'),
  ('site_supervisor', 'production.create'),
  ('site_supervisor', 'production.update'),
  ('accountant', 'production.read')
on conflict do nothing;

select public.sync_role_permission_defaults();

-- Now reads the defaults table instead of an inline list that has to be edited every migration.
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
  join public.role_permission_defaults d on d.role_code = r.code
  join public.permissions p on p.code = d.permission_code
  where r.organization_id = org_id
  on conflict do nothing;
  insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at, created_by, updated_by) values (org_id, auth.uid(), owner_role_id, 'active', now(), auth.uid(), auth.uid());
  insert into public.mine_sites (organization_id, name, country_code, created_by, updated_by) values (org_id, trim(initial_site_name), upper(initial_site_country), auth.uid(), auth.uid());
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values) values (org_id, auth.uid(), 'created', 'organization', org_id, jsonb_build_object('name', organization_name));
  return org_id;
end; $$;

alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.production_entries enable row level security;
alter table public.production_approvals enable row level security;
alter table public.downtime_records enable row level security;

create policy "shifts read permitted" on public.shifts for select using (public.has_permission(organization_id, 'production.read'));
create policy "shifts create permitted" on public.shifts for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'production.create'));
create policy "shifts update permitted" on public.shifts for update using (public.has_permission(organization_id, 'production.update')) with check (public.has_permission(organization_id, 'production.update'));
create policy "shift assignments read permitted" on public.shift_assignments for select using (public.has_permission(organization_id, 'production.read'));
create policy "shift assignments write permitted" on public.shift_assignments for all using (public.has_permission(organization_id, 'production.update')) with check (public.has_permission(organization_id, 'production.update'));
create policy "production read permitted" on public.production_entries for select using (public.has_permission(organization_id, 'production.read'));
create policy "production create permitted" on public.production_entries for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'production.create'));
create policy "production update permitted" on public.production_entries for update using (public.has_permission(organization_id, 'production.update')) with check (updated_by = auth.uid() and public.has_permission(organization_id, 'production.update'));
create policy "downtime read permitted" on public.downtime_records for select using (public.has_permission(organization_id, 'production.read'));
create policy "downtime write permitted" on public.downtime_records for all using (public.has_permission(organization_id, 'production.create')) with check (public.has_permission(organization_id, 'production.create'));

-- Approvals are read-only to clients; review_production_entry() is the only way to create one, so a
-- decision cannot be recorded without the status check and the lock that go with it.
create policy "production approvals read permitted" on public.production_approvals for select using (public.has_permission(organization_id, 'production.read'));

revoke all on function public.review_production_entry(uuid, public.approval_decision, text) from public;
grant execute on function public.review_production_entry(uuid, public.approval_decision, text) to authenticated;
revoke all on function public.sync_role_permission_defaults() from public;
revoke all on function public.create_organization_with_owner(text, text, char) from public;
grant execute on function public.create_organization_with_owner(text, text, char) to authenticated;
