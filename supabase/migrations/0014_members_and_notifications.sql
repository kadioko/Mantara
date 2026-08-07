-- User administration and notifications.
--
-- Until now an organization could not add its own people: member.invite, member.update_role and
-- role.manage existed as permission codes with nothing behind them. Inviting cannot go through
-- organization_memberships directly, because that table references profiles and the invitee may not
-- have an account yet, so invitations are held by email until the person signs in.
--
-- Every membership change runs through a function that records an audit row and refuses to leave an
-- organization without an owner, which is otherwise an easy way to lock a customer out of their data.

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (position('@' in email) > 1 and char_length(email) <= 200),
  role_id uuid not null,
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  foreign key (organization_id, role_id) references public.roles(organization_id, id)
);

-- One live invitation per address per organization; re-inviting reuses the same row.
create unique index organization_invitations_pending_idx
  on public.organization_invitations(organization_id, lower(email))
  where accepted_at is null and revoked_at is null;
create index organization_invitations_email_idx on public.organization_invitations(lower(email)) where accepted_at is null and revoked_at is null;

/** Every user who holds a permission in an organization, including owners who hold everything. */
create or replace function public.users_with_permission(requested_organization_id uuid, requested_permission_code text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct m.user_id
  from public.organization_memberships m
  join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
  left join public.role_permissions rp on rp.role_id = r.id
  left join public.permissions p on p.id = rp.permission_id
  where m.organization_id = requested_organization_id
    and m.status = 'active'
    and (r.code = 'company_owner' or p.code = requested_permission_code);
$$;

/** Active owners of an organization, used to refuse changes that would leave it with none. */
create or replace function public.active_owner_count(requested_organization_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.organization_memberships m
  join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
  where m.organization_id = requested_organization_id and m.status = 'active' and r.code = 'company_owner';
$$;

create or replace function public.invite_member(
  requested_organization_id uuid,
  invitee_email text,
  role_code text
) returns uuid language plpgsql security definer set search_path = public as $$
declare target_role_id uuid; new_id uuid; normalised text := lower(trim(invitee_email));
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.has_permission(requested_organization_id, 'member.invite') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if position('@' in normalised) < 2 then
    raise exception 'Enter a valid email address' using errcode = 'P0001';
  end if;

  select id into target_role_id from public.roles
  where organization_id = requested_organization_id and code = role_code;
  if target_role_id is null then raise exception 'That role does not exist' using errcode = 'P0002'; end if;

  -- Someone already in the organization should have their role changed, not be invited again.
  if exists (
    select 1 from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = requested_organization_id and lower(u.email) = normalised
  ) then
    raise exception 'That person is already a member of this organization' using errcode = 'P0001';
  end if;

  insert into public.organization_invitations (organization_id, email, role_id, invited_by)
  values (requested_organization_id, normalised, target_role_id, auth.uid())
  on conflict (organization_id, lower(email)) where accepted_at is null and revoked_at is null
  do update set role_id = excluded.role_id, invited_by = excluded.invited_by, created_at = now(), expires_at = now() + interval '14 days'
  returning id into new_id;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (requested_organization_id, auth.uid(), 'member.invited', 'invitation', new_id,
          jsonb_build_object('email', normalised, 'role', role_code));
  return new_id;
end; $$;

create or replace function public.revoke_invitation(requested_invitation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id, organization_id, email into target
  from public.organization_invitations where id = requested_invitation_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'member.invite') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  update public.organization_invitations set revoked_at = now() where id = requested_invitation_id;
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (target.organization_id, auth.uid(), 'member.invitation_revoked', 'invitation', requested_invitation_id,
          jsonb_build_object('email', target.email));
end; $$;

/**
 * Claims any invitation addressed to the signed-in user's email. Safe for any authenticated caller
 * because it only ever matches their own address, and it is what turns an invitation into membership.
 */
create or replace function public.accept_pending_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare caller_email text; accepted integer := 0; invitation record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select lower(u.email) into caller_email from auth.users u where u.id = auth.uid();
  if caller_email is null then return 0; end if;

  for invitation in
    select i.id, i.organization_id, i.role_id
    from public.organization_invitations i
    where lower(i.email) = caller_email
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  loop
    insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at, created_by, updated_by)
    values (invitation.organization_id, auth.uid(), invitation.role_id, 'active', now(), auth.uid(), auth.uid())
    on conflict (organization_id, user_id) do nothing;

    update public.organization_invitations
    set accepted_at = now(), accepted_by = auth.uid()
    where id = invitation.id;

    insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id)
    values (invitation.organization_id, auth.uid(), 'member.joined', 'membership', auth.uid());
    accepted := accepted + 1;
  end loop;

  return accepted;
end; $$;

