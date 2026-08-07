-- Safety module: incidents, inspections, and corrective actions.
--
-- Incident records routinely contain information about a named person's injuries and health. The
-- blueprint requires that such details sit behind granular permissions and audit logging, and RLS is
-- row-level rather than column-level, so those fields live in their own table. That table has NO select
-- policy at all: the only way to read it is read_safety_incident_details(), which checks the granular
-- permission and writes an audit row before returning anything. Reading someone's medical notes is
-- therefore always recorded, and cannot be done by querying the table directly.
create type public.incident_category as enum ('injury', 'near_miss', 'property_damage', 'environmental', 'security', 'other');
create type public.incident_severity as enum ('low', 'medium', 'high', 'critical');
create type public.incident_status as enum ('reported', 'investigating', 'closed');
create type public.corrective_action_status as enum ('open', 'in_progress', 'completed', 'cancelled');

create table public.safety_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  reference text,
  title text not null check (char_length(trim(title)) between 2 and 160),
  category public.incident_category not null default 'other',
  severity public.incident_severity not null default 'low',
  status public.incident_status not null default 'reported',
  occurred_at timestamptz not null default now(),
  reported_on date not null default current_date,
  location text,
  summary text,
  reported_by_worker_id uuid references public.workers(id),
  equipment_id uuid references public.equipment(id),
  people_involved integer not null default 0 check (people_involved >= 0),
  lost_time_hours numeric(10,2) check (lost_time_hours is null or lost_time_hours >= 0),
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, reference),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, equipment_id) references public.equipment(organization_id, id)
);

-- Personal and medical information. Deliberately separated from the incident row above so that access
-- can be granted, denied, and audited independently of ordinary safety reporting.
create table public.safety_incident_details (
  incident_id uuid primary key references public.safety_incidents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  injured_worker_id uuid references public.workers(id),
  injury_description text,
  medical_notes text,
  personal_details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (organization_id, incident_id) references public.safety_incidents(organization_id, id)
);

create table public.safety_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  title text not null check (char_length(trim(title)) between 2 and 160),
  area text,
  inspected_on date not null default current_date,
  inspector_worker_id uuid references public.workers(id),
  findings text,
  is_satisfactory boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  incident_id uuid references public.safety_incidents(id),
  inspection_id uuid references public.safety_inspections(id),
  description text not null check (char_length(trim(description)) between 2 and 300),
  assigned_worker_id uuid references public.workers(id),
  due_on date,
  status public.corrective_action_status not null default 'open',
  completed_on date,
  completion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  -- An action that is attached to nothing cannot be traced back to why it was raised.
  check (incident_id is not null or inspection_id is not null),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, incident_id) references public.safety_incidents(organization_id, id),
  foreign key (organization_id, inspection_id) references public.safety_inspections(organization_id, id)
);

create index safety_incidents_site_idx on public.safety_incidents(organization_id, mine_site_id, occurred_at desc);
create index safety_incidents_open_idx on public.safety_incidents(organization_id, severity) where status <> 'closed';
create index safety_inspections_site_idx on public.safety_inspections(organization_id, mine_site_id, inspected_on desc);
create index corrective_actions_due_idx on public.corrective_actions(organization_id, due_on) where status in ('open', 'in_progress');

create trigger safety_incidents_updated_at before update on public.safety_incidents for each row execute function public.set_updated_at();
create trigger safety_incident_details_updated_at before update on public.safety_incident_details for each row execute function public.set_updated_at();
create trigger safety_inspections_updated_at before update on public.safety_inspections for each row execute function public.set_updated_at();
create trigger corrective_actions_updated_at before update on public.corrective_actions for each row execute function public.set_updated_at();

create or replace function public.read_safety_incident_details(requested_incident_id uuid)
returns table (
  injured_worker_id uuid,
  injury_description text,
  medical_notes text,
  personal_details text,
  updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select i.id, i.organization_id into target
  from public.safety_incidents i where i.id = requested_incident_id;
  if not found then raise exception 'Safety incident not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'safety.read_sensitive') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  -- Written before the details are returned, so an access is recorded even if the caller discards them.
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id)
  values (target.organization_id, auth.uid(), 'safety_incident_details.viewed', 'safety_incident', requested_incident_id);

  return query
    select d.injured_worker_id, d.injury_description, d.medical_notes, d.personal_details, d.updated_at
    from public.safety_incident_details d where d.incident_id = requested_incident_id;
end; $$;

