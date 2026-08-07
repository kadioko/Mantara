-- Consolidates the two platform-administrator implementations onto one source of truth.
--
-- Migration 0003 introduced public.platform_administrators with is_platform_super_admin(), and it is
-- already deployed. Migration 0009 introduced public.platform_admins, which additionally records who
-- granted access and when, supports revocation, and is what the audited platform functions and the
-- /admin area use.
--
-- Keeping both would leave two answers to "is this person an administrator?". This migration carries
-- the existing rows across before removing the older table, so nobody loses access.

insert into public.platform_admins (user_id, note, granted_at, granted_by)
select a.user_id, 'Carried over from platform_administrators', a.created_at, a.created_by
from public.platform_administrators a
on conflict (user_id) do nothing;

insert into public.platform_audit_logs (actor_user_id, action, target_type, target_id, details)
select a.user_id, 'platform_admin.granted', 'user', a.user_id,
       jsonb_build_object('source', 'migration 0012 consolidation')
from public.platform_administrators a;

-- Kept as a thin wrapper rather than dropped outright: anything still calling the old name keeps
-- working, and now gets its answer from the single remaining table.
create or replace function public.is_platform_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin();
$$;

revoke all on function public.is_platform_super_admin() from public;
revoke all on function public.is_platform_super_admin() from anon;
grant execute on function public.is_platform_super_admin() to authenticated;

drop table if exists public.platform_administrators;
