-- Inventory module: catalogue, stores, and a stock ledger whose balances are only ever moved by
-- functions that lock the balance row first, so stock cannot go negative under concurrent issues.
create type public.stock_movement_reason as enum ('purchase', 'consumption', 'transfer', 'correction', 'loss', 'return');

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 160),
  contact_name text,
  phone_number text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category_id uuid references public.inventory_categories(id),
  sku text,
  name text not null check (char_length(trim(name)) between 2 and 160),
  unit text not null default 'each' check (char_length(trim(unit)) between 1 and 20),
  reorder_level numeric(16,3) check (reorder_level is null or reorder_level >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  unique (organization_id, sku),
  unique (organization_id, id),
  foreign key (organization_id, category_id) references public.inventory_categories(organization_id, id)
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (mine_site_id, name),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id)
);

create table public.inventory_stock_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  inventory_location_id uuid not null references public.inventory_locations(id),
  quantity numeric(16,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (inventory_item_id, inventory_location_id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items(organization_id, id),
  foreign key (organization_id, inventory_location_id) references public.inventory_locations(organization_id, id)
);

create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  inventory_location_id uuid not null references public.inventory_locations(id),
  supplier_id uuid references public.suppliers(id),
  quantity numeric(16,3) not null check (quantity > 0),
  unit_cost numeric(16,4) check (unit_cost is null or unit_cost >= 0),
  reference text,
  received_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items(organization_id, id),
  foreign key (organization_id, inventory_location_id) references public.inventory_locations(organization_id, id),
  foreign key (organization_id, supplier_id) references public.suppliers(organization_id, id)
);

create table public.stock_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  inventory_location_id uuid not null references public.inventory_locations(id),
  work_order_id uuid references public.maintenance_work_orders(id),
  equipment_id uuid references public.equipment(id),
  worker_id uuid references public.workers(id),
  quantity numeric(16,3) not null check (quantity > 0),
  reason public.stock_movement_reason not null default 'consumption',
  issued_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items(organization_id, id),
  foreign key (organization_id, inventory_location_id) references public.inventory_locations(organization_id, id),
  foreign key (organization_id, work_order_id) references public.maintenance_work_orders(organization_id, id),
  foreign key (organization_id, equipment_id) references public.equipment(organization_id, id)
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  from_location_id uuid not null references public.inventory_locations(id),
  to_location_id uuid not null references public.inventory_locations(id),
  quantity numeric(16,3) not null check (quantity > 0),
  transferred_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  check (from_location_id <> to_location_id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items(organization_id, id),
  foreign key (organization_id, from_location_id) references public.inventory_locations(organization_id, id),
  foreign key (organization_id, to_location_id) references public.inventory_locations(organization_id, id)
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  inventory_location_id uuid not null references public.inventory_locations(id),
  quantity_delta numeric(16,3) not null check (quantity_delta <> 0),
  reason public.stock_movement_reason not null default 'correction',
  explanation text not null check (char_length(trim(explanation)) between 2 and 200),
  adjusted_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items(organization_id, id),
  foreign key (organization_id, inventory_location_id) references public.inventory_locations(organization_id, id)
);

create index inventory_items_active_idx on public.inventory_items(organization_id, name) where deleted_at is null and is_active;
create index inventory_locations_site_idx on public.inventory_locations(organization_id, mine_site_id) where is_active;
create index stock_balances_item_idx on public.inventory_stock_balances(inventory_item_id);
create index stock_balances_location_idx on public.inventory_stock_balances(inventory_location_id);
create index stock_receipts_item_idx on public.stock_receipts(inventory_item_id, received_on desc);
create index stock_issues_item_idx on public.stock_issues(inventory_item_id, issued_on desc);
create index stock_issues_work_order_idx on public.stock_issues(work_order_id) where work_order_id is not null;
create index stock_transfers_item_idx on public.stock_transfers(inventory_item_id, transferred_on desc);
create index stock_adjustments_item_idx on public.stock_adjustments(inventory_item_id, adjusted_on desc);

create trigger inventory_categories_updated_at before update on public.inventory_categories for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger inventory_locations_updated_at before update on public.inventory_locations for each row execute function public.set_updated_at();

