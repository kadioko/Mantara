-- The rest of the audit trail.
--
-- Today the log records member changes, role changes, ore dispatches, and every time someone opens
-- an injured worker's medical detail. It does not record any of these:
--
--   * a fuel adjustment — someone taking 4,000 litres out of a tank with a free-text reason
--   * a fuel stock take, which corrects the balance to whatever was measured
--   * a stock adjustment, and a stock count, which corrects many balances at once
--   * approving or rejecting production, which is what a royalty return is built from
--   * approving an expense, which is money
--   * retiring anything — a worker, a machine, a store, a tank, a compliance obligation
--
-- Those are the actions that move value or discharge a legal duty, and they are exactly what an
-- inspector or an owner asks about after the fact. "Who signed off that production?" and "who
-- adjusted the diesel?" had no answer on any screen.
--
-- **Recorded by trigger, not at the call site.** An audit trail that depends on each function
-- remembering to write one has holes wherever somebody forgot, and the holes are invisible — the
-- log looks fine, it is simply missing the row. A trigger fires for every write to the table
-- whatever path reached it, including a hand-run statement in the SQL editor.

/**
 * Writes one audit row. Reads the organization, and the site where the table has one, from the row
 * itself, so the same function serves every table.
 *
 * TG_ARGV[0] is the action name; TG_ARGV[1] is the entity type.
 */
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  subject jsonb := to_jsonb(coalesce(new, old));
  previous jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
begin
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, previous_values, new_values)
  values (
    (subject ->> 'organization_id')::uuid,
    auth.uid(),
    tg_argv[0],
    tg_argv[1],
    (subject ->> 'id')::uuid,
    previous,
    case when tg_op = 'DELETE' then null else subject end
  );
  return coalesce(new, old);
end; $$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

/**
 * The same, but only when a status column actually changed. Used for approvals, so an unrelated edit
 * to an entry does not fill the log with rows nobody needs to read.
 */
create or replace function public.audit_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is not distinct from new.status then return new; end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, previous_values, new_values)
  values (
    new.organization_id,
    auth.uid(),
    tg_argv[0] || '.' || new.status,
    tg_argv[1],
    new.id,
    jsonb_build_object('status', old.status),
    to_jsonb(new)
  );
  return new;
end; $$;

revoke all on function public.audit_status_change() from public, anon, authenticated;

/**
 * Retirement and soft deletion. Both are how a record leaves the working set, and both are worth a
 * line — an item that quietly stops appearing is the kind of change people later dispute.
 */
create or replace function public.audit_retirement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  before jsonb := to_jsonb(old);
  after jsonb := to_jsonb(new);
  retired boolean := false;
  verb text;
begin
  -- Both sides are read through jsonb rather than as record fields. `old.is_active` is resolved
  -- when the function runs and raises "record old has no field is_active" on every table that does
  -- not have the column — which is most of them. Guarding it with a `?` test does not help, because
  -- the field reference is still evaluated.
  if after ? 'is_active' and (before ->> 'is_active') is distinct from (after ->> 'is_active') then
    retired := true;
    verb := case when (after ->> 'is_active') = 'true' then 'restored' else 'retired' end;
  end if;
  if after ? 'deleted_at' and (before ->> 'deleted_at') is distinct from (after ->> 'deleted_at') then
    retired := true;
    verb := case when (after ->> 'deleted_at') is null then 'restored' else 'removed' end;
  end if;
  if not retired then return new; end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (new.organization_id, auth.uid(), tg_argv[0] || '.' || verb, tg_argv[1], new.id, after);
  return new;
end; $$;

revoke all on function public.audit_retirement() from public, anon, authenticated;

-- Movements that change a balance. Every one is an insert, so the row itself is the whole story.
drop trigger if exists audit_fuel_adjustment on public.fuel_adjustments;
create trigger audit_fuel_adjustment after insert on public.fuel_adjustments
for each row execute function public.audit_row_change('fuel.adjusted', 'fuel_adjustment');

drop trigger if exists audit_fuel_stock_take on public.fuel_stock_takes;
create trigger audit_fuel_stock_take after insert on public.fuel_stock_takes
for each row execute function public.audit_row_change('fuel.stock_take', 'fuel_stock_take');

drop trigger if exists audit_stock_adjustment on public.stock_adjustments;
create trigger audit_stock_adjustment after insert on public.stock_adjustments
for each row execute function public.audit_row_change('inventory.adjusted', 'stock_adjustment');

-- Approvals. A rejection is as worth recording as an approval — more so, sometimes.
drop trigger if exists audit_production_review on public.production_entries;
create trigger audit_production_review after update on public.production_entries
for each row execute function public.audit_status_change('production', 'production_entry');

drop trigger if exists audit_expense_review on public.expenses;
create trigger audit_expense_review after update on public.expenses
for each row execute function public.audit_status_change('expense', 'expense');

drop trigger if exists audit_stock_count_applied on public.inventory_stock_counts;
create trigger audit_stock_count_applied after update on public.inventory_stock_counts
for each row execute function public.audit_status_change('inventory.count', 'inventory_stock_count');

-- Things leaving the working set.
drop trigger if exists audit_worker_retirement on public.workers;
create trigger audit_worker_retirement after update on public.workers
for each row execute function public.audit_retirement('worker', 'worker');

drop trigger if exists audit_equipment_retirement on public.equipment;
create trigger audit_equipment_retirement after update on public.equipment
for each row execute function public.audit_retirement('equipment', 'equipment');

drop trigger if exists audit_inventory_item_retirement on public.inventory_items;
create trigger audit_inventory_item_retirement after update on public.inventory_items
for each row execute function public.audit_retirement('inventory.item', 'inventory_item');

drop trigger if exists audit_inventory_location_retirement on public.inventory_locations;
create trigger audit_inventory_location_retirement after update on public.inventory_locations
for each row execute function public.audit_retirement('inventory.store', 'inventory_location');

drop trigger if exists audit_fuel_location_retirement on public.fuel_storage_locations;
create trigger audit_fuel_location_retirement after update on public.fuel_storage_locations
for each row execute function public.audit_retirement('fuel.store', 'fuel_storage_location');

drop trigger if exists audit_requirement_retirement on public.compliance_requirements;
create trigger audit_requirement_retirement after update on public.compliance_requirements
for each row execute function public.audit_retirement('compliance.requirement', 'compliance_requirement');

drop trigger if exists audit_supplier_retirement on public.suppliers;
create trigger audit_supplier_retirement after update on public.suppliers
for each row execute function public.audit_retirement('inventory.supplier', 'supplier');

drop trigger if exists audit_licence_retirement on public.mineral_licences;
create trigger audit_licence_retirement after update on public.mineral_licences
for each row execute function public.audit_retirement('compliance.licence', 'mineral_licence');

-- The log is read by organization and date on every visit to the audit screen.
create index if not exists audit_logs_org_action_idx
  on public.audit_logs (organization_id, action, created_at desc);

-- Every create in this file is guarded, so the whole migration can be applied twice.
