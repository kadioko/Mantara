-- Guards for the catalogue editing the application is about to allow.
--
-- Correcting a catalogue entry is the everyday case and needs nothing special. Retiring one is the
-- dangerous case: an item, store or tank taken out of service stops appearing in the movement forms,
-- and any stock still sitting in it becomes invisible and unmovable. Nothing is lost from the
-- database, but the figures an operator sees stop matching what is physically on site, and there is
-- no screen that would show them why.
--
-- The rule is therefore: empty it, then retire it. Enforced here rather than in a form, because a
-- form check is advice and this needs to be a fact.

create or replace function public.protect_stocked_inventory_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare held numeric;
begin
  if old.is_active and not new.is_active then
    select coalesce(sum(quantity), 0) into held
    from public.inventory_stock_balances where inventory_location_id = old.id;
    if held > 0 then
      raise exception 'This store still holds % of stock. Move or issue it before retiring the store.', held
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;

create trigger protect_stocked_inventory_location
before update on public.inventory_locations
for each row execute function public.protect_stocked_inventory_location();

create or replace function public.protect_stocked_inventory_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare held numeric;
begin
  -- Covers both routes out of the catalogue: deactivation and soft deletion.
  if (old.is_active and not new.is_active) or (old.deleted_at is null and new.deleted_at is not null) then
    select coalesce(sum(quantity), 0) into held
    from public.inventory_stock_balances where inventory_item_id = old.id;
    if held > 0 then
      raise exception 'There is still % of this item in stock. Issue or write it off before retiring the item.', held
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;

create trigger protect_stocked_inventory_item
before update on public.inventory_items
for each row execute function public.protect_stocked_inventory_item();

create or replace function public.protect_fuelled_storage_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_active and not new.is_active and old.current_balance_litres > 0 then
    raise exception 'This tank still holds % litres. Issue or adjust the balance to zero before retiring it.',
      old.current_balance_litres using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger protect_fuelled_storage_location
before update on public.fuel_storage_locations
for each row execute function public.protect_fuelled_storage_location();

-- Expense categories carry no balance, so retiring one strands nothing. Historical expenses keep
-- pointing at it and continue to report correctly; it simply stops being offered on new entries.

-- These are triggers, not RPCs, so nothing new becomes callable from the client. The permission to
-- reach them at all is the existing `inventory.manage` / `fuel.manage` policy on each table.
revoke all on function public.protect_stocked_inventory_location() from public, anon, authenticated;
revoke all on function public.protect_stocked_inventory_item() from public, anon, authenticated;
revoke all on function public.protect_fuelled_storage_location() from public, anon, authenticated;
