-- Compliance module: licences, organization-authored requirements, scheduled tasks, and documents.
--
-- Mantara stores and organizes compliance information; it does not give legal advice. Nothing here
-- encodes what any jurisdiction requires. Requirements are authored by the organization, recurrence is
-- a plain interval, and licence status is an administrative record of what the operator has been told,
-- never a conclusion the system reaches on its own.
create type public.licence_status as enum ('active', 'pending', 'suspended', 'surrendered', 'expired');
create type public.recurrence_interval as enum ('none', 'monthly', 'quarterly', 'annual');
create type public.compliance_task_status as enum ('open', 'in_progress', 'completed', 'cancelled');

create table public.mineral_licences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid references public.mine_sites(id),
  licence_number text not null check (char_length(trim(licence_number)) between 1 and 120),
  licence_type text not null check (char_length(trim(licence_type)) between 2 and 120),
  issuing_authority text,
  holder_name text,
  issued_on date,
  expires_on date,
  status public.licence_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (organization_id, licence_number),
  unique (organization_id, id),
  check (expires_on is null or issued_on is null or expires_on >= issued_on),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  category text,
  recurrence public.recurrence_interval not null default 'none',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.compliance_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid references public.mine_sites(id),
  requirement_id uuid references public.compliance_requirements(id),
  licence_id uuid references public.mineral_licences(id),
  title text not null check (char_length(trim(title)) between 2 and 160),
  details text,
  due_on date not null,
  status public.compliance_task_status not null default 'open',
  assigned_worker_id uuid references public.workers(id),
  completed_on date,
  completion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, requirement_id) references public.compliance_requirements(organization_id, id),
  foreign key (organization_id, licence_id) references public.mineral_licences(organization_id, id)
);

create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  licence_id uuid references public.mineral_licences(id),
  task_id uuid references public.compliance_tasks(id),
  document_name text not null check (char_length(trim(document_name)) between 2 and 160),
  document_path text not null,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  -- A document that belongs to nothing cannot be found again.
  check (licence_id is not null or task_id is not null),
  foreign key (organization_id, licence_id) references public.mineral_licences(organization_id, id),
  foreign key (organization_id, task_id) references public.compliance_tasks(organization_id, id)
);

create index mineral_licences_expiry_idx on public.mineral_licences(organization_id, expires_on) where deleted_at is null;
create index compliance_tasks_due_idx on public.compliance_tasks(organization_id, due_on) where status in ('open', 'in_progress');
create index compliance_tasks_site_idx on public.compliance_tasks(organization_id, mine_site_id, due_on desc);
create index compliance_documents_expiry_idx on public.compliance_documents(organization_id, expires_on) where expires_on is not null;

create trigger mineral_licences_updated_at before update on public.mineral_licences for each row execute function public.set_updated_at();
create trigger compliance_requirements_updated_at before update on public.compliance_requirements for each row execute function public.set_updated_at();
create trigger compliance_tasks_updated_at before update on public.compliance_tasks for each row execute function public.set_updated_at();
create trigger compliance_documents_updated_at before update on public.compliance_documents for each row execute function public.set_updated_at();

-- Completing a recurring obligation schedules the next one, so a periodic duty cannot quietly fall off
-- the list once it has been done. The interval comes from the organization's own requirement record.
create or replace function public.complete_compliance_task(
  requested_task_id uuid,
  notes text default null,
  completed_date date default current_date
) returns uuid language plpgsql security definer set search_path = public as $$
declare target record; step interval; next_id uuid; task_recurrence public.recurrence_interval;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  -- The task row is locked on its own: PostgreSQL refuses FOR UPDATE against the nullable side of an
  -- outer join, so the requirement's recurrence is fetched separately below.
  select t.id, t.organization_id, t.mine_site_id, t.requirement_id, t.licence_id, t.title, t.details,
         t.due_on, t.status, t.assigned_worker_id
  into target
  from public.compliance_tasks t
  where t.id = requested_task_id for update;
  if not found then raise exception 'Compliance task not found' using errcode = 'P0002'; end if;

  select r.recurrence into task_recurrence
  from public.compliance_requirements r where r.id = target.requirement_id;
  if not public.has_permission(target.organization_id, 'compliance.update') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.status in ('completed', 'cancelled') then
    raise exception 'That task is already %', target.status using errcode = 'P0001';
  end if;

  update public.compliance_tasks
  set status = 'completed', completed_on = completed_date, completion_notes = notes, updated_by = auth.uid()
  where id = requested_task_id;

  step := case task_recurrence
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'annual' then interval '1 year'
    else null
  end;

  if step is not null then
    insert into public.compliance_tasks (organization_id, mine_site_id, requirement_id, licence_id, title, details, due_on, assigned_worker_id, created_by, updated_by)
    values (target.organization_id, target.mine_site_id, target.requirement_id, target.licence_id, target.title,
            target.details, (target.due_on + step)::date, target.assigned_worker_id, auth.uid(), auth.uid())
    returning id into next_id;
  end if;

  return next_id;
end; $$;

insert into public.permissions (code, name, description) values
  ('compliance.read', 'View compliance', 'View licences, requirements, tasks, and documents'),
  ('compliance.create', 'Record compliance', 'Add licences, requirements, and tasks'),
  ('compliance.update', 'Manage compliance', 'Update and complete compliance records')
on conflict (code) do nothing;

insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager', 'compliance.read'),
  ('mine_manager', 'compliance.create'),
  ('mine_manager', 'compliance.update'),
  ('safety_officer', 'compliance.read'),
  ('safety_officer', 'compliance.create'),
  ('safety_officer', 'compliance.update'),
  ('site_supervisor', 'compliance.read'),
  ('accountant', 'compliance.read')
on conflict do nothing;

select public.sync_role_permission_defaults();

alter table public.mineral_licences enable row level security;
alter table public.compliance_requirements enable row level security;
alter table public.compliance_tasks enable row level security;
alter table public.compliance_documents enable row level security;

create policy "licences read permitted" on public.mineral_licences for select using (deleted_at is null and public.has_permission(organization_id, 'compliance.read'));
create policy "licences create permitted" on public.mineral_licences for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'compliance.create'));
create policy "licences update permitted" on public.mineral_licences for update using (public.has_permission(organization_id, 'compliance.update')) with check (public.has_permission(organization_id, 'compliance.update'));
create policy "requirements read permitted" on public.compliance_requirements for select using (public.has_permission(organization_id, 'compliance.read'));
create policy "requirements write permitted" on public.compliance_requirements for all using (public.has_permission(organization_id, 'compliance.create')) with check (public.has_permission(organization_id, 'compliance.create'));
create policy "compliance tasks read permitted" on public.compliance_tasks for select using (public.has_permission(organization_id, 'compliance.read'));
create policy "compliance tasks create permitted" on public.compliance_tasks for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'compliance.create'));
create policy "compliance tasks update permitted" on public.compliance_tasks for update using (public.has_permission(organization_id, 'compliance.update')) with check (public.has_permission(organization_id, 'compliance.update'));
create policy "compliance documents read permitted" on public.compliance_documents for select using (public.has_permission(organization_id, 'compliance.read'));
create policy "compliance documents write permitted" on public.compliance_documents for all using (public.has_permission(organization_id, 'compliance.update')) with check (public.has_permission(organization_id, 'compliance.update'));

revoke all on function public.complete_compliance_task(uuid, text, date) from public;
revoke all on function public.complete_compliance_task(uuid, text, date) from anon;
grant execute on function public.complete_compliance_task(uuid, text, date) to authenticated;
