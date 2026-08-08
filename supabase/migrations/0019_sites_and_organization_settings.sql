-- Mine sites and organization details are managed from the workspace, not only at onboarding.
--
-- Two gaps this closes. First, `organization.update` has existed as a permission code since the
-- foundation with no policy honouring it, so the organizations table was effectively read-only to
-- every client and its own owner could not correct the company name.
--
-- Second, nothing prevented an organization from retiring its last active mine site. The workspace
-- resolves the active site from those still active, so doing that would leave every operational
-- screen with no site to write against — a self-inflicted lockout with no route back through the
-- interface.

drop policy if exists "organizations update permitted" on public.organizations;
create policy "organizations update permitted" on public.organizations
  for update
  using (public.has_permission(id, 'organization.update'))
  with check (public.has_permission(id, 'organization.update'));

/**
 * Refuses to take the last active mine site out of service. Enforced here rather than in the
 * application so it holds whichever path performs the update.
 */
create or replace function public.protect_last_active_site() returns trigger language plpgsql as $$
begin
  -- Only relevant when a site is leaving active service.
  if new.status = 'active' and new.deleted_at is null then return new; end if;
  -- Already out of service; this update is not what removes it.
  if old.status <> 'active' or old.deleted_at is not null then return new; end if;

  if not exists (
    select 1 from public.mine_sites s
    where s.organization_id = new.organization_id
      and s.id <> new.id
      and s.status = 'active'
      and s.deleted_at is null
  ) then
    raise exception 'An organization must keep at least one active mine site' using errcode = 'P0001';
  end if;

  return new;
end; $$;

drop trigger if exists mine_sites_protect_last_active on public.mine_sites;
create trigger mine_sites_protect_last_active
  before update on public.mine_sites
  for each row execute function public.protect_last_active_site();

-- The foundation intended a site to carry both coordinates or neither:
--
--   check ((latitude is null and longitude is null) or (latitude between ... and longitude between ...))
--
-- With one coordinate set and the other null, the second branch is `true and null`, which is null,
-- and a CHECK constraint passes on null rather than failing. A half-located site was therefore
-- accepted. This states the pairing directly, where both sides are always true or false.
update public.mine_sites
set latitude = null, longitude = null
where (latitude is null) <> (longitude is null);

alter table public.mine_sites
  drop constraint if exists mine_sites_coordinates_paired;
alter table public.mine_sites
  add constraint mine_sites_coordinates_paired
  check ((latitude is null) = (longitude is null));

-- Re-runnable on purpose. Applied through the Supabase SQL editor a migration is not wrapped in a
-- transaction, so a failure part-way leaves it half applied and the natural next move is to run it
-- again. Guarding every create means that works instead of needing a hand repair on a live database.
