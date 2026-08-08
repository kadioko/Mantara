-- Restricting a member to particular mine sites.
--
-- Until now a permission was held across the whole organization. A site supervisor at Pit 2 could
-- read and edit Pit 4's production, fuel and safety records, because "supervisor" was an
-- organization-wide fact. For a company with one site that is invisible. For a company with four,
-- run by different people, it is wrong — and it is the shape of company Mantara is aimed at.
--
-- **This is added as RESTRICTIVE policies, and that choice is the whole design.**
--
-- There are over a hundred existing policies. Rewriting each one to also check a site would be a
-- large, error-prone edit to the only thing standing between two mining companies' data, and a
-- single missed table would be a silent hole. PostgreSQL AND-s restrictive policies with the
-- permissive ones already present, so one restrictive policy per site-scoped table narrows access
-- without any existing policy being touched. Nothing that was denied becomes allowed; the change can
-- only ever subtract.
--
-- It is also inert until used. A member with no restriction rows reaches every site, exactly as
-- before, so applying this migration changes no existing behaviour at all.

create table if not exists public.membership_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.profiles(id),
  mine_site_id uuid not null references public.mine_sites(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (organization_id, user_id, mine_site_id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

comment on table public.membership_sites is
  'Optional per-member site restriction. No rows for a member means every site, not none.';

-- The lookup happens once per row of every site-scoped query, so it has to be an index hit.
create index if not exists membership_sites_lookup_idx
  on public.membership_sites (organization_id, user_id, mine_site_id);

alter table public.membership_sites enable row level security;

drop policy if exists "membership sites read permitted" on public.membership_sites;
create policy "membership sites read permitted" on public.membership_sites
  for select using (
    -- Anyone who can see the member list can see who is restricted to what, and a member can always
    -- see their own restriction — otherwise "why can I not see Pit 4" has no answer on any screen.
    user_id = auth.uid() or public.has_permission(organization_id, 'member.read')
  );
-- No write policy. set_member_sites() is the only writer, so a restriction cannot be edited by
-- anyone who merely holds insert rights on a table.

/**
 * Whether the caller may reach a given mine site.
 *
 * Three ways to be allowed, and the first two are why this is safe to apply everywhere:
 *   - the row is not attached to a site at all (an organization-wide licence, an
 *     organization-wide budget), which is everybody's business;
 *   - the caller has no restriction recorded, which is every existing member;
 *   - the caller is restricted, and this is one of their sites.
 *
 * A company owner is never restricted. An owner locked out of their own site by an administrative
 * mistake would have no way back in, and the role exists precisely to be the way back in.
 */
create or replace function public.may_reach_site(
  requested_organization_id uuid,
  requested_site_id uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select
    requested_site_id is null
    or not exists (
      select 1 from public.membership_sites s
      where s.organization_id = requested_organization_id and s.user_id = auth.uid()
    )
    or exists (
      select 1 from public.membership_sites s
      where s.organization_id = requested_organization_id
        and s.user_id = auth.uid()
        and s.mine_site_id = requested_site_id
    )
    or exists (
      select 1 from public.organization_memberships m
      join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
      where m.organization_id = requested_organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'company_owner'
    );
$$;

revoke all on function public.may_reach_site(uuid, uuid) from public, anon;
grant execute on function public.may_reach_site(uuid, uuid) to authenticated;

-- Apply the restriction to every table that carries a mine_site_id, generated from the catalogue
-- rather than typed out. A hand-written list is a list someone forgets to add to; asking the
-- database which tables have the column cannot miss one that exists.
--
-- At the time of writing that is 28 tables: workers, worker_assignments, attendance_records,
-- ppe_issues, equipment and its four child tables, shifts, production_entries, downtime_records,
-- ore_lots, ore_dispatches, the four fuel tables, the three maintenance tables,
-- inventory_locations, expenses, budgets, mineral_licences, compliance_tasks, safety_incidents,
-- safety_inspections and corrective_actions.
--
-- A table added later needs its own policy. That is a real limitation of doing it here rather than
-- in each module's migration, and it is recorded in the architecture blueprint.
do $$
declare target record;
begin
  for target in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'mine_site_id'
      and c.table_name <> 'membership_sites'
    order by c.table_name
  loop
    -- Dropped first so a re-run replaces the policy rather than failing on it.
    execute format('drop policy if exists %I on public.%I', 'site restriction', target.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all
         using (public.may_reach_site(organization_id, mine_site_id))
         with check (public.may_reach_site(organization_id, mine_site_id))',
      'site restriction', target.table_name);
  end loop;
end $$;

-- mine_sites itself is keyed on its own id rather than a mine_site_id column. Without this a
-- restricted member still sees every site in the workspace switcher, which both leaks the shape of
-- the organization and offers them a site whose records they would then find empty.
drop policy if exists "site restriction" on public.mine_sites;
create policy "site restriction" on public.mine_sites
  as restrictive for all
  using (public.may_reach_site(organization_id, id))
  with check (public.may_reach_site(organization_id, id));

/**
 * Replaces a member's site restriction with exactly the sites given. An empty array clears it,
 * returning the member to every site.
 *
 * Guarded on member.update_role: deciding which sites someone can reach is the same kind of decision
 * as deciding what they may do, and should not be available to anyone who can merely read the list.
 */
create or replace function public.set_member_sites(
  requested_organization_id uuid,
  requested_user_id uuid,
  requested_site_ids uuid[]
) returns integer language plpgsql security definer set search_path = public as $$
declare applied integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.has_permission(requested_organization_id, 'member.update_role') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = requested_organization_id and m.user_id = requested_user_id
  ) then
    raise exception 'That person is not a member of this organization' using errcode = 'P0002';
  end if;

  -- Every site named must belong to this organization. Without this check a caller could attach a
  -- restriction naming another company's site id, which leaks nothing by itself but writes a
  -- cross-tenant reference into the table and would confuse every later read.
  if exists (
    select 1 from unnest(requested_site_ids) as requested(id)
    where not exists (
      select 1 from public.mine_sites s
      where s.id = requested.id and s.organization_id = requested_organization_id and s.deleted_at is null
    )
  ) then
    raise exception 'One of those mine sites is not in this organization' using errcode = 'P0002';
  end if;

  delete from public.membership_sites
  where organization_id = requested_organization_id and user_id = requested_user_id;

  insert into public.membership_sites (organization_id, user_id, mine_site_id, created_by)
  select requested_organization_id, requested_user_id, site_id, auth.uid()
  from unnest(requested_site_ids) as site_id;
  get diagnostics applied = row_count;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (
    requested_organization_id, auth.uid(), 'member.sites_changed', 'membership', requested_user_id,
    jsonb_build_object('site_count', applied)
  );

  return applied;
end; $$;

revoke all on function public.set_member_sites(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_member_sites(uuid, uuid, uuid[]) to authenticated;

-- Re-runnable on purpose. Applied through the Supabase SQL editor a migration is not wrapped in a
-- transaction, so a failure part-way leaves it half applied and the natural next move is to run it
-- again. Guarding every create means that works instead of needing a hand repair on a live database.
