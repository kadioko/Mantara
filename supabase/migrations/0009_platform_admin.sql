-- Platform administration: a support and operations role for the people who run Mantara itself.
--
-- The blueprint is explicit that this role is "platform support/administration only; not implicit
-- access to tenant records", and that is the design here. Platform admin is a separate axis from
-- tenancy: it is NOT a permission, NOT a role inside an organization, and it deliberately grants no
-- read path to any operational table. Tenant data stays reachable only through organization
-- membership, so tenant isolation still holds for anyone holding this role.
--
-- Platform admins therefore see organization metadata and counts, served by security-definer
-- functions that never return tenant rows. Where they need to act — suspending an organization,
-- managing other admins — the action goes through a function that records it in an append-only log.

create table public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  note text,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id)
);

create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_logs_created_idx on public.platform_audit_logs(created_at desc);
create index platform_admins_active_idx on public.platform_admins(user_id) where revoked_at is null;

alter table public.organizations
  add column suspended_at timestamptz,
  add column suspended_by uuid references public.profiles(id),
  add column suspension_reason text;

create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = auth.uid() and a.revoked_at is null
  );
$$;

-- Suspension makes an organization read-only rather than invisible: its people can still see their
-- records, but nothing new can be written. Enforcing it inside has_permission means every policy in
-- every module inherits the rule, instead of each table needing to remember it.
create or replace function public.has_permission(requested_organization_id uuid, requested_permission_code text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = requested_organization_id and m.user_id = auth.uid() and m.status = 'active'
      and (r.code = 'company_owner' or p.code = requested_permission_code)
      and (o.suspended_at is null or requested_permission_code like '%.read')
  );
$$;

-- Metadata and counts only. Nothing here returns a tenant's operational rows.
create or replace function public.platform_organizations()
returns table (
  id uuid,
  name text,
  country_code char(2),
  created_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  member_count bigint,
  site_count bigint
) language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.country_code, o.created_at, o.suspended_at, o.suspension_reason,
    (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.status = 'active'),
    (select count(*) from public.mine_sites s where s.organization_id = o.id and s.deleted_at is null)
  from public.organizations o
  where public.is_platform_admin() and o.deleted_at is null
  order by o.created_at desc;
$$;

create or replace function public.platform_stats()
returns table (organizations bigint, suspended bigint, users bigint, sites bigint, admins bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.organizations where deleted_at is null),
    (select count(*) from public.organizations where deleted_at is null and suspended_at is not null),
    (select count(*) from public.profiles),
    (select count(*) from public.mine_sites where deleted_at is null),
    (select count(*) from public.platform_admins where revoked_at is null)
  where public.is_platform_admin();
$$;

create or replace function public.platform_admin_list()
returns table (user_id uuid, email text, full_name text, granted_at timestamptz, granted_by_name text)
language sql stable security definer set search_path = public as $$
  select a.user_id, u.email, p.full_name, a.granted_at, g.full_name
  from public.platform_admins a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  left join public.profiles g on g.id = a.granted_by
  where public.is_platform_admin() and a.revoked_at is null
  order by a.granted_at;
$$;

create or replace function public.platform_set_organization_suspended(
  requested_organization_id uuid,
  suspend boolean,
  reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if not public.is_platform_admin() then raise exception 'Permission denied' using errcode = '42501'; end if;
  select id, name, suspended_at into target
  from public.organizations where id = requested_organization_id and deleted_at is null for update;
  if not found then raise exception 'Organization not found' using errcode = 'P0002'; end if;

  if suspend then
    update public.organizations
    set suspended_at = coalesce(suspended_at, now()), suspended_by = auth.uid(), suspension_reason = reason
    where id = requested_organization_id;
  else
    update public.organizations
    set suspended_at = null, suspended_by = null, suspension_reason = null
    where id = requested_organization_id;
  end if;

  insert into public.platform_audit_logs (actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), case when suspend then 'organization.suspended' else 'organization.restored' end,
          'organization', requested_organization_id,
          jsonb_build_object('name', target.name, 'reason', reason));
end; $$;

create or replace function public.platform_grant_admin(target_email text, admin_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Permission denied' using errcode = '42501'; end if;
  select id into target_id from auth.users where lower(email) = lower(trim(target_email));
  if target_id is null then raise exception 'No user exists with that email address' using errcode = 'P0002'; end if;

  insert into public.platform_admins (user_id, note, granted_by)
  values (target_id, admin_note, auth.uid())
  on conflict (user_id) do update
    set revoked_at = null, revoked_by = null, granted_at = now(), granted_by = auth.uid(), note = excluded.note;

  insert into public.platform_audit_logs (actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'platform_admin.granted', 'user', target_id, jsonb_build_object('email', target_email));
  return target_id;
end; $$;

create or replace function public.platform_revoke_admin(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare remaining integer;
begin
  if not public.is_platform_admin() then raise exception 'Permission denied' using errcode = '42501'; end if;
  -- Revoking the last administrator would lock everyone out of platform administration entirely,
  -- and there is no self-service way back in.
  select count(*) into remaining from public.platform_admins where revoked_at is null and user_id <> target_user_id;
  if remaining = 0 then
    raise exception 'At least one platform administrator must remain' using errcode = 'P0001';
  end if;

  update public.platform_admins
  set revoked_at = now(), revoked_by = auth.uid()
  where user_id = target_user_id and revoked_at is null;

  insert into public.platform_audit_logs (actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'platform_admin.revoked', 'user', target_user_id, '{}'::jsonb);
end; $$;

alter table public.platform_admins enable row level security;
alter table public.platform_audit_logs enable row level security;

-- Read-only to clients, and only for platform admins. Every write goes through the functions above so
-- that granting, revoking, and suspending cannot happen without an audit row.
create policy "platform admins readable by platform admins" on public.platform_admins for select using (public.is_platform_admin());
create policy "platform audit readable by platform admins" on public.platform_audit_logs for select using (public.is_platform_admin());

revoke all on function public.platform_organizations() from public;
revoke all on function public.platform_stats() from public;
revoke all on function public.platform_admin_list() from public;
revoke all on function public.platform_set_organization_suspended(uuid, boolean, text) from public;
revoke all on function public.platform_grant_admin(text, text) from public;
revoke all on function public.platform_revoke_admin(uuid) from public;
grant execute on function public.platform_organizations() to authenticated;
grant execute on function public.platform_stats() to authenticated;
grant execute on function public.platform_admin_list() to authenticated;
grant execute on function public.platform_set_organization_suspended(uuid, boolean, text) to authenticated;
grant execute on function public.platform_grant_admin(text, text) to authenticated;
grant execute on function public.platform_revoke_admin(uuid) to authenticated;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Bootstrapping the first administrator cannot be self-service, so it is a deliberate manual step.
-- Run this once in the Supabase SQL editor, which connects as the service role and bypasses RLS:
--
--   insert into public.platform_admins (user_id, note)
--   select id, 'Founding administrator' from auth.users where email = 'you@example.com';
--
-- Every later grant goes through platform_grant_admin() and is recorded in platform_audit_logs.
