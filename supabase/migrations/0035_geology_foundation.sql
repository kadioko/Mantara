-- Geological source data. Coordinates are WGS84 decimal degrees; no PostGIS dependency is needed
-- for the MVP plot, and GeoJSON boundaries preserve enough shape for a later spatial migration.

create table if not exists public.geological_samples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id), sample_code text not null,
  sample_type text not null check (sample_type in ('rock','soil','channel','chip','core','other')),
  collected_on date not null default current_date, latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180), elevation_m numeric(10,2),
  material text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  unique (organization_id, sample_code), unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table if not exists public.geological_assays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id), sample_id uuid not null references public.geological_samples(id),
  analyte text not null default 'Au', value_ppm numeric(16,6) not null check (value_ppm >= 0),
  method text,
  laboratory text,
  tested_on date,
  certificate_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, sample_id) references public.geological_samples(organization_id, id)
);

create table if not exists public.drill_holes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id), hole_code text not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90), longitude numeric(9,6) not null check (longitude between -180 and 180),
  azimuth_degrees numeric(6,2) check (azimuth_degrees between 0 and 360), dip_degrees numeric(5,2) check (dip_degrees between -90 and 90),
  planned_depth_m numeric(12,2) check (planned_depth_m is null or planned_depth_m >= 0), actual_depth_m numeric(12,2) check (actual_depth_m is null or actual_depth_m >= 0),
  status text not null default 'planned' check (status in ('planned','drilling','completed','abandoned')),
  started_on date,
  completed_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  unique (organization_id, hole_code), unique (organization_id, id),
  check (completed_on is null or started_on is null or completed_on >= started_on),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table if not exists public.drill_intervals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id), drill_hole_id uuid not null references public.drill_holes(id),
  from_depth_m numeric(12,2) not null check (from_depth_m >= 0), to_depth_m numeric(12,2) not null,
  lithology text, grade_ppm numeric(16,6) check (grade_ppm is null or grade_ppm >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  check (to_depth_m > from_depth_m), foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, drill_hole_id) references public.drill_holes(organization_id, id)
);

create table if not exists public.geological_boundaries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id), licence_id uuid references public.mineral_licences(id),
  name text not null, boundary_geojson jsonb not null check (jsonb_typeof(boundary_geojson) = 'object'),
  source text, recorded_on date not null default current_date, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table if not exists public.geological_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  document_name text not null,
  document_path text not null,
  file_kind text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create index if not exists geological_samples_site_date_idx on public.geological_samples(mine_site_id, collected_on desc);
create index if not exists geological_assays_sample_idx on public.geological_assays(sample_id, tested_on desc);
create index if not exists drill_holes_site_idx on public.drill_holes(mine_site_id, status);
create index if not exists drill_intervals_hole_idx on public.drill_intervals(drill_hole_id, from_depth_m);

do $$ declare table_name text; begin
  foreach table_name in array array['geological_samples','geological_assays','drill_holes','drill_intervals','geological_boundaries','geological_files'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_updated_at', table_name);
  end loop;
end $$;

insert into public.permissions (code, name, description) values
  ('geology.read','View geology','View samples, assays, drill records, boundaries and files'),
  ('geology.create','Record geology','Add geological field and laboratory records'),
  ('geology.update','Manage geology','Update geological records and files') on conflict (code) do nothing;
insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager','geology.read'),('mine_manager','geology.create'),('mine_manager','geology.update'),
  ('site_supervisor','geology.read'),('site_supervisor','geology.create') on conflict do nothing;
select public.sync_role_permission_defaults();

do $$ declare table_name text; begin
  foreach table_name in array array['geological_samples','geological_assays','drill_holes','drill_intervals','geological_boundaries','geological_files'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' read permitted', table_name);
    execute format('create policy %I on public.%I for select using (public.has_permission(organization_id, ''geology.read''))', table_name || ' read permitted', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' create permitted', table_name);
    execute format('create policy %I on public.%I for insert with check (created_by = auth.uid() and public.has_permission(organization_id, ''geology.create''))', table_name || ' create permitted', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' update permitted', table_name);
    execute format('create policy %I on public.%I for update using (public.has_permission(organization_id, ''geology.update'')) with check (updated_by = auth.uid() and public.has_permission(organization_id, ''geology.update''))', table_name || ' update permitted', table_name);
    execute format('drop policy if exists %I on public.%I', 'site restriction', table_name);
    execute format('create policy %I on public.%I as restrictive for all using (public.may_reach_site(organization_id, mine_site_id)) with check (public.may_reach_site(organization_id, mine_site_id))', 'site restriction', table_name);
  end loop;
end $$;

drop trigger if exists audit_geological_sample on public.geological_samples;
create trigger audit_geological_sample after insert or update on public.geological_samples for each row execute function public.audit_row_change('geology.sample_saved','geological_sample');
drop trigger if exists audit_geological_assay on public.geological_assays;
create trigger audit_geological_assay after insert or update on public.geological_assays for each row execute function public.audit_row_change('geology.assay_saved','geological_assay');
drop trigger if exists audit_drill_hole on public.drill_holes;
create trigger audit_drill_hole after insert or update on public.drill_holes for each row execute function public.audit_row_change('geology.drill_saved','drill_hole');

-- Extend private Storage authorization to the geology folder when Supabase Storage is present.
do $$ begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then return; end if;
  execute $p$ drop policy if exists "documents read permitted" on storage.objects $p$;
  execute $p$ create policy "documents read permitted" on storage.objects for select using (
    bucket_id='documents' and public.has_permission((storage.foldername(name))[1]::uuid,
      case (storage.foldername(name))[2] when 'equipment' then 'equipment.read' when 'compliance' then 'compliance.read' when 'training' then 'worker.read' when 'geology' then 'geology.read' else 'organization.read' end)) $p$;
  execute $p$ drop policy if exists "documents write permitted" on storage.objects $p$;
  execute $p$ create policy "documents write permitted" on storage.objects for insert with check (
    bucket_id='documents' and owner=auth.uid() and public.has_permission((storage.foldername(name))[1]::uuid,
      case (storage.foldername(name))[2] when 'equipment' then 'equipment.update' when 'compliance' then 'compliance.update' when 'training' then 'worker.update' when 'geology' then 'geology.update' else 'organization.update' end)) $p$;
  execute $p$ drop policy if exists "documents delete permitted" on storage.objects $p$;
  execute $p$ create policy "documents delete permitted" on storage.objects for delete using (
    bucket_id='documents' and public.has_permission((storage.foldername(name))[1]::uuid,
      case (storage.foldername(name))[2] when 'equipment' then 'equipment.update' when 'compliance' then 'compliance.update' when 'training' then 'worker.update' when 'geology' then 'geology.update' else 'organization.update' end)) $p$;
end $$;
