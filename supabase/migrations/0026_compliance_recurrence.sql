-- A retired compliance requirement must stop recurring.
--
-- complete_compliance_task() read the requirement's recurrence without looking at whether the
-- requirement was still in service, so retiring one did not stop it. Completing the current task
-- scheduled the next, and completing that one scheduled another, indefinitely — an obligation the
-- organization had formally dropped kept reappearing on someone's list every month with no way to
-- make it stop short of cancelling each occurrence by hand.
--
-- Nothing surfaced this before now because there was no screen for retiring a requirement at all.
-- Adding one turns a latent defect into a daily one, so it is fixed here in the same change.

create or replace function public.complete_compliance_task(
  requested_task_id uuid,
  notes text default null,
  completed_date date default current_date
) returns uuid language plpgsql security definer set search_path = public as $$
declare target record; step interval; next_id uuid; task_recurrence public.recurrence_interval;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  -- The task row is locked on its own: PostgreSQL refuses FOR UPDATE against the nullable side of an
  -- outer join, so the requirement's recurrence is fetched separately below.
  select t.id, t.organization_id, t.mine_site_id, t.requirement_id, t.licence_id, t.title, t.details,
         t.due_on, t.status, t.assigned_worker_id
  into target
  from public.compliance_tasks t
  where t.id = requested_task_id for update;
  if not found then raise exception 'Compliance task not found' using errcode = 'P0002'; end if;

  -- `and r.is_active` is the fix. A retired requirement leaves task_recurrence null, so the block
  -- below schedules nothing and the obligation ends where the organization decided it should.
  select r.recurrence into task_recurrence
  from public.compliance_requirements r
  where r.id = target.requirement_id and r.is_active;

  if not public.has_permission(target.organization_id, 'compliance.update') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.status in ('completed', 'cancelled') then
    raise exception 'That task is already %', target.status using errcode = 'P0001';
  end if;

  update public.compliance_tasks
  set status = 'completed', completed_on = completed_date, completion_notes = notes, updated_by = auth.uid()
  where id = requested_task_id;

  step := case task_recurrence
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'annual' then interval '1 year'
    else null
  end;

  if step is not null then
    insert into public.compliance_tasks (organization_id, mine_site_id, requirement_id, licence_id, title, details, due_on, assigned_worker_id, created_by, updated_by)
    values (target.organization_id, target.mine_site_id, target.requirement_id, target.licence_id, target.title,
            target.details, (target.due_on + step)::date, target.assigned_worker_id, auth.uid(), auth.uid())
    returning id into next_id;
  end if;

  return next_id;
end; $$;

revoke all on function public.complete_compliance_task(uuid, text, date) from public, anon;
grant execute on function public.complete_compliance_task(uuid, text, date) to authenticated;
