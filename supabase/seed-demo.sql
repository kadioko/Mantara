-- Explicit demo seed for developer3450@gmail.com. Run only when demo data is wanted.
-- Safe to run more than once; it creates a clearly labelled demo tenant only.
do $$
declare
  demo_user_id uuid;
  demo_organization_id uuid;
  owner_role_id uuid;
  demo_site_id uuid;
  worker_one_id uuid;
  worker_two_id uuid;
  worker_three_id uuid;
begin
  select p.id into demo_user_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = 'developer3450@gmail.com';

  if demo_user_id is null then
    raise exception 'Demo user developer3450@gmail.com must be created before running this seed.';
  end if;

  select id into demo_organization_id from public.organizations where name = 'Mantara Demo Mining Company' and deleted_at is null;
  if demo_organization_id is null then
    insert into public.organizations (name, country_code, created_by, updated_by)
    values ('Mantara Demo Mining Company', 'TZ', demo_user_id, demo_user_id)
    returning id into demo_organization_id;
  end if;

  select id into owner_role_id from public.roles where organization_id = demo_organization_id and code = 'company_owner';
  if owner_role_id is null then
    insert into public.roles (organization_id, code, name, is_system, created_by, updated_by)
    values (demo_organization_id, 'company_owner', 'Company owner', true, demo_user_id, demo_user_id)
    returning id into owner_role_id;
  end if;

  insert into public.role_permissions (role_id, permission_id)
  select owner_role_id, id from public.permissions on conflict do nothing;

  insert into public.organization_memberships (organization_id, user_id, role_id, status, joined_at, created_by, updated_by)
  values (demo_organization_id, demo_user_id, owner_role_id, 'active', now(), demo_user_id, demo_user_id)
  on conflict (organization_id, user_id) do update set role_id = excluded.role_id, status = 'active', joined_at = coalesce(public.organization_memberships.joined_at, excluded.joined_at), updated_by = excluded.updated_by;

  select id into demo_site_id from public.mine_sites where organization_id = demo_organization_id and name = 'Kahama Demo Gold Site' and deleted_at is null;
  if demo_site_id is null then
    insert into public.mine_sites (organization_id, name, country_code, region, district, created_by, updated_by)
    values (demo_organization_id, 'Kahama Demo Gold Site', 'TZ', 'Shinyanga', 'Kahama', demo_user_id, demo_user_id)
    returning id into demo_site_id;
  end if;

  insert into public.workers (organization_id, mine_site_id, employee_number, full_name, phone_number, job_title, employment_type, status, start_date, created_by, updated_by)
  values
    (demo_organization_id, demo_site_id, 'DEMO-001', 'Asha Mrema', '+255 700 000 001', 'Site Supervisor', 'employee', 'active', current_date - 90, demo_user_id, demo_user_id),
    (demo_organization_id, demo_site_id, 'DEMO-002', 'Juma Kweka', '+255 700 000 002', 'Excavator Operator', 'employee', 'active', current_date - 60, demo_user_id, demo_user_id),
    (demo_organization_id, demo_site_id, 'DEMO-003', 'Neema John', '+255 700 000 003', 'Store Assistant', 'contractor', 'active', current_date - 30, demo_user_id, demo_user_id)
  on conflict (organization_id, employee_number) do nothing;

  select id into worker_one_id from public.workers where organization_id = demo_organization_id and employee_number = 'DEMO-001';
  select id into worker_two_id from public.workers where organization_id = demo_organization_id and employee_number = 'DEMO-002';
  select id into worker_three_id from public.workers where organization_id = demo_organization_id and employee_number = 'DEMO-003';

  insert into public.attendance_records (organization_id, mine_site_id, worker_id, attendance_date, status, notes, created_by, updated_by)
  values
    (demo_organization_id, demo_site_id, worker_one_id, current_date, 'present', 'Demo attendance record', demo_user_id, demo_user_id),
    (demo_organization_id, demo_site_id, worker_two_id, current_date, 'present', 'Demo attendance record', demo_user_id, demo_user_id),
    (demo_organization_id, demo_site_id, worker_three_id, current_date, 'late', 'Demo attendance record', demo_user_id, demo_user_id)
  on conflict (worker_id, attendance_date) do update set status = excluded.status, notes = excluded.notes, updated_by = excluded.updated_by;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (demo_organization_id, demo_user_id, 'seeded', 'demo_workspace', demo_organization_id, jsonb_build_object('label', 'Demo data', 'source', 'supabase/seed-demo.sql'));
end $$;
