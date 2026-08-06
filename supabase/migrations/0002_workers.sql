-- Workers module: personnel register, site assignments, attendance, training, and PPE issue history.
create type public.worker_status as enum ('active', 'inactive', 'terminated');
create type public.employment_type as enum ('employee', 'contractor', 'casual');
create type public.attendance_status as enum ('present', 'absent', 'late', 'leave');

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  employee_number text,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  phone_number text,
  job_title text,
  employment_type public.employment_type not null default 'employee',
  status public.worker_status not null default 'active',
  start_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (organization_id, employee_number),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.worker_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  worker_id uuid not null references public.workers(id),
  assignment_name text,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  worker_id uuid not null references public.workers(id),
  attendance_date date not null,
  status public.attendance_status not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (worker_id, attendance_date),
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  worker_id uuid not null references public.workers(id),
  training_name text not null,
  completed_on date not null,
  expires_on date,
  certificate_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (expires_on is null or expires_on >= completed_on)
);

create table public.ppe_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  worker_id uuid not null references public.workers(id),
  item_name text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  issued_on date not null default current_date,
  returned_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (returned_on is null or returned_on >= issued_on),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create index workers_organization_site_active_idx on public.workers(organization_id, mine_site_id, full_name) where deleted_at is null;
create index attendance_organization_date_idx on public.attendance_records(organization_id, attendance_date desc);
create index assignments_worker_active_idx on public.worker_assignments(worker_id, starts_on desc);

create trigger workers_updated_at before update on public.workers for each row execute function public.set_updated_at();
create trigger worker_assignments_updated_at before update on public.worker_assignments for each row execute function public.set_updated_at();
create trigger attendance_records_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();
create trigger training_records_updated_at before update on public.training_records for each row execute function public.set_updated_at();
create trigger ppe_issues_updated_at before update on public.ppe_issues for each row execute function public.set_updated_at();

insert into public.permissions (code, name, description) values
  ('worker.read', 'View workers', 'View worker records and attendance'),
  ('worker.create', 'Create workers', 'Register worker records'),
  ('worker.update', 'Manage workers', 'Update worker records and assignments')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('mine_manager', 'site_supervisor') and p.code in ('worker.read', 'worker.create', 'worker.update')
on conflict do nothing;

alter table public.workers enable row level security;
alter table public.worker_assignments enable row level security;
alter table public.attendance_records enable row level security;
alter table public.training_records enable row level security;
alter table public.ppe_issues enable row level security;

create policy "workers read permitted" on public.workers for select using (deleted_at is null and public.has_permission(organization_id, 'worker.read'));
create policy "workers create permitted" on public.workers for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'worker.create'));
create policy "workers update permitted" on public.workers for update using (public.has_permission(organization_id, 'worker.update')) with check (updated_by = auth.uid() and public.has_permission(organization_id, 'worker.update'));
create policy "assignments read permitted" on public.worker_assignments for select using (public.has_permission(organization_id, 'worker.read'));
create policy "assignments write permitted" on public.worker_assignments for all using (public.has_permission(organization_id, 'worker.update')) with check (public.has_permission(organization_id, 'worker.update'));
create policy "attendance read permitted" on public.attendance_records for select using (public.has_permission(organization_id, 'worker.read'));
create policy "attendance write permitted" on public.attendance_records for all using (public.has_permission(organization_id, 'worker.update')) with check (public.has_permission(organization_id, 'worker.update'));
create policy "training read permitted" on public.training_records for select using (public.has_permission(organization_id, 'worker.read'));
create policy "training write permitted" on public.training_records for all using (public.has_permission(organization_id, 'worker.update')) with check (public.has_permission(organization_id, 'worker.update'));
create policy "ppe read permitted" on public.ppe_issues for select using (public.has_permission(organization_id, 'worker.read'));
create policy "ppe write permitted" on public.ppe_issues for all using (public.has_permission(organization_id, 'worker.update')) with check (public.has_permission(organization_id, 'worker.update'));
