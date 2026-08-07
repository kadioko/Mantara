-- Operational showcase data for developer3450@gmail.com.
-- Run after seed-demo.sql and migrations 0001-0014. All records are clearly labelled Demo and the
-- guards make this safe to run repeatedly without creating duplicate showcase records.
do $$
declare
  demo_user_id uuid;
  org_id uuid;
  site_id uuid;
  supervisor_id uuid;
  operator_id uuid;
  storekeeper_id uuid;
  excavator_id uuid;
  generator_id uuid;
  day_shift_id uuid;
  diesel_store_id uuid;
  parts_category_id uuid;
  supplier_id uuid;
  filter_item_id uuid;
  lubricant_item_id uuid;
  main_store_id uuid;
  maintenance_request_id uuid;
  demo_work_order_id uuid;
  expense_category_id uuid;
  licence_id uuid;
  requirement_id uuid;
  incident_id uuid;
  inspection_id uuid;
begin
  select p.id into demo_user_id from public.profiles p join auth.users u on u.id = p.id
  where lower(u.email) = 'developer3450@gmail.com';
  if demo_user_id is null then raise exception 'Demo user developer3450@gmail.com must exist first.'; end if;

  select id into org_id from public.organizations where name = 'Mantara Demo Mining Company' and deleted_at is null;
  select id into site_id from public.mine_sites where organization_id = org_id and name = 'Kahama Demo Gold Site' and deleted_at is null;
  if org_id is null or site_id is null then raise exception 'Run supabase/seed-demo.sql before the operational demo seed.'; end if;

  select id into supervisor_id from public.workers where organization_id = org_id and employee_number = 'DEMO-001';
  select id into operator_id from public.workers where organization_id = org_id and employee_number = 'DEMO-002';
  select id into storekeeper_id from public.workers where organization_id = org_id and employee_number = 'DEMO-003';

  insert into public.equipment (organization_id, mine_site_id, asset_code, name, category, make, model, status, meter_type, current_meter, notes, created_by, updated_by)
  values
    (org_id, site_id, 'DEMO-EXC-001', 'Demo CAT 320 Excavator', 'excavator', 'Caterpillar', '320 GC', 'operational', 'hours', 1246.00, 'Demo asset for the Kahama workspace.', demo_user_id, demo_user_id),
    (org_id, site_id, 'DEMO-GEN-001', 'Demo Site Generator', 'generator', 'Perkins', '1106A', 'maintenance', 'hours', 463.00, 'Demo asset currently scheduled for service.', demo_user_id, demo_user_id)
  on conflict (organization_id, asset_code) do update set status = excluded.status, updated_by = excluded.updated_by;

  select id into excavator_id from public.equipment where organization_id = org_id and asset_code = 'DEMO-EXC-001';
  select id into generator_id from public.equipment where organization_id = org_id and asset_code = 'DEMO-GEN-001';

  insert into public.equipment_assignments (organization_id, mine_site_id, equipment_id, worker_id, assignment_name, starts_on, created_by, updated_by)
  select org_id, site_id, excavator_id, operator_id, 'Demo day-shift pit assignment', current_date - 14, demo_user_id, demo_user_id
  where not exists (select 1 from public.equipment_assignments where equipment_id = excavator_id and assignment_name = 'Demo day-shift pit assignment');

  insert into public.equipment_meter_readings (organization_id, mine_site_id, equipment_id, reading_value, reading_at, notes, created_by, updated_by)
  select org_id, site_id, excavator_id, 1248.50, now(), 'Demo current meter reading', demo_user_id, demo_user_id
  where not exists (select 1 from public.equipment_meter_readings where equipment_id = excavator_id and notes = 'Demo current meter reading');

  insert into public.shifts (organization_id, mine_site_id, name, shift_date, supervisor_worker_id, status, notes, created_by, updated_by)
  values (org_id, site_id, 'Demo Day Shift', current_date, supervisor_id, 'active', 'Operational demo shift.', demo_user_id, demo_user_id)
  on conflict (mine_site_id, shift_date, name) do update set supervisor_worker_id = excluded.supervisor_worker_id, status = excluded.status, updated_by = excluded.updated_by;
  select id into day_shift_id from public.shifts where mine_site_id = site_id and shift_date = current_date and name = 'Demo Day Shift';

  insert into public.shift_assignments (organization_id, shift_id, worker_id, role_note, created_by)
  values (org_id, day_shift_id, operator_id, 'Demo excavator operator', demo_user_id)
  on conflict (shift_id, worker_id) do nothing;

  insert into public.production_entries (organization_id, mine_site_id, shift_id, entry_date, material, quantity, unit, grade, location, status, notes, created_by, updated_by)
  select org_id, site_id, day_shift_id, current_date, 'Gold-bearing ore (Demo)', 128.500, 'tonnes', 3.42, 'Demo Pit 2', 'approved', 'Approved showcase production entry.', demo_user_id, demo_user_id
  where not exists (select 1 from public.production_entries where organization_id = org_id and entry_date = current_date and material = 'Gold-bearing ore (Demo)' and location = 'Demo Pit 2');

  insert into public.downtime_records (organization_id, mine_site_id, shift_id, equipment_id, reason, minutes, notes, created_by, updated_by)
  select org_id, site_id, day_shift_id, generator_id, 'Demo generator inspection', 45, 'Short planned maintenance demonstration.', demo_user_id, demo_user_id
  where not exists (select 1 from public.downtime_records where equipment_id = generator_id and reason = 'Demo generator inspection');

  insert into public.fuel_storage_locations (organization_id, mine_site_id, name, fuel_type, capacity_litres, current_balance_litres, notes, created_by, updated_by)
  values (org_id, site_id, 'Demo Main Diesel Tank', 'diesel', 5000, 1740, 'Demo fuel store with sample movements.', demo_user_id, demo_user_id)
  on conflict (mine_site_id, name) do update set current_balance_litres = excluded.current_balance_litres, updated_by = excluded.updated_by;
  select id into diesel_store_id from public.fuel_storage_locations where mine_site_id = site_id and name = 'Demo Main Diesel Tank';

  insert into public.fuel_receipts (organization_id, mine_site_id, storage_location_id, litres, unit_cost, supplier, reference, received_on, notes, created_by, updated_by)
  select org_id, site_id, diesel_store_id, 2000, 3100, 'Demo Fuel Supplies Ltd', 'DEMO-FUEL-RCPT-001', current_date - 2, 'Demo fuel delivery.', demo_user_id, demo_user_id
  where not exists (select 1 from public.fuel_receipts where organization_id = org_id and reference = 'DEMO-FUEL-RCPT-001');

  insert into public.fuel_issues (organization_id, mine_site_id, storage_location_id, equipment_id, worker_id, litres, equipment_meter, issued_on, notes, created_by, updated_by)
  select org_id, site_id, diesel_store_id, excavator_id, operator_id, 260, 1248.50, current_date - 1, 'Demo issue to excavator.', demo_user_id, demo_user_id
  where not exists (select 1 from public.fuel_issues where organization_id = org_id and notes = 'Demo issue to excavator.');

  insert into public.maintenance_requests (organization_id, mine_site_id, equipment_id, title, description, priority, status, reported_by_worker_id, reported_on, created_by, updated_by)
  select org_id, site_id, generator_id, 'Demo generator 500-hour service', 'Scheduled showcase service for the site generator.', 'high', 'planned', supervisor_id, current_date - 1, demo_user_id, demo_user_id
  where not exists (select 1 from public.maintenance_requests where organization_id = org_id and title = 'Demo generator 500-hour service');
  select id into maintenance_request_id from public.maintenance_requests where organization_id = org_id and title = 'Demo generator 500-hour service';

  insert into public.maintenance_work_orders (organization_id, mine_site_id, equipment_id, request_id, title, description, priority, status, assigned_worker_id, scheduled_for, notes, created_by, updated_by)
  select org_id, site_id, generator_id, maintenance_request_id, 'Demo generator service work order', 'Change oil and inspect belts.', 'high', 'in_progress', operator_id, current_date, 'Demo work order in progress.', demo_user_id, demo_user_id
  where not exists (select 1 from public.maintenance_work_orders where organization_id = org_id and title = 'Demo generator service work order');
  select id into demo_work_order_id from public.maintenance_work_orders where organization_id = org_id and title = 'Demo generator service work order';

  insert into public.maintenance_parts (organization_id, work_order_id, part_name, quantity, unit_cost, notes, created_by, updated_by)
  select org_id, demo_work_order_id, 'Demo oil filter', 1, 48000, 'Demo maintenance part.', demo_user_id, demo_user_id
  where not exists (select 1 from public.maintenance_parts p where p.work_order_id = demo_work_order_id and p.part_name = 'Demo oil filter');

  insert into public.maintenance_schedules (organization_id, mine_site_id, equipment_id, name, interval_meter, last_service_meter, next_due_meter, next_due_on, notes, created_by, updated_by)
  select org_id, site_id, generator_id, 'Demo generator preventive service', 250, 250, 500, current_date + 14, 'Demo preventive schedule.', demo_user_id, demo_user_id
  where not exists (select 1 from public.maintenance_schedules where equipment_id = generator_id and name = 'Demo generator preventive service');

  insert into public.inventory_categories (organization_id, name, created_by, updated_by) values (org_id, 'Demo maintenance parts', demo_user_id, demo_user_id) on conflict (organization_id, name) do nothing;
  insert into public.suppliers (organization_id, name, contact_name, phone_number, notes, created_by, updated_by) values (org_id, 'Demo Mining Supplies', 'Neema John', '+255 700 000 003', 'Demo supplier.', demo_user_id, demo_user_id) on conflict (organization_id, name) do nothing;
  select id into parts_category_id from public.inventory_categories where organization_id = org_id and name = 'Demo maintenance parts';
  select id into supplier_id from public.suppliers where organization_id = org_id and name = 'Demo Mining Supplies';

  insert into public.inventory_items (organization_id, category_id, sku, name, unit, reorder_level, notes, created_by, updated_by)
  values
    (org_id, parts_category_id, 'DEMO-FILTER-01', 'Demo hydraulic filter', 'each', 5, 'Demo stock item at reorder level.', demo_user_id, demo_user_id),
    (org_id, parts_category_id, 'DEMO-LUBE-20L', 'Demo engine oil 20L', 'litres', 40, 'Demo stock item.', demo_user_id, demo_user_id)
  on conflict (organization_id, sku) do nothing;
  select id into filter_item_id from public.inventory_items where organization_id = org_id and sku = 'DEMO-FILTER-01';
  select id into lubricant_item_id from public.inventory_items where organization_id = org_id and sku = 'DEMO-LUBE-20L';

  insert into public.inventory_locations (organization_id, mine_site_id, name, notes, created_by, updated_by)
  values (org_id, site_id, 'Demo Main Store', 'Demo site store.', demo_user_id, demo_user_id)
  on conflict (mine_site_id, name) do nothing;
  select id into main_store_id from public.inventory_locations where mine_site_id = site_id and name = 'Demo Main Store';

  insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity, updated_by)
  values (org_id, filter_item_id, main_store_id, 5, demo_user_id), (org_id, lubricant_item_id, main_store_id, 72, demo_user_id)
  on conflict (inventory_item_id, inventory_location_id) do update set quantity = excluded.quantity, updated_at = now(), updated_by = excluded.updated_by;

  insert into public.stock_receipts (organization_id, inventory_item_id, inventory_location_id, supplier_id, quantity, unit_cost, reference, received_on, notes, created_by)
  select org_id, filter_item_id, main_store_id, supplier_id, 10, 48000, 'DEMO-STOCK-RCPT-001', current_date - 7, 'Demo receipt.', demo_user_id
  where not exists (select 1 from public.stock_receipts where organization_id = org_id and reference = 'DEMO-STOCK-RCPT-001');

  insert into public.expense_categories (organization_id, name, created_by, updated_by) values (org_id, 'Demo fuel and operations', demo_user_id, demo_user_id) on conflict (organization_id, name) do nothing;
  select id into expense_category_id from public.expense_categories where organization_id = org_id and name = 'Demo fuel and operations';
  insert into public.expenses (organization_id, mine_site_id, category_id, supplier_id, work_order_id, description, amount, currency_code, incurred_on, reference, status, notes, submitted_at, created_by, updated_by)
  select org_id, site_id, expense_category_id, supplier_id, demo_work_order_id, 'Demo generator service materials', 248000, 'TZS', current_date - 1, 'DEMO-EXP-001', 'approved', 'Approved demo expense.', now(), demo_user_id, demo_user_id
  where not exists (select 1 from public.expenses where organization_id = org_id and reference = 'DEMO-EXP-001');
  insert into public.budgets (organization_id, mine_site_id, category_id, name, period, starts_on, ends_on, amount, currency_code, notes, created_by, updated_by)
  select org_id, site_id, expense_category_id, 'Demo monthly operations budget', 'monthly', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 1500000, 'TZS', 'Demo budget.', demo_user_id, demo_user_id
  where not exists (select 1 from public.budgets where organization_id = org_id and name = 'Demo monthly operations budget');

  insert into public.mineral_licences (organization_id, mine_site_id, licence_number, licence_type, issuing_authority, holder_name, issued_on, expires_on, status, notes, created_by, updated_by)
  values (org_id, site_id, 'DEMO-ML-2026-001', 'Prospecting licence', 'Demo Mining Authority', 'Mantara Demo Mining Company', current_date - 180, current_date + 120, 'active', 'Demo compliance record only.', demo_user_id, demo_user_id)
  on conflict (organization_id, licence_number) do nothing;
  select id into licence_id from public.mineral_licences where organization_id = org_id and licence_number = 'DEMO-ML-2026-001';
  insert into public.compliance_requirements (organization_id, name, description, category, recurrence, created_by, updated_by)
  values (org_id, 'Demo monthly production return', 'Demo organization-authored compliance requirement.', 'Reporting', 'monthly', demo_user_id, demo_user_id)
  on conflict (organization_id, name) do nothing;
  select id into requirement_id from public.compliance_requirements where organization_id = org_id and name = 'Demo monthly production return';
  insert into public.compliance_tasks (organization_id, mine_site_id, requirement_id, licence_id, title, details, due_on, assigned_worker_id, created_by, updated_by)
  select org_id, site_id, requirement_id, licence_id, 'Demo production return due', 'Prepare a sample return for the demo workspace.', current_date + 7, supervisor_id, demo_user_id, demo_user_id
  where not exists (select 1 from public.compliance_tasks where organization_id = org_id and title = 'Demo production return due');

  insert into public.safety_incidents (organization_id, mine_site_id, reference, title, category, severity, status, occurred_at, reported_on, location, summary, reported_by_worker_id, equipment_id, people_involved, lost_time_hours, created_by, updated_by)
  values (org_id, site_id, 'DEMO-SAFE-001', 'Demo near-miss at loading bay', 'near_miss', 'medium', 'investigating', now() - interval '1 day', current_date - 1, 'Demo loading bay', 'A non-injury near-miss recorded for product demonstration.', operator_id, excavator_id, 1, 0, demo_user_id, demo_user_id)
  on conflict (organization_id, reference) do nothing;
  select id into incident_id from public.safety_incidents where organization_id = org_id and reference = 'DEMO-SAFE-001';
  insert into public.safety_inspections (organization_id, mine_site_id, title, area, inspected_on, inspector_worker_id, findings, is_satisfactory, created_by, updated_by)
  select org_id, site_id, 'Demo weekly pit inspection', 'Demo Pit 2', current_date, supervisor_id, 'Housekeeping and barriers checked for demonstration.', true, demo_user_id, demo_user_id
  where not exists (select 1 from public.safety_inspections where organization_id = org_id and title = 'Demo weekly pit inspection' and inspected_on = current_date);
  select id into inspection_id from public.safety_inspections where organization_id = org_id and title = 'Demo weekly pit inspection' and inspected_on = current_date;
  insert into public.corrective_actions (organization_id, mine_site_id, incident_id, inspection_id, description, assigned_worker_id, due_on, status, created_by, updated_by)
  select org_id, site_id, incident_id, inspection_id, 'Demo refresh of loading-bay barrier markings', supervisor_id, current_date + 3, 'open', demo_user_id, demo_user_id
  where not exists (select 1 from public.corrective_actions where organization_id = org_id and description = 'Demo refresh of loading-bay barrier markings');

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  select org_id, demo_user_id, 'seeded', 'operational_demo_workspace', org_id, jsonb_build_object('label', 'Demo data', 'source', 'supabase/seed-demo-operational.sql')
  where not exists (
    select 1 from public.audit_logs
    where organization_id = org_id
      and action = 'seeded'
      and entity_type = 'operational_demo_workspace'
      and new_values->>'source' = 'supabase/seed-demo-operational.sql'
  );
end $$;
