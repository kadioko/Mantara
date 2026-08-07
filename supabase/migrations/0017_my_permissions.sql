-- Returns every permission the caller holds in one organization, so a page can ask once instead of
-- calling has_permission() per module.
--
-- The workspace layout and dashboard together were making around twenty separate has_permission()
-- calls per render, each on its own Supabase client. Under concurrency those refresh the auth session
-- against each other; a failed call is indistinguishable from a denial, so navigation items silently
-- disappeared and pages redirected as though the operator had lost access.
--
-- The rules here mirror has_permission() exactly, including that a suspended organization keeps only
-- its read permissions. If one changes, the other must change with it.
create or replace function public.my_permissions(requested_organization_id uuid)
returns setof text language sql stable security definer set search_path = public as $$
  -- Permissions granted through the member's role.
  select distinct p.code
  from public.organization_memberships m
  join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = requested_organization_id
    and m.user_id = auth.uid()
    and m.status = 'active'
    and (o.suspended_at is null or p.code like '%.read')

  union

  -- An owner holds everything, including permissions added by a later migration.
  select p.code
  from public.permissions p
  join public.organizations o on o.id = requested_organization_id
  where exists (
      select 1
      from public.organization_memberships m
      join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
      where m.organization_id = requested_organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_owner'
    )
    and (o.suspended_at is null or p.code like '%.read');
$$;

revoke all on function public.my_permissions(uuid) from public;
revoke all on function public.my_permissions(uuid) from anon;
grant execute on function public.my_permissions(uuid) to authenticated;