-- Locks (or creates) one item/location balance row and applies a delta, refusing to go negative.
-- Callers that touch two balances must call this in a deterministic order; see move_stock below.
create or replace function public.apply_stock_movement(
  requested_item_id uuid,
  requested_location_id uuid,
  delta numeric,
  required_permission text,
  out movement_organization_id uuid
) language plpgsql security definer set search_path = public as $$
declare item record; location record; current_quantity numeric; balance_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select id, organization_id, name into item
  from public.inventory_items where id = requested_item_id and deleted_at is null;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;

  select id, organization_id, is_active, name into location
  from public.inventory_locations where id = requested_location_id;
  if not found then raise exception 'Inventory store not found' using errcode = 'P0002'; end if;
  if location.organization_id <> item.organization_id then
    raise exception 'That item and store belong to different organizations' using errcode = 'P0001';
  end if;
  if not location.is_active then raise exception 'That store is no longer active' using errcode = 'P0001'; end if;
  if not public.has_permission(item.organization_id, required_permission) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  -- Create the balance row if this is the first movement, then lock it.
  insert into public.inventory_stock_balances (organization_id, inventory_item_id, inventory_location_id, quantity, updated_by)
  values (item.organization_id, requested_item_id, requested_location_id, 0, auth.uid())
  on conflict (inventory_item_id, inventory_location_id) do nothing;

  select id, quantity into balance_id, current_quantity
  from public.inventory_stock_balances
  where inventory_item_id = requested_item_id and inventory_location_id = requested_location_id
  for update;

  if current_quantity + delta < 0 then
    raise exception 'Only % % of % remain in %', current_quantity, (select unit from public.inventory_items where id = requested_item_id), item.name, location.name
      using errcode = 'P0001';
  end if;

  update public.inventory_stock_balances
  set quantity = current_quantity + delta, updated_at = now(), updated_by = auth.uid()
  where id = balance_id;

  movement_organization_id := item.organization_id;
end; $$;