create or replace function public.write_safety_incident_details(
  requested_incident_id uuid,
  injured_worker uuid default null,
  injury_description text default null,
  medical_notes text default null,
  personal_details text default null
) returns void language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select i.id, i.organization_id into target
  from public.safety_incidents i where i.id = requested_incident_id;
  if not found then raise exception 'Safety incident not found' using errcode = 'P0002'; end if;
  -- Recording these details requires both the sensitive grant and ordinary safety write access.
  if not (public.has_permission(target.organization_id, 'safety.read_sensitive')
          and public.has_permission(target.organization_id, 'safety.update')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  insert into public.safety_incident_details (incident_id, organization_id, injured_worker_id, injury_description, medical_notes, personal_details, created_by, updated_by)
  values (requested_incident_id, target.organization_id, injured_worker, injury_description, medical_notes, personal_details, auth.uid(), auth.uid())
  on conflict (incident_id) do update
    set injured_worker_id = excluded.injured_worker_id,
        injury_description = excluded.injury_description,
        medical_notes = excluded.medical_notes,
        personal_details = excluded.personal_details,
        updated_by = auth.uid();

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id)
  values (target.organization_id, auth.uid(), 'safety_incident_details.recorded', 'safety_incident', requested_incident_id);
end; $$;

/** Reports whether an incident has sensitive details, without disclosing any of them. */
create or replace function public.safety_incident_has_details(requested_incident_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.safety_incident_details d
    join public.safety_incidents i on i.id = d.incident_id
    where d.incident_id = requested_incident_id
      and public.has_permission(i.organization_id, 'safety.read')
  );
$$;

insert into public.permissions (code, name, description) values
  ('safety.read', 'View safety', 'View incidents, inspections, and corrective actions'),
  ('safety.create', 'Report safety', 'Report incidents and record inspections'),
  ('safety.update', 'Manage safety', 'Update incidents, inspections, and corrective actions'),
  ('safety.read_sensitive', 'View sensitive safety details', 'View personal and medical details attached to an incident')
on conflict (code) do nothing;

-- safety.read_sensitive is deliberately not part of the mine manager default. Ordinary safety
-- reporting does not need medical detail, and an organization that wants it there can grant it.
insert into public.role_permission_defaults (role_code, permission_code) values
  ('safety_officer', 'safety.read'),
  ('safety_officer', 'safety.create'),
  ('safety_officer', 'safety.update'),
  ('safety_officer', 'safety.read_sensitive'),
  ('mine_manager', 'safety.read'),
  ('mine_manager', 'safety.create'),
  ('mine_manager', 'safety.update'),
  ('site_supervisor', 'safety.read'),
  ('site_supervisor', 'safety.create')
on conflict do nothing;

select public.sync_role_permission_defaults();

alter table public.safety_incidents enable row level security;
alter table public.safety_incident_details enable row level security;
alter table public.safety_inspections enable row level security;
alter table public.corrective_actions enable row level security;

create policy "safety incidents read permitted" on public.safety_incidents for select using (public.has_permission(organization_id, 'safety.read'));
create policy "safety incidents create permitted" on public.safety_incidents for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'safety.create'));
create policy "safety incidents update permitted" on public.safety_incidents for update using (public.has_permission(organization_id, 'safety.update')) with check (public.has_permission(organization_id, 'safety.update'));
create policy "safety inspections read permitted" on public.safety_inspections for select using (public.has_permission(organization_id, 'safety.read'));
create policy "safety inspections write permitted" on public.safety_inspections for all using (public.has_permission(organization_id, 'safety.create')) with check (public.has_permission(organization_id, 'safety.create'));
create policy "corrective actions read permitted" on public.corrective_actions for select using (public.has_permission(organization_id, 'safety.read'));
create policy "corrective actions write permitted" on public.corrective_actions for all using (public.has_permission(organization_id, 'safety.update')) with check (public.has_permission(organization_id, 'safety.update'));

-- No policy of any kind on safety_incident_details. RLS is enabled and nothing is permitted, so the
-- audited functions above are the only route to this data for any client.

revoke all on function public.read_safety_incident_details(uuid) from public;
revoke all on function public.read_safety_incident_details(uuid) from anon;
grant execute on function public.read_safety_incident_details(uuid) to authenticated;
revoke all on function public.write_safety_incident_details(uuid, uuid, text, text, text) from public;
revoke all on function public.write_safety_incident_details(uuid, uuid, text, text, text) from anon;
grant execute on function public.write_safety_incident_details(uuid, uuid, text, text, text) to authenticated;
revoke all on function public.safety_incident_has_details(uuid) from public;
revoke all on function public.safety_incident_has_details(uuid) from anon;
grant execute on function public.safety_incident_has_details(uuid) to authenticated;
