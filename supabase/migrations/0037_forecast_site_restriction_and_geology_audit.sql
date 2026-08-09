-- Keep the site-restriction invariant discoverable by the same policy name on every site table.
-- The 0036 policy was restrictive and correct, but its bespoke name escaped the invariant test.
drop policy if exists "forecast assumptions site restriction" on public.site_forecast_assumptions;
drop policy if exists "site restriction" on public.site_forecast_assumptions;
create policy "site restriction" on public.site_forecast_assumptions as restrictive for all
  using (public.may_reach_site(organization_id, mine_site_id))
  with check (public.may_reach_site(organization_id, mine_site_id));

drop trigger if exists audit_drill_interval on public.drill_intervals;
create trigger audit_drill_interval after insert or update on public.drill_intervals
  for each row execute function public.audit_row_change('geology.interval_saved','drill_interval');
drop trigger if exists audit_geological_boundary on public.geological_boundaries;
create trigger audit_geological_boundary after insert or update on public.geological_boundaries
  for each row execute function public.audit_row_change('geology.boundary_saved','geological_boundary');
