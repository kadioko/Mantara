-- Rate limiting for sensitive authenticated actions.
--
-- The subject is always auth.uid(), never an argument. If a caller could name the subject they could
-- burn through someone else's allowance and lock them out, which turns a protection into a weapon.
--
-- Sign-in and registration are deliberately absent: they happen before there is a session to key on,
-- and Supabase Auth applies its own limits there. This covers what happens after sign-in — inviting
-- people, changing roles, opening medical details, and exporting data.

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null check (char_length(bucket) between 1 and 60),
  subject uuid not null,
  occurred_at timestamptz not null default now()
);

create index if not exists rate_limit_lookup_idx on public.rate_limit_events(bucket, subject, occurred_at desc);

alter table public.rate_limit_events enable row level security;
-- No policy at all: only consume_rate_limit() touches this, and nothing should read another
-- person's activity trail from the client.

/**
 * Records an attempt and reports whether it is within the allowance.
 *
 * Returns true when the action may proceed. The row is written before the decision so a caller that
 * ignores a false answer and retries still counts against the window rather than resetting it.
 */
create or replace function public.consume_rate_limit(
  requested_bucket text,
  max_events integer,
  window_seconds integer
) returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid; used integer;
begin
  caller := auth.uid();
  if caller is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if max_events < 1 or window_seconds < 1 then
    raise exception 'A limit needs a positive allowance and window' using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (bucket, subject) values (requested_bucket, caller);

  select count(*) into used
  from public.rate_limit_events e
  where e.bucket = requested_bucket
    and e.subject = caller
    and e.occurred_at > now() - make_interval(secs => window_seconds);

  return used <= max_events;
end; $$;

/** Housekeeping so the table does not grow without bound. Safe to call from a scheduled job. */
create or replace function public.prune_rate_limit_events(older_than_seconds integer default 86400)
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from public.rate_limit_events where occurred_at < now() - make_interval(secs => older_than_seconds);
  get diagnostics removed = row_count;
  return removed;
end; $$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;
revoke all on function public.prune_rate_limit_events(integer) from public, anon, authenticated;

-- Re-runnable on purpose. Applied through the Supabase SQL editor a migration is not wrapped in a
-- transaction, so a failure part-way leaves it half applied and the natural next move is to run it
-- again. Guarding every create means that works instead of needing a hand repair on a live database.
