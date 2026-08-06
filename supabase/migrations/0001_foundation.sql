-- Mantara OS foundation: identity, tenancy, permissions, mine sites, and RLS.
create extension if not exists pgcrypto;

create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.site_status as enum ('active', 'inactive', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text unique,
  country_code char(2) not null default 'TZ',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+\\.[a-z_]+$'),
  name text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z_]+$'),
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, code),
  unique (organization_id, id)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null,
  status public.membership_status not null default 'invited',
  invited_by uuid references public.profiles(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, user_id),
  foreign key (organization_id, role_id) references public.roles(organization_id, id)
);

create table public.mine_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  country_code char(2) not null default 'TZ',
  region text,
  district text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  status public.site_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (organization_id, name),
  unique (organization_id, id),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.profiles(id),
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index memberships_user_active_idx on public.organization_memberships(user_id, status);
create index mine_sites_organization_active_idx on public.mine_sites(organization_id) where deleted_at is null;
create index audit_logs_organization_created_idx on public.audit_logs(organization_id, created_at desc);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.organization_memberships for each row execute function public.set_updated_at();
create trigger mine_sites_updated_at before update on public.mine_sites for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', '')) on conflict (id) do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_org_member(requested_organization_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_memberships m where m.organization_id = requested_organization_id and m.user_id = auth.uid() and m.status = 'active');
$$;

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create or replace function public.has_permission(requested_organization_id uuid, requested_permission_code text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = requested_organization_id and m.user_id = auth.uid() and m.status = 'active'
      and (r.code = 'company_owner' or p.code = requested_permission_code)
  );
$$;

insert into public.permissions (code, name, description) values
  ('organization.read', 'View organization', 'View organization settings'),
  ('organization.update', 'Manage organization', 'Change organization settings'),
  ('site.create', 'Create sites', 'Add mine sites'),
  ('site.read', 'View sites', 'View mine sites'),
  ('site.update', 'Manage sites', 'Edit mine sites'),
  ('member.invite', 'Invite members', 'Invite organization users'),
  ('member.read', 'View members', 'View organization users'),
  ('member.update_role', 'Manage member roles', 'Change organization roles'),
  ('role.read', 'View roles', 'View roles and permissions'),
  ('role.manage', 'Manage roles', 'Manage custom roles'),
  ('audit_log.read', 'View audit logs', 'View organization audit history')
on conflict (code) do nothing;

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
    and ((r.code = 'mine_manager' and p.code in ('organization.read', 'site.read', 'site.create', 'site.update', 'member.read', 'worker.read', 'worker.create', 'worker.update'))
      or (r.code = 'site_supervisor' and p.code in ('site.read', 'worker.read', 'worker.create', 'worker.update')))
  on conflict do nothing;
  insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at, created_by, updated_by) values (org_id, auth.uid(), owner_role_id, 'active', now(), auth.uid(), auth.uid());
  insert into public.mine_sites (organization_id, name, country_code, created_by, updated_by) values (org_id, trim(initial_site_name), upper(initial_site_country), auth.uid(), auth.uid());
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values) values (org_id, auth.uid(), 'created', 'organization', org_id, jsonb_build_object('name', organization_name));
  return org_id;
end; $$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.mine_sites enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create policy "profiles read own" on public.profiles for select using (id = auth.uid());
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "organizations read member" on public.organizations for select using (public.is_org_member(id));
create policy "permissions read authenticated" on public.permissions for select to authenticated using (true);
create policy "roles read member" on public.roles for select using (public.is_org_member(organization_id));
create policy "role permissions read member" on public.role_permissions for select using (exists (select 1 from public.roles r where r.id = role_id and public.is_org_member(r.organization_id)));
create policy "memberships read member" on public.organization_memberships for select using (public.is_org_member(organization_id));
create policy "sites read member" on public.mine_sites for select using (public.is_org_member(organization_id) and deleted_at is null);
create policy "sites create permitted" on public.mine_sites for insert with check (public.has_permission(organization_id, 'site.create'));
create policy "sites update permitted" on public.mine_sites for update using (public.has_permission(organization_id, 'site.update')) with check (public.has_permission(organization_id, 'site.update'));
create policy "audit logs read permitted" on public.audit_logs for select using (public.has_permission(organization_id, 'audit_log.read'));
create policy "notifications read own" on public.notifications for select using (user_id = auth.uid());
create policy "notifications update own" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on function public.create_organization_with_owner(text, text, char) from public;
grant execute on function public.create_organization_with_owner(text, text, char) to authenticated;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;
