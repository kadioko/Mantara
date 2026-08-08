-- Alerts that arrive without anyone going to look for them.
--
-- Mantara already tracks licence expiry, overdue compliance tasks and overdue corrective actions,
-- and shows all three on their module screens. That is only useful to someone who opens the screen.
-- A mineral licence lapsing stops a mine working, and the person who needed to know was not looking
-- at the compliance page that week.
--
-- Two decisions carry this design.
--
-- **It runs inside the database, not in the application.** The alternative was an HTTP endpoint the
-- scheduler calls, which needs a service-role key in the application — a credential that bypasses
-- RLS entirely, in a product whose whole promise is that one organization cannot see another's data.
-- Running under pg_cron means no key exists to leak and no endpoint exists to attack.
--
-- **Each alert is sent once, ever.** A job that re-sends "licence expires in 21 days" every morning
-- teaches people to ignore notifications, which leaves them worse off than no alerting at all. Every
-- generated notification carries a subject_key naming exactly what it is about, unique per user, and
-- insertion is `on conflict do nothing`. Running the job twice in a minute, or ten times after an
-- outage, produces nothing the second time.

alter table public.notifications add column if not exists subject_key text;

-- The uniqueness that makes the job idempotent. Partial, so the existing trigger-generated
-- notifications — which have no subject_key and are genuinely one-per-event — are unaffected.
create unique index if not exists notifications_subject_unique
  on public.notifications (user_id, subject_key)
  where subject_key is not null;

/**
 * Generates outstanding alerts for every organization.
 *
 * Returns the number of notifications actually created, which is the number a scheduler should log:
 * on a quiet day it is zero, and a sudden spike is worth a look.
 *
 * Takes no arguments and trusts no caller: it is revoked from every API role and is reachable only
 * by the scheduler running as the database owner.
 */
create or replace function public.generate_alerts()
returns integer language plpgsql security definer set search_path = public as $$
declare created integer := 0; inserted integer;
begin
  -- Licences approaching expiry. The thresholds escalate rather than repeat: a reader hears about a
  -- licence at 60 days, again at 30, 14, 7 and 1, and never twice at the same distance. Passing a
  -- threshold is what makes it newsworthy again.
  insert into public.notifications (organization_id, user_id, type, title, body, subject_key)
  select
    licence.organization_id,
    recipient,
    'compliance.licence_expiring',
    'Licence expiring',
    licence.licence_number || ' (' || licence.licence_type || ') expires on ' || licence.expires_on,
    'licence.expiring:' || licence.id || ':' || threshold.days
  from public.mineral_licences licence
  join public.organizations org
    on org.id = licence.organization_id and org.suspended_at is null
  cross join (values (60), (30), (14), (7), (1)) as threshold(days)
  cross join lateral public.users_with_permission(licence.organization_id, 'compliance.read') as recipient
  where licence.deleted_at is null
    and licence.status in ('active', 'pending')
    and licence.expires_on is not null
    and licence.expires_on >= current_date
    and licence.expires_on <= current_date + threshold.days
  on conflict (user_id, subject_key) where subject_key is not null do nothing;
  get diagnostics inserted = row_count; created := created + inserted;

  -- A compliance task past its due date. Told once, when it goes overdue; the compliance screen is
  -- where someone goes to see it is still overdue a week later.
  insert into public.notifications (organization_id, user_id, type, title, body, subject_key)
  select
    task.organization_id,
    recipient,
    'compliance.task_overdue',
    'Compliance task overdue',
    task.title || ' was due on ' || task.due_on,
    'compliance.overdue:' || task.id
  from public.compliance_tasks task
  join public.organizations org
    on org.id = task.organization_id and org.suspended_at is null
  cross join lateral public.users_with_permission(task.organization_id, 'compliance.read') as recipient
  where task.status in ('open', 'in_progress')
    and task.due_on < current_date
  on conflict (user_id, subject_key) where subject_key is not null do nothing;
  get diagnostics inserted = row_count; created := created + inserted;

  -- An overdue corrective action is an accepted safety risk that nobody has closed. It goes to
  -- people holding safety.read, not compliance.read: the two are different jobs and often different
  -- people, and sending each of them the other's work is how both start ignoring the list.
  insert into public.notifications (organization_id, user_id, type, title, body, subject_key)
  select
    action.organization_id,
    recipient,
    'safety.action_overdue',
    'Corrective action overdue',
    action.description || ' was due on ' || action.due_on,
    'safety.overdue:' || action.id
  from public.corrective_actions action
  join public.organizations org
    on org.id = action.organization_id and org.suspended_at is null
  cross join lateral public.users_with_permission(action.organization_id, 'safety.read') as recipient
  where action.status <> 'completed'
    and action.due_on is not null
    and action.due_on < current_date
  on conflict (user_id, subject_key) where subject_key is not null do nothing;
  get diagnostics inserted = row_count; created := created + inserted;

  return created;
end; $$;

comment on function public.generate_alerts() is
  'Creates outstanding licence, compliance and safety alerts. Idempotent: safe to run repeatedly.';

-- Nothing reachable from the API may call this. It writes notifications for users other than the
-- caller across every organization, which is precisely what no client should be able to do.
revoke all on function public.generate_alerts() from public, anon, authenticated;

-- Schedule it, where the scheduler exists. pg_cron is a Supabase extension and is absent from the
-- migration test harness, so this block is skipped there rather than failing the whole migration —
-- the same pattern 0020 uses for Storage.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Once daily, early, so an alert is waiting at the start of the working day rather than
    -- arriving in the middle of it.
    perform cron.schedule('mantara-daily-alerts', '0 4 * * *', 'select public.generate_alerts();');
  else
    raise notice 'pg_cron is unavailable; generate_alerts() must be scheduled by other means.';
  end if;
exception when insufficient_privilege or undefined_function or undefined_table then
  -- A project without permission to schedule should still get the function. Scheduling is then a
  -- one-line manual step, documented in the README.
  raise notice 'Could not schedule generate_alerts(); schedule it manually.';
end $$;
