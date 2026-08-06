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

do $$
declare target_user_id uuid;
begin
  select p.id into target_user_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = 'godfreymariki@gmail.com';

  if target_user_id is null then
    raise exception 'Cannot create platform administrator: the requested authenticated user does not exist.';
  end if;

  insert into public.platform_administrators (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end $$;