create or replace function public.set_member_role(
  requested_organization_id uuid,
  target_user_id uuid,
  role_code text
) returns void language plpgsql security definer set search_path = public as $$
declare target_role_id uuid; current_role_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.has_permission(requested_organization_id, 'member.update_role') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  -- Changing your own role is how an administrator accidentally removes their own access.
  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = 'P0001';
  end if;

  select r.code into current_role_code
  from public.organization_memberships m
  join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
  where m.organization_id = requested_organization_id and m.user_id = target_user_id;
  if current_role_code is null then raise exception 'That person is not a member' using errcode = 'P0002'; end if;

  select id into target_role_id from public.roles
  where organization_id = requested_organization_id and code = role_code;
  if target_role_id is null then raise exception 'That role does not exist' using errcode = 'P0002'; end if;

  if current_role_code = 'company_owner' and role_code <> 'company_owner' and public.active_owner_count(requested_organization_id) <= 1 then
    raise exception 'An organization must keep at least one owner' using errcode = 'P0001';
  end if;

  update public.organization_memberships
  set role_id = target_role_id, updated_by = auth.uid()
  where organization_id = requested_organization_id and user_id = target_user_id;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, previous_values, new_values)
  values (requested_organization_id, auth.uid(), 'member.role_changed', 'membership', target_user_id,
          jsonb_build_object('role', current_role_code), jsonb_build_object('role', role_code));
end; $$;

create or replace function public.set_member_status(
  requested_organization_id uuid,
  target_user_id uuid,
  new_status public.membership_status
) returns void language plpgsql security definer set search_path = public as $$
declare current_role_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.has_permission(requested_organization_id, 'member.update_role') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own access' using errcode = 'P0001';
  end if;

  select r.code into current_role_code
  from public.organization_memberships m
  join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
  where m.organization_id = requested_organization_id and m.user_id = target_user_id;
  if current_role_code is null then raise exception 'That person is not a member' using errcode = 'P0002'; end if;

  if current_role_code = 'company_owner' and new_status <> 'active' and public.active_owner_count(requested_organization_id) <= 1 then
    raise exception 'An organization must keep at least one active owner' using errcode = 'P0001';
  end if;

  update public.organization_memberships
  set status = new_status, updated_by = auth.uid()
  where organization_id = requested_organization_id and user_id = target_user_id;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (requested_organization_id, auth.uid(), 'member.status_changed', 'membership', target_user_id,
          jsonb_build_object('status', new_status));
end; $$;

/** Lists members with the details the administration screen needs, without exposing auth.users. */
create or replace function public.organization_members(requested_organization_id uuid)
returns table (user_id uuid, email text, full_name text, role_code text, role_name text, status public.membership_status, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email, p.full_name, r.code, r.name, m.status, m.joined_at
  from public.organization_memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
  where m.organization_id = requested_organization_id
    and public.has_permission(requested_organization_id, 'member.read')
  order by r.code, u.email;
$$;

-- Notifications: the table has existed since the foundation with nothing writing to it. These fan out
-- to whoever can actually act, so a submitted record does not sit unseen waiting for approval.
create or replace function public.notify_approvers() returns trigger language plpgsql security definer set search_path = public as $$
declare approval_permission text; notice_title text; notice_body text; notice_type text;
begin
  if new.status <> 'submitted' or old.status is not distinct from new.status then return new; end if;

  if tg_table_name = 'production_entries' then
    approval_permission := 'production.approve';
    notice_type := 'production.submitted';
    notice_title := 'Production awaiting approval';
    notice_body := new.material || ' — ' || new.quantity || ' ' || new.unit;
  else
    approval_permission := 'expense.approve';
    notice_type := 'expense.submitted';
    notice_title := 'Expense awaiting approval';
    notice_body := new.description || ' — ' || new.amount || ' ' || new.currency_code;
  end if;

  insert into public.notifications (organization_id, user_id, type, title, body)
  select new.organization_id, approver, notice_type, notice_title, notice_body
  from public.users_with_permission(new.organization_id, approval_permission) approver
  -- The person who submitted it does not need telling.
  where approver is distinct from auth.uid();

  return new;
end; $$;

create trigger production_entries_notify after update of status on public.production_entries for each row execute function public.notify_approvers();
create trigger expenses_notify after update of status on public.expenses for each row execute function public.notify_approvers();

alter table public.organization_invitations enable row level security;

create policy "invitations read permitted" on public.organization_invitations for select using (public.has_permission(organization_id, 'member.read'));
-- No write policy: invite_member, revoke_invitation, and accept_pending_invitations are the only writers.

revoke all on function public.users_with_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.active_owner_count(uuid) from public, anon;
grant execute on function public.active_owner_count(uuid) to authenticated;
revoke all on function public.invite_member(uuid, text, text) from public, anon;
grant execute on function public.invite_member(uuid, text, text) to authenticated;
revoke all on function public.revoke_invitation(uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid) to authenticated;
revoke all on function public.accept_pending_invitations() from public, anon;
grant execute on function public.accept_pending_invitations() to authenticated;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
revoke all on function public.set_member_status(uuid, uuid, public.membership_status) from public, anon;
grant execute on function public.set_member_status(uuid, uuid, public.membership_status) to authenticated;
revoke all on function public.organization_members(uuid) from public, anon;
grant execute on function public.organization_members(uuid) to authenticated;
