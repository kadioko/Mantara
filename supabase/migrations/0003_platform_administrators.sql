-- Platform administrators manage Mantara itself. This role does not bypass tenant RLS.
create table public.platform_administrators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.platform_administrators enable row level security;

create or replace function public.is_platform_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_administrators where user_id = auth.uid());
$$;

revoke all on function public.is_platform_super_admin() from public;
grant execute on function public.is_platform_super_admin() to authenticated;

-- The founding administrator was originally bootstrapped here by email address. That has been removed:
-- it hardcoded a personal address into version control, and it raised an exception when that account
-- did not exist, which made this migration fail on every fresh database and in CI.
--
-- This migration is already deployed, so the administrator it created is unaffected, and migration
-- 0012 carries that row into public.platform_admins. Bootstrapping a new environment is now the
-- documented one-off insert in the README.
