-- Lets an organization adjust what its own roles may do. `role.manage` has existed as a permission
-- code since the foundation with nothing behind it, so every organization has been stuck with the
-- seeded defaults.
--
-- Role permissions are changed through a function rather than by writing to role_permissions
-- directly, because two rules have to hold on every change and a policy cannot express them:
-- the owner role keeps everything, and nobody may edit roles in another organization.

create or replace function public.set_role_permissions(
  requested_organization_id uuid,
  role_code text,
  permission_codes text[]
) returns void language plpgsql security definer set search_path = public as $$
declare target_role_id uuid; removed integer; added integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.has_permission(requested_organization_id, 'role.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  -- The owner is the organization's way back in. Narrowing it could lock everyone out of their own
  -- administration with no route to undo it.
  if role_code = 'company_owner' then
    raise exception 'The owner role always holds every permission' using errcode = 'P0001';
  end if;

  select id into target_role_id from public.roles
  where organization_id = requested_organization_id and code = role_code;
  if target_role_id is null then raise exception 'That role does not exist' using errcode = 'P0002'; end if;

  delete from public.role_permissions rp
  where rp.role_id = target_role_id
    and rp.permission_id not in (select p.id from public.permissions p where p.code = any(permission_codes));
  get diagnostics removed = row_count;

  insert into public.role_permissions (role_id, permission_id)
  select target_role_id, p.id from public.permissions p
  where p.code = any(permission_codes)
  on conflict do nothing;
  get diagnostics added = row_count;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (requested_organization_id, auth.uid(), 'role.permissions_changed', 'role', target_role_id,
          jsonb_build_object('role', role_code, 'granted', coalesce(array_length(permission_codes, 1), 0),
                             'added', added, 'removed', removed));
end; $$;

/** Every role in an organization with the permissions it currently holds. */
create or replace function public.organization_roles(requested_organization_id uuid)
returns table (role_code text, role_name text, is_system boolean, member_count bigint, permission_codes text[])
language sql stable security definer set search_path = public as $$
  select r.code, r.name, r.is_system,
    (select count(*) from public.organization_memberships m
      where m.role_id = r.id and m.status = 'active'),
    coalesce(array_agg(p.code order by p.code) filter (where p.code is not null), '{}')
  from public.roles r
  left join public.role_permissions rp on rp.role_id = r.id
  left join public.permissions p on p.id = rp.permission_id
  where r.organization_id = requested_organization_id
    and public.has_permission(requested_organization_id, 'role.read')
  group by r.id, r.code, r.name, r.is_system
  order by r.code;
$$;

revoke all on function public.set_role_permissions(uuid, text, text[]) from public, anon;
grant execute on function public.set_role_permissions(uuid, text, text[]) to authenticated;
revoke all on function public.organization_roles(uuid) from public, anon;
grant execute on function public.organization_roles(uuid) to authenticated;
