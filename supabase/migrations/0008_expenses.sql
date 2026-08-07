-- Expenses module: categories, expenses with an approval lifecycle, and period budgets.
create type public.expense_status as enum ('draft', 'submitted', 'approved', 'rejected', 'paid');
create type public.budget_period as enum ('monthly', 'quarterly', 'annual');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid not null references public.mine_sites(id),
  category_id uuid references public.expense_categories(id),
  supplier_id uuid references public.suppliers(id),
  work_order_id uuid references public.maintenance_work_orders(id),
  description text not null check (char_length(trim(description)) between 2 and 200),
  amount numeric(16,2) not null check (amount > 0),
  currency_code char(3) not null default 'TZS',
  incurred_on date not null default current_date,
  reference text,
  status public.expense_status not null default 'draft',
  notes text,
  submitted_at timestamptz,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (organization_id, id),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, category_id) references public.expense_categories(organization_id, id),
  foreign key (organization_id, supplier_id) references public.suppliers(organization_id, id),
  foreign key (organization_id, work_order_id) references public.maintenance_work_orders(organization_id, id)
);

create table public.expense_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  decision public.approval_decision not null,
  notes text,
  decided_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  foreign key (organization_id, expense_id) references public.expenses(organization_id, id)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  mine_site_id uuid references public.mine_sites(id),
  category_id uuid references public.expense_categories(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  period public.budget_period not null default 'monthly',
  starts_on date not null,
  ends_on date not null,
  amount numeric(16,2) not null check (amount > 0),
  currency_code char(3) not null default 'TZS',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (ends_on >= starts_on),
  foreign key (organization_id, mine_site_id) references public.mine_sites(organization_id, id),
  foreign key (organization_id, category_id) references public.expense_categories(organization_id, id)
);

create index expenses_site_date_idx on public.expenses(organization_id, mine_site_id, incurred_on desc);
create index expenses_pending_idx on public.expenses(organization_id, status) where status = 'submitted';
create index expenses_category_idx on public.expenses(category_id, incurred_on desc);
create index expense_approvals_expense_idx on public.expense_approvals(expense_id, decided_at desc);
create index budgets_period_idx on public.budgets(organization_id, starts_on, ends_on);

create trigger expense_categories_updated_at before update on public.expense_categories for each row execute function public.set_updated_at();
create trigger expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger budgets_updated_at before update on public.budgets for each row execute function public.set_updated_at();

-- Same lifecycle discipline as production: the database owns the state machine so no write path can
-- skip approval, and an approved expense is a financial record whose figures are frozen.
create or replace function public.validate_expense_transition() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status in ('approved', 'rejected'))
    or (old.status = 'rejected' and new.status = 'draft')
    or (old.status = 'approved' and new.status = 'paid')
  ) then
    raise exception 'Cannot move an expense from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'submitted' then new.submitted_at = now(); end if;
  if new.status = 'paid' and new.paid_on is null then new.paid_on = current_date; end if;
  return new;
end; $$;

create trigger expenses_transition before update of status on public.expenses for each row execute function public.validate_expense_transition();

create or replace function public.block_approved_expense_edit() returns trigger language plpgsql as $$
begin
  if old.status in ('approved', 'paid') and new.status in ('approved', 'paid')
     and (new.amount is distinct from old.amount
       or new.category_id is distinct from old.category_id
       or new.incurred_on is distinct from old.incurred_on
       or new.currency_code is distinct from old.currency_code) then
    raise exception 'An approved expense cannot be edited' using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger expenses_freeze before update on public.expenses for each row execute function public.block_approved_expense_edit();

create or replace function public.review_expense(
  requested_expense_id uuid,
  decision public.approval_decision,
  review_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare target record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select id, organization_id, status into target
  from public.expenses where id = requested_expense_id for update;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if not public.has_permission(target.organization_id, 'expense.approve') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.status <> 'submitted' then
    raise exception 'Only a submitted expense can be reviewed; this one is %', target.status using errcode = 'P0001';
  end if;
  insert into public.expense_approvals (organization_id, expense_id, decision, notes, decided_by)
  values (target.organization_id, requested_expense_id, decision, review_notes, auth.uid());
  update public.expenses
  set status = decision::text::public.expense_status, updated_by = auth.uid()
  where id = requested_expense_id;
end; $$;

-- Budget consumption counts approved and paid expenses only, so a draft cannot make a budget look spent.
create or replace function public.budget_consumption(requested_budget_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.amount), 0)
  from public.budgets b
  join public.expenses e
    on e.organization_id = b.organization_id
   and e.incurred_on between b.starts_on and b.ends_on
   and (b.category_id is null or e.category_id = b.category_id)
   and (b.mine_site_id is null or e.mine_site_id = b.mine_site_id)
  where b.id = requested_budget_id
    and e.status in ('approved', 'paid')
    and public.has_permission(b.organization_id, 'expense.read');
$$;

insert into public.permissions (code, name, description) values
  ('expense.read', 'View expenses', 'View expenses, categories, and budgets'),
  ('expense.create', 'Record expenses', 'Record expenses and submit them for approval'),
  ('expense.update', 'Manage expenses', 'Edit expenses, categories, and budgets'),
  ('expense.approve', 'Approve expenses', 'Approve or reject submitted expenses')
on conflict (code) do nothing;

insert into public.role_permission_defaults (role_code, permission_code) values
  ('mine_manager', 'expense.read'),
  ('mine_manager', 'expense.create'),
  ('mine_manager', 'expense.update'),
  ('accountant', 'expense.read'),
  ('accountant', 'expense.create'),
  ('accountant', 'expense.update'),
  ('accountant', 'expense.approve'),
  ('site_supervisor', 'expense.read'),
  ('site_supervisor', 'expense.create'),
  ('storekeeper', 'expense.read')
on conflict do nothing;

select public.sync_role_permission_defaults();

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_approvals enable row level security;
alter table public.budgets enable row level security;

create policy "expense categories read permitted" on public.expense_categories for select using (public.has_permission(organization_id, 'expense.read'));
create policy "expense categories write permitted" on public.expense_categories for all using (public.has_permission(organization_id, 'expense.update')) with check (public.has_permission(organization_id, 'expense.update'));
create policy "expenses read permitted" on public.expenses for select using (public.has_permission(organization_id, 'expense.read'));
create policy "expenses create permitted" on public.expenses for insert with check (created_by = auth.uid() and public.has_permission(organization_id, 'expense.create'));
create policy "expenses update permitted" on public.expenses for update using (public.has_permission(organization_id, 'expense.create')) with check (updated_by = auth.uid() and public.has_permission(organization_id, 'expense.create'));
create policy "budgets read permitted" on public.budgets for select using (public.has_permission(organization_id, 'expense.read'));
create policy "budgets write permitted" on public.budgets for all using (public.has_permission(organization_id, 'expense.update')) with check (public.has_permission(organization_id, 'expense.update'));

-- Approvals are read-only to clients; review_expense() is the only way to record a decision.
create policy "expense approvals read permitted" on public.expense_approvals for select using (public.has_permission(organization_id, 'expense.read'));

revoke all on function public.review_expense(uuid, public.approval_decision, text) from public;
grant execute on function public.review_expense(uuid, public.approval_decision, text) to authenticated;
revoke all on function public.budget_consumption(uuid) from public;
grant execute on function public.budget_consumption(uuid) to authenticated;
