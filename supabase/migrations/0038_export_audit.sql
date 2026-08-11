-- Recording that somebody took a copy of the organization's data.
--
-- The export is the answer to "can we get our data out?", which a mining company asks before it
-- trusts this product with a year of production. It is also, by construction, the single most
-- valuable action in the product to abuse: one request returns sixty tables at once, where every
-- other read hands back a page of twenty-five.
--
-- So it is audited, for the same reason reading an injured worker's medical detail is audited. Not
-- to stop it — an owner exporting their own records is the feature working — but so that an owner
-- who wants to know whether a departing manager took a copy has somewhere to look. Without this the
-- action leaves no trace anywhere: the rows are only read, so no trigger fires and nothing changes.
--
-- Written by the application rather than by a trigger, which is the opposite of the rule `0033`
-- established. That rule exists because a *write* can arrive by many paths and a trigger catches
-- them all. A read has no trigger to hang on at all, so the call site is the only place it can be
-- recorded — and the function below is the only way to record it, so there is still exactly one.

/**
 * Records one organization data export.
 *
 * Takes the counts rather than the data: the log says how much left and how complete it was, never
 * what was in it. A log line is readable by more people than the database is, and an audit entry
 * that reproduced the export would be a second copy of the thing being guarded.
 *
 * SECURITY DEFINER because audit_logs is deliberately unwritable from any client — see `0033`. The
 * membership check below is therefore the real gate, not decoration: without it this function would
 * let any authenticated user write a line into any organization's log.
 */
create or replace function public.record_organization_export(
  requested_organization_id uuid,
  table_count integer,
  row_count integer,
  was_complete boolean
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = requested_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception 'Not a member of that organization' using errcode = '42501';
  end if;

  -- The permission the export itself requires. Checked again here because this function can be
  -- called directly over the API by anyone with a session, not only by our own route.
  if not public.has_permission(requested_organization_id, 'organization.read') then
    raise exception 'Not permitted to export this organization' using errcode = '42501';
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  values (
    requested_organization_id,
    auth.uid(),
    'organization.exported',
    'organization',
    requested_organization_id,
    jsonb_build_object(
      'table_count', table_count,
      'row_count', row_count,
      'complete', was_complete
    )
  );
end; $$;

-- Revoked from anon by name. Supabase grants EXECUTE to anon and authenticated individually, so
-- revoking from PUBLIC alone leaves both grants in place.
revoke all on function public.record_organization_export(uuid, integer, integer, boolean) from public;
revoke all on function public.record_organization_export(uuid, integer, integer, boolean) from anon;
grant execute on function public.record_organization_export(uuid, integer, integer, boolean) to authenticated;
