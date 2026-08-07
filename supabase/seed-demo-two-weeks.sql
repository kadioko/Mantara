-- Two-week operational history for the developer demo workspace.
-- Safe to run repeatedly after seed-demo.sql, seed-demo-operational.sql, and migration 0018.
do $$
declare
  demo_user_id uuid;
  org_id uuid;
  site_id uuid;
  supervisor_id uuid;
  operator_id uuid;
  technician_id uuid;
  driver_id uuid;
  safety_id uuid;
  excavator_id uuid;
  generator_id uuid;
  diesel_store_id uuid;
  expense_category_id uuid;
  supplier_id uuid;
  active_shift_id uuid;
  request_id uuid;
  current_work_order_id uuid;
  work_date date;
  day_offset integer;
begin
  select p.id into demo_user_id
  from public.profiles p join auth.users u on u.id = p.id
  where lower(u.email) = 'developer3450@gmail.com';
  if demo_user_id is null then raise exception 'Demo user developer3450@gmail.com must exist first.'; end if;

  select id into org_id from public.organizations where name = 'Mantara Demo Mining Company' and deleted_at is null;
  select id into site_id from public.mine_sites where organization_id = org_id and name = 'Kahama Demo Gold Site' and deleted_at is null;
  if org_id is null or site_id is null then raise exception 'Run supabase/seed-demo.sql first.'; end if;

  insert into public.workers (organization_id, mine_site_id, employee_number, full_name, phone_number, job_title, employment_type, status, start_date, notes, created_by, updated_by)
  values
    (org_id, site_id, 'DEMO-004', 'Asha Mremi', '+255 700 000 004', 'Maintenance technician', 'employee', 'active', current_date - 190, 'Demo workforce record.', demo_user_id, demo_user_id),
    (org_id, site_id, 'DEMO-005', 'Baraka Mollel', '+255 700 000 005', 'Haul truck driver', 'employee', 'active', current_date - 160, 'Demo workforce record.', demo_user_id, demo_user_id),
    (org_id, site_id, 'DEMO-006', 'Rehema Nyerere', '+255 700 000 006', 'Safety officer', 'employee', 'active', current_date - 135, 'Demo workforce record.', demo_user_id, demo_user_id),
    (org_id, site_id, 'DEMO-007', 'Hassan Mussa', '+255 700 000 007', 'Field geologist', 'contractor', 'active', current_date - 96, 'Demo workforce record.', demo_user_id, demo_user_id)
  on conflict (organization_id, employee_number) do update
  set full_name = excluded.full_name, job_title = excluded.job_title, status = excluded.status, updated_by = excluded.updated_by;

  select id into supervisor_id from public.workers where organization_id = org_id and employee_number = 'DEMO-001';
  select id into operator_id from public.workers where organization_id = org_id and employee_number = 'DEMO-002';
  select id into technician_id from public.workers where organization_id = org_id and employee_number = 'DEMO-004';
  select id into driver_id from public.workers where organization_id = org_id and employee_number = 'DEMO-005';
  select id into safety_id from public.workers where organization_id = org_id and employee_number = 'DEMO-006';
  select id into excavator_id from public.equipment where organization_id = org_id and asset_code = 'DEMO-EXC-001';
  select id into generator_id from public.equipment where organization_id = org_id and asset_code = 'DEMO-GEN-001';
  select id into diesel_store_id from public.fuel_storage_locations where organization_id = org_id and mine_site_id = site_id and name = 'Demo Main Diesel Tank';
  select id into expense_category_id from public.expense_categories where organization_id = org_id and name = 'Demo fuel and operations';
  select id into supplier_id from public.suppliers where organization_id = org_id and name = 'Demo Mining Supplies';
  if excavator_id is null or generator_id is null or diesel_store_id is null or expense_category_id is null or supplier_id is null then
    raise exception 'Run supabase/seed-demo-operational.sql first.';
  end if;

  for day_offset in 0..13 loop
    work_date := current_date - day_offset;
    insert into public.shifts (organization_id, mine_site_id, name, shift_date, supervisor_worker_id, status, notes, created_by, updated_by)
    values (org_id, site_id, 'Demo Operations Shift', work_date, supervisor_id, case when day_offset = 0 then 'active'::public.shift_status else 'closed'::public.shift_status end, 'Two-week operating history demonstration.', demo_user_id, demo_user_id)
    on conflict (mine_site_id, shift_date, name) do update
    set supervisor_worker_id = excluded.supervisor_worker_id, status = excluded.status, updated_by = excluded.updated_by;
    select id into active_shift_id from public.shifts where mine_site_id = site_id and shift_date = work_date and name = 'Demo Operations Shift';

    insert into public.shift_assignments (organization_id, shift_id, worker_id, role_note, created_by)
    select org_id, active_shift_id, operator_id, 'Excavator operator', demo_user_id
    where not exists (select 1 from public.shift_assignments assignment_row where assignment_row.shift_id = active_shift_id and assignment_row.worker_id = operator_id);
    insert into public.shift_assignments (organization_id, shift_id, worker_id, role_note, created_by)
    select org_id, active_shift_id, driver_id, 'Haulage support', demo_user_id
    where not exists (select 1 from public.shift_assignments assignment_row where assignment_row.shift_id = active_shift_id and assignment_row.worker_id = driver_id);
    insert into public.shift_assignments (organization_id, shift_id, worker_id, role_note, created_by)
    select org_id, active_shift_id, safety_id, 'Safety coverage', demo_user_id
    where not exists (select 1 from public.shift_assignments assignment_row where assignment_row.shift_id = active_shift_id and assignment_row.worker_id = safety_id);

    insert into public.production_entries (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, grade, location, status, notes, created_by, updated_by)
    select org_id, site_id, active_shift_id, work_date, 'Gold-bearing ore (Demo)', 108 + ((13 - day_offset) * 3.75), 'tonnes', 3.10 + ((day_offset % 4) * 0.12), 'Demo Pit 2', 'approved', 'DEMO-OPS-PROD-' || to_char(work_date, 'YYYYMMDD'), demo_user_id, demo_user_id
    where not exists (select 1 from public.production_entries where organization_id = org_id and notes = 'DEMO-OPS-PROD-' || to_char(work_date, 'YYYYMMDD'));

    insert into public.attendance_records (organization_id, mine_site_id, worker_id, attendance_date, status, check_in_at, check_out_at, notes, created_by, updated_by)
    values
      (org_id, site_id, supervisor_id, work_date, 'present', work_date + time '06:45', work_date + time '17:20', 'Demo two-week attendance.', demo_user_id, demo_user_id),
      (org_id, site_id, operator_id, work_date, case when day_offset = 5 then 'late'::public.attendance_status else 'present'::public.attendance_status end, work_date + case when day_offset = 5 then time '07:25' else time '06:50' end, work_date + time '17:15', 'Demo two-week attendance.', demo_user_id, demo_user_id),
      (org_id, site_id, technician_id, work_date, 'present', work_date + time '06:55', work_date + time '17:10', 'Demo two-week attendance.', demo_user_id, demo_user_id),
      (org_id, site_id, driver_id, work_date, 'present', work_date + time '06:50', work_date + time '17:25', 'Demo two-week attendance.', demo_user_id, demo_user_id),
      (org_id, site_id, safety_id, work_date, 'present', work_date + time '06:40', work_date + time '17:10', 'Demo two-week attendance.', demo_user_id, demo_user_id)
    on conflict (worker_id, attendance_date) do update
    set status = excluded.status, check_in_at = excluded.check_in_at, check_out_at = excluded.check_out_at, notes = excluded.notes, updated_by = excluded.updated_by;

    insert into public.fuel_issues (organization_id, mine_site_id, storage_location_id, equipment_id, worker_id, litres, equipment_meter, issued_on, notes, created_by, updated_by)
    select org_id, site_id, diesel_store_id, excavator_id, operator_id, 118 + (day_offset % 5) * 4, 1200 + ((13 - day_offset) * 3.75), work_date, 'DEMO-OPS-FUEL-' || to_char(work_date, 'YYYYMMDD'), demo_user_id, demo_user_id
    where not exists (select 1 from public.fuel_issues where organization_id = org_id and notes = 'DEMO-OPS-FUEL-' || to_char(work_date, 'YYYYMMDD'));

    insert into public.expenses (organization_id, mine_site_id, category_id, supplier_id, description, amount, currency_code, incurred_on, reference, status, notes, submitted_at, created_by, updated_by)
    select org_id, site_id, expense_category_id, supplier_id,
      case when day_offset % 3 = 0 then 'Demo fuel and haulage operations' when day_offset % 3 = 1 then 'Demo pit consumables' else 'Demo site logistics' end,
      85000 + ((day_offset % 4) * 17500), 'TZS', work_date, 'DEMO-OPS-EXP-' || to_char(work_date, 'YYYYMMDD'), 'approved', 'Two-week operating cost demonstration.', now(), demo_user_id, demo_user_id
    where not exists (select 1 from public.expenses where organization_id = org_id and reference = 'DEMO-OPS-EXP-' || to_char(work_date, 'YYYYMMDD'));

    if day_offset in (12, 6) then
      insert into public.fuel_receipts (organization_id, mine_site_id, storage_location_id, litres, unit_cost, supplier, reference, received_on, notes, created_by, updated_by)
      select org_id, site_id, diesel_store_id, 1800, 3100, 'Demo Fuel Supplies Ltd', 'DEMO-OPS-RCPT-' || to_char(work_date, 'YYYYMMDD'), work_date, 'Two-week operating fuel delivery.', demo_user_id, demo_user_id
      where not exists (select 1 from public.fuel_receipts where organization_id = org_id and reference = 'DEMO-OPS-RCPT-' || to_char(work_date, 'YYYYMMDD'));
    end if;

    if day_offset in (11, 7, 3) then
      insert into public.downtime_records (organization_id, mine_site_id, shift_id, equipment_id, reason, minutes, notes, created_by, updated_by)
      select org_id, site_id, active_shift_id, generator_id, 'Demo planned generator inspection', 35 + day_offset, 'DEMO-OPS-DOWNTIME-' || to_char(work_date, 'YYYYMMDD'), demo_user_id, demo_user_id
      where not exists (select 1 from public.downtime_records where organization_id = org_id and notes = 'DEMO-OPS-DOWNTIME-' || to_char(work_date, 'YYYYMMDD'));

      insert into public.maintenance_requests (organization_id, mine_site_id, equipment_id, title, description, priority, status, reported_by_worker_id, reported_on, created_by, updated_by)
      select org_id, site_id, generator_id, 'Demo generator inspection ' || to_char(work_date, 'DD Mon'), 'Two-week planned inspection history.', case when day_offset = 3 then 'high'::public.maintenance_priority else 'medium'::public.maintenance_priority end, 'closed', supervisor_id, work_date, demo_user_id, demo_user_id
      where not exists (select 1 from public.maintenance_requests where organization_id = org_id and title = 'Demo generator inspection ' || to_char(work_date, 'DD Mon'));
      select id into request_id from public.maintenance_requests where organization_id = org_id and title = 'Demo generator inspection ' || to_char(work_date, 'DD Mon');

      insert into public.maintenance_work_orders (organization_id, mine_site_id, equipment_id, request_id, title, description, priority, status, assigned_worker_id, scheduled_for, notes, created_by, updated_by)
      select org_id, site_id, generator_id, request_id, 'Demo generator service ' || to_char(work_date, 'DD Mon'), 'Completed preventative maintenance demonstration.', case when day_offset = 3 then 'high'::public.maintenance_priority else 'medium'::public.maintenance_priority end, 'completed', technician_id, work_date, 'DEMO-OPS-WO-' || to_char(work_date, 'YYYYMMDD'), demo_user_id, demo_user_id
      where not exists (select 1 from public.maintenance_work_orders where organization_id = org_id and notes = 'DEMO-OPS-WO-' || to_char(work_date, 'YYYYMMDD'));
      select id into current_work_order_id from public.maintenance_work_orders where organization_id = org_id and notes = 'DEMO-OPS-WO-' || to_char(work_date, 'YYYYMMDD');

      insert into public.maintenance_costs (organization_id, work_order_id, cost_type, amount, description, incurred_on, created_by, updated_by)
      select org_id, current_work_order_id, 'parts', 72000 + (day_offset * 1000), 'Demo generator service parts.', work_date, demo_user_id, demo_user_id
      where not exists (select 1 from public.maintenance_costs mc where mc.work_order_id = current_work_order_id and mc.description = 'Demo generator service parts.');
    end if;
  end loop;

  -- Direct seed rows do not use the client-only fuel movement functions; set the demonstrated closing balance explicitly.
  update public.fuel_storage_locations
  set current_balance_litres = 2185, updated_by = demo_user_id
  where id = diesel_store_id;

  insert into public.ore_lots (organization_id, mine_site_id, lot_number, produced_on, source_location, ore_tonnes, grade_ppm, grade_method, bag_count, bag_weight_kg, status, notes, created_by, updated_by)
  values
    (org_id, site_id, 'DEMO-ORE-20260725-01', current_date - 13, 'Demo Pit 2 stockpile', 18.500, 3.2800, 'Demo laboratory assay', 370, 50, 'dispatched', 'Two-week ore handling demonstration.', demo_user_id, demo_user_id),
    (org_id, site_id, 'DEMO-ORE-20260730-01', current_date - 8, 'Demo Pit 2 stockpile', 22.000, 3.5400, 'Demo laboratory assay', 440, 50, 'in_transit', 'Two-week ore handling demonstration.', demo_user_id, demo_user_id),
    (org_id, site_id, 'DEMO-ORE-20260805-01', current_date - 2, 'Demo Pit 2 stockpile', 16.750, 3.1100, 'Demo laboratory assay', 335, 50, 'bagged', 'Two-week ore handling demonstration.', demo_user_id, demo_user_id)
  on conflict (organization_id, lot_number) do update
  set ore_tonnes = excluded.ore_tonnes, grade_ppm = excluded.grade_ppm, bag_count = excluded.bag_count, bag_weight_kg = excluded.bag_weight_kg, status = excluded.status, updated_by = excluded.updated_by;

  insert into public.ore_dispatches (organization_id, mine_site_id, ore_lot_id, processing_plant, dispatched_on, dispatched_tonnes, dispatched_bags, vehicle_reference, dispatch_reference, status, notes, created_by, updated_by)
  select org_id, site_id, lot.id, 'Demo Kahama Processing Plant', current_date - 12, 18.500, 370, 'DEMO-T 481 ABC', 'DEMO-WAYBILL-001', 'received', 'Two-week ore dispatch demonstration.', demo_user_id, demo_user_id
  from public.ore_lots lot
  where lot.organization_id = org_id and lot.lot_number = 'DEMO-ORE-20260725-01'
    and not exists (select 1 from public.ore_dispatches d where d.organization_id = org_id and d.dispatch_reference = 'DEMO-WAYBILL-001');
  insert into public.ore_dispatches (organization_id, mine_site_id, ore_lot_id, processing_plant, dispatched_on, dispatched_tonnes, dispatched_bags, vehicle_reference, dispatch_reference, status, notes, created_by, updated_by)
  select org_id, site_id, lot.id, 'Demo Kahama Processing Plant', current_date - 1, 10.000, 200, 'DEMO-T 794 DFD', 'DEMO-WAYBILL-002', 'in_transit', 'Two-week ore dispatch demonstration.', demo_user_id, demo_user_id
  from public.ore_lots lot
  where lot.organization_id = org_id and lot.lot_number = 'DEMO-ORE-20260730-01'
    and not exists (select 1 from public.ore_dispatches d where d.organization_id = org_id and d.dispatch_reference = 'DEMO-WAYBILL-002');

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  select org_id, demo_user_id, 'seeded', 'operational_demo_two_weeks', org_id,
    jsonb_build_object('label', 'Demo data', 'days', 14, 'through', current_date, 'source', 'supabase/seed-demo-two-weeks.sql')
  where not exists (
    select 1 from public.audit_logs where organization_id = org_id and entity_type = 'operational_demo_two_weeks'
  );
end $$;
