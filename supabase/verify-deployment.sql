-- What is actually applied?
--
-- Run this in the Supabase SQL editor before and after a deployment. It reports, per migration,
-- whether the things that migration creates are present. Reading the migrations directory tells you
-- what *should* be there; this tells you what is.
--
-- It changes nothing and reads no tenant data.

with expected(migration, kind, name) as (values
  ('0019 sites and organization settings', 'policy',   'organizations update permitted'),
  ('0019 sites and organization settings', 'trigger',  'mine_sites_protect_last_active'),
  ('0019 sites and organization settings', 'constraint','mine_sites_coordinates_paired'),
  ('0020 document storage',                'bucket',   'documents'),
  ('0021 role permissions management',     'function', 'set_role_permissions'),
  ('0021 role permissions management',     'function', 'organization_roles'),
  ('0022 rate limiting',                   'table',    'rate_limit_events'),
  ('0022 rate limiting',                   'function', 'consume_rate_limit'),
  ('0023 stock overview',                  'view',     'inventory_stock_overview'),
  ('0024 catalogue integrity',             'trigger',  'protect_stocked_inventory_location'),
  ('0024 catalogue integrity',             'trigger',  'protect_stocked_inventory_item'),
  ('0024 catalogue integrity',             'trigger',  'protect_fuelled_storage_location'),
  ('0025 module totals',                   'function', 'production_totals'),
  ('0025 module totals',                   'function', 'maintenance_totals'),
  ('0025 module totals',                   'function', 'expense_totals'),
  ('0025 module totals',                   'function', 'fuel_totals'),
  ('0026 compliance recurrence',           'function', 'complete_compliance_task'),
  ('0027 scheduled alerts',                'function', 'generate_alerts'),
  ('0027 scheduled alerts',                'column',   'notifications.subject_key'),
  ('0028 site restriction',                'table',    'membership_sites'),
  ('0028 site restriction',                'function', 'set_member_sites'),
  ('0029 stock overview ordering',         'index',    'inventory_items_org_name_idx')
)
select
  expected.migration,
  expected.kind,
  expected.name,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = expected.name and expected.kind = 'function'
    union all
    select 1 from pg_tables where schemaname = 'public' and tablename = expected.name and expected.kind = 'table'
    union all
    select 1 from pg_views where schemaname = 'public' and viewname = expected.name and expected.kind = 'view'
    union all
    select 1 from pg_policies where schemaname = 'public' and policyname = expected.name and expected.kind = 'policy'
    union all
    select 1 from pg_trigger where tgname = expected.name and not tgisinternal and expected.kind = 'trigger'
    union all
    select 1 from pg_constraint where conname = expected.name and expected.kind = 'constraint'
    union all
    select 1 from pg_indexes where schemaname = 'public' and indexname = expected.name and expected.kind = 'index'
    union all
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = split_part(expected.name, '.', 1)
      and column_name = split_part(expected.name, '.', 2)
      and expected.kind = 'column'
    union all
    select 1 from storage.buckets where id = expected.name and expected.kind = 'bucket'
  ) then 'applied' else 'MISSING' end as state
from expected
order by expected.migration, expected.kind, expected.name;

-- Two things worth checking separately, because "present" is not the same as "correct".

-- The stock overview must run as the caller. Without security_invoker it runs as its owner and reads
-- past every row-level policy underneath, which would hand one mining company another's stock.
select
  'inventory_stock_overview security_invoker' as check,
  case when 'security_invoker=true' = any (coalesce(reloptions, array[]::text[]))
       then 'correct' else 'WRONG — this view would bypass RLS' end as state
from pg_class where relname = 'inventory_stock_overview';

-- Site restriction should cover every table that carries a mine site.
select
  'tables missing a site-restriction policy' as check,
  coalesce(string_agg(c.table_name, ', '), 'none') as state
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
where c.table_schema = 'public'
  and c.column_name = 'mine_site_id'
  and c.table_name <> 'membership_sites'
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.table_name and p.policyname = 'site restriction');

-- And the alert job should be scheduled, where pg_cron is available.
select 'daily alert job' as check,
       coalesce((select schedule from cron.job where jobname = 'mantara-daily-alerts'),
                'NOT SCHEDULED — run generate_alerts() by other means') as state;