create or replace function public.record_stock_receipt(
  requested_item_id uuid,
  requested_location_id uuid,
  quantity numeric,
  requested_supplier_id uuid default null,
  unit_cost numeric default null,
  reference text default null,
  received_on date default current_date,
  receipt_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; new_id uuid := gen_random_uuid();
begin
  if quantity is null or quantity <= 0 then raise exception 'Enter a quantity greater than zero' using errcode = 'P0001'; end if;
  select m.movement_organization_id into v_org
  from public.apply_stock_movement(requested_item_id, requested_location_id, quantity, 'inventory.receive') m;
  insert into public.stock_receipts (id, organization_id, inventory_item_id, inventory_location_id, supplier_id, quantity, unit_cost, reference, received_on, notes, created_by)
  values (new_id, v_org, requested_item_id, requested_location_id, requested_supplier_id, quantity, unit_cost, reference, received_on, receipt_notes, auth.uid());
  return new_id;
end; $$;

create or replace function public.record_stock_issue(
  requested_item_id uuid,
  requested_location_id uuid,
  quantity numeric,
  requested_work_order_id uuid default null,
  requested_equipment_id uuid default null,
  requested_worker_id uuid default null,
  reason public.stock_movement_reason default 'consumption',
  issued_on date default current_date,
  issue_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; new_id uuid := gen_random_uuid();
begin
  if quantity is null or quantity <= 0 then raise exception 'Enter a quantity greater than zero' using errcode = 'P0001'; end if;
  select m.movement_organization_id into v_org
  from public.apply_stock_movement(requested_item_id, requested_location_id, -quantity, 'inventory.issue') m;
  insert into public.stock_issues (id, organization_id, inventory_item_id, inventory_location_id, work_order_id, equipment_id, worker_id, quantity, reason, issued_on, notes, created_by)
  values (new_id, v_org, requested_item_id, requested_location_id, requested_work_order_id, requested_equipment_id, requested_worker_id, quantity, reason, issued_on, issue_notes, auth.uid());
  return new_id;
end; $$;

-- A transfer touches two balance rows. Both are locked in a fixed order (lowest location id first) so
-- two opposite transfers running at once cannot deadlock against each other.
create or replace function public.record_stock_transfer(
  requested_item_id uuid,
  from_location_id uuid,
  to_location_id uuid,
  quantity numeric,
  transferred_on date default current_date,
  transfer_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; new_id uuid := gen_random_uuid();
begin
  if quantity is null or quantity <= 0 then raise exception 'Enter a quantity greater than zero' using errcode = 'P0001'; end if;
  if from_location_id = to_location_id then raise exception 'Choose two different stores' using errcode = 'P0001'; end if;

  if from_location_id < to_location_id then
    select m.movement_organization_id into v_org
    from public.apply_stock_movement(requested_item_id, from_location_id, -quantity, 'inventory.transfer') m;
    perform public.apply_stock_movement(requested_item_id, to_location_id, quantity, 'inventory.transfer');
  else
    perform public.apply_stock_movement(requested_item_id, to_location_id, quantity, 'inventory.transfer');
    select m.movement_organization_id into v_org
    from public.apply_stock_movement(requested_item_id, from_location_id, -quantity, 'inventory.transfer') m;
  end if;

  insert into public.stock_transfers (id, organization_id, inventory_item_id, from_location_id, to_location_id, quantity, transferred_on, notes, created_by)
  values (new_id, v_org, requested_item_id, from_location_id, to_location_id, quantity, transferred_on, transfer_notes, auth.uid());
  return new_id;
end; $$;

create or replace function public.record_stock_adjustment(
  requested_item_id uuid,
  requested_location_id uuid,
  quantity_delta numeric,
  explanation text,
  reason public.stock_movement_reason default 'correction',
  adjusted_on date default current_date,
  adjustment_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; new_id uuid := gen_random_uuid();
begin
  if quantity_delta is null or quantity_delta = 0 then raise exception 'An adjustment cannot be zero' using errcode = 'P0001'; end if;
  select m.movement_organization_id into v_org
  from public.apply_stock_movement(requested_item_id, requested_location_id, quantity_delta, 'inventory.adjust') m;
  insert into public.stock_adjustments (id, organization_id, inventory_item_id, inventory_location_id, quantity_delta, reason, explanation, adjusted_on, notes, created_by)
  values (new_id, v_org, requested_item_id, requested_location_id, quantity_delta, reason, explanation, adjusted_on, adjustment_notes, auth.uid());
  return new_id;
end; $$;

insert into public.permissions (code, name, description) values
  ('inventory.read', 'View inventory', 'View items, stores, balances, and movements'),
  ('inventory.manage', 'Manage inventory', 'Create and edit items, categories, stores, and suppliers'),
  ('inventory.receive', 'Receive stock', 'Record stock received into a store'),
  ('inventory.issue', 'Issue stock', 'Record stock issued out of a store'),
  ('inventory.transfer', 'Transfer stock', 'Move stock between stores'),
  ('inventory.adjust', 'Adjust stock', 'Record stock corrections and losses')
on conflict (code) do nothing;

insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager', 'inventory.read'),
  ('mine_manager', 'inventory.manage'),
  ('mine_manager', 'inventory.receive'),
  ('mine_manager', 'inventory.issue'),
  ('mine_manager', 'inventory.transfer'),
  ('mine_manager', 'inventory.adjust'),
  ('storekeeper', 'inventory.read'),
  ('storekeeper', 'inventory.manage'),
  ('storekeeper', 'inventory.receive'),
  ('storekeeper', 'inventory.issue'),
  ('storekeeper', 'inventory.transfer'),
  ('storekeeper', 'inventory.adjust'),
  ('site_supervisor', 'inventory.read'),
  ('site_supervisor', 'inventory.issue'),
  ('maintenance_officer', 'inventory.read'),
  ('maintenance_officer', 'inventory.issue'),
  ('accountant', 'inventory.read')
on conflict do nothing;

select public.sync_role_permission_defaults();

alter table public.inventory_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_stock_balances enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_issues enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_adjustments enable row level security;

create policy "inventory categories read permitted" on public.inventory_categories for select using (public.has_permission(organization_id, 'inventory.read'));
create policy "inventory categories write permitted" on public.inventory_categories for all using (public.has_permission(organization_id, 'inventory.manage')) with check (public.has_permission(organization_id, 'inventory.manage'));
create policy "suppliers read permitted" on public.suppliers for select using (public.has_permission(organization_id, 'inventory.read'));
create policy "suppliers write permitted" on public.suppliers for all using (public.has_permission(organization_id, 'inventory.manage')) with check (public.has_permission(organization_id, 'inventory.manage'));
create policy "inventory items read permitted" on public.inventory_items for select using (deleted_at is null and public.has_permission(organization_id, 'inventory.read'));
create policy "inventory items create permitted" on public.inventory_items for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'inventory.manage'));
create policy "inventory items update permitted" on public.inventory_items for update using (public.has_permission(organization_id, 'inventory.manage')) with check (public.has_permission(organization_id, 'inventory.manage'));
create policy "inventory locations read permitted" on public.inventory_locations for select using (public.has_permission(organization_id, 'inventory.read'));
create policy "inventory locations write permitted" on public.inventory_locations for all using (public.has_permission(organization_id, 'inventory.manage')) with check (public.has_permission(organization_id, 'inventory.manage'));

-- Balances and every movement table are read-only to clients. The recording functions are the only
-- writers, so the locked non-negative check cannot be sidestepped by writing a row directly.
create policy "stock balances read permitted" on public.inventory_stock_balances for select using (public.has_permission(organization_id, 'inventory.read'));
create policy "stock receipts read permitted" on public.stock_receipts for select using (public.has_permission(organization_id, 'inventory.read'));
create policy "stock issues read permitted" on public.stock_issues for select using (public.has_permission(organization_id, 'inventory.read'));
create policy "stock transfers read permitted" on public.stock_transfers for select using (public.has_permission(organization_id, 'inventory.read'));
create policy "stock adjustments read permitted" on public.stock_adjustments for select using (public.has_permission(organization_id, 'inventory.read'));

revoke all on function public.apply_stock_movement(uuid, uuid, numeric, text) from public;
revoke all on function public.record_stock_receipt(uuid, uuid, numeric, uuid, numeric, text, date, text) from public;
grant execute on function public.record_stock_receipt(uuid, uuid, numeric, uuid, numeric, text, date, text) to authenticated;
revoke all on function public.record_stock_issue(uuid, uuid, numeric, uuid, uuid, uuid, public.stock_movement_reason, date, text) from public;
grant execute on function public.record_stock_issue(uuid, uuid, numeric, uuid, uuid, uuid, public.stock_movement_reason, date, text) to authenticated;
revoke all on function public.record_stock_transfer(uuid, uuid, uuid, numeric, date, text) from public;
grant execute on function public.record_stock_transfer(uuid, uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.record_stock_adjustment(uuid, uuid, numeric, text, public.stock_movement_reason, date, text) from public;
grant execute on function public.record_stock_adjustment(uuid, uuid, numeric, text, public.stock_movement_reason, date, text) to authenticated;
