# Deploying migrations

**Check what is applied before doing anything:**

```bash
npm run deploy:check
```

It asks the live project what exists, using only the publishable key from `.env.local` and reading
no tenant data — row-level security gives an anonymous caller nothing, which is exactly why an empty
answer still proves a table is there. It cannot see triggers, indexes, policies or storage objects,
so it reports those migrations as unknown rather than guessing; `supabase/verify-deployment.sql`
settles them in the SQL editor.

As of 9 August 2026: **`0001`–`0037` are applied.** The latest live QA also exercised authenticated PostgREST/RLS, concurrent writes and a private signed Storage download.

## The original position

Twelve migrations were written, tested and not applied. Until they are, the live site is missing
mine-site management, organization settings, custom roles, rate limiting, the stock overview, the
catalogue retirement guards, the module totals, the compliance recurrence fix, per-site access
restriction, the scheduled alerts and fuel reconciliation — **and it is still computing several headline figures the old,
incorrect way, and telling nobody when a licence is about to expire.**

This is the largest single risk in the project. Not because the migrations are dangerous, but
because twelve applied in one sitting is where mistakes happen.

## Before you start

Every one of these migrations can be applied twice. That is deliberate and it is tested
(`tests/integration/migration-safety.test.ts`): applied through the Supabase SQL editor there is no
enclosing transaction, so a failure part-way leaves the file half applied, and the natural next move
is to run it again. Guarded creates mean that works.

So the rule is simple: **if one fails, read the error, fix the cause, and run the whole file again.**
Do not hand-edit the database to patch around a failure.

Take a backup first anyway. Supabase keeps automatic daily backups on paid plans; on the free tier,
`pg_dump` before you begin.

## Order and what each one does

Apply in filename order. Several depend on earlier ones — `0029` needs the view from `0023`, and
`0023`'s policies rely on `0019` — so this is not optional.

| Migration | What it adds | Notable |
| --- | --- | --- |
| `0019` | Mine-site management, organization settings | Adds a paired-coordinate constraint; nulls out any half-set coordinates first |
| `0020` | Document storage bucket and policies | Surface stays hidden until `DOCUMENTS_ENABLED=true` |
| `0021` | Custom role permission editing | |
| `0022` | Rate limiting | New table, no policy — only `consume_rate_limit()` touches it |
| `0023` | Site-scoped stock overview view | **`security_invoker` is load-bearing**; see below |
| `0024` | Catalogue retirement guards | Refuses to retire a store or tank that still holds stock |
| `0025` | Module headline totals | Replaces figures the app was computing wrongly |
| `0026` | Compliance recurrence fix | A retired requirement now stops recurring |
| `0027` | Scheduled alerts | Schedules a daily job under `pg_cron` |
| `0028` | Per-site access restriction | Adds a restrictive policy to ~29 tables; inert until used |
| `0029` | Inventory indexes | |
| `0030` | Fuel reconciliation and consumption analysis | New table written only through `record_fuel_stock_take()` |
| `0031` | Inventory stock counts and shrinkage | Applying a count is one atomic operation; lines are frozen afterwards |
| `0032` | Dashboard period comparison | Read-only; adds indexes on the date columns each measure filters by |
| `0033` | Audit trail coverage | Triggers only; no table or column changes |
| `0034` | Operational intelligence | Read-only figures over existing tables |
| `0035` | Geology foundation | Samples, assays, drill collars and intervals, boundaries, files |
| `0036` | Forecasting and daily intelligence | Adds `site_forecast_assumptions` |
| `0037` | Site restriction and geology audit alignment | Renames one policy so the invariant test can see it; adds two triggers |
| `0038` | Organization export audit | One function. **Until it is applied the data export refuses**, rather than producing a copy of everything with no record that it was taken — which is the intended failure, not a bug |

## Locks

Every `create index` in these migrations takes a lock that blocks writes to that table for the
duration of the build. On the current database that is milliseconds, because the data is a demo
workspace.

**This changes once a pilot has real data.** For an organization with substantial production or
stock history, build those indexes with `create index concurrently` outside the migration instead —
it takes longer but does not block writes. `concurrently` cannot run inside a transaction block,
which is why it is not the default here.

The affected indexes are in `0023`, `0025` and `0029`.

`0028` adds a policy to about 29 tables. Each takes a brief exclusive lock, but it is a catalogue
change with no table rewrite, so it is effectively instant regardless of data size.

## After applying

Run `supabase/verify-deployment.sql` in the SQL editor. It reports, per migration, whether what that
migration creates is present, and separately checks three things that "present" does not cover:

- **`inventory_stock_overview` declares `security_invoker`.** Without it the view runs as its owner
  and reads past every row-level policy underneath — one mining company would see another's stock
  levels. If this reports WRONG, stop and re-apply `0023`.
- **Every table with a `mine_site_id` has a site-restriction policy.** `0028` generates these from
  the catalogue as it stood when it ran, so a table added later needs its own. Anything listed here
  is a gap in the site restriction.
- **The daily alert job is scheduled.** If `pg_cron` is unavailable on the project the migration says
  so in a notice and leaves the function in place; schedule `select public.generate_alerts();` daily
  by whatever means the deployment has.

Then work the [manual QA checklist](manual-qa-checklist.md). Its first items under each new section
are deliberately the "nothing should have changed" ones — particularly for `0028`, where every
existing member must still see every site until somebody is explicitly restricted.

## After the application deploy

Unrelated to the migrations, and worth one look on the day the new build goes out:

```bash
curl -sD - -o /dev/null https://<your-host>/login
```

Every response should carry `x-content-type-options`, `x-frame-options`, `referrer-policy`,
`permissions-policy`, `strict-transport-security` and `content-security-policy-report-only`. The
redirect a signed-out visitor gets should carry them too — check `https://<your-host>/production`
without a session, because that branch is the one that gets forgotten.

Then leave it a week and read the reports:

```bash
grep csp.violation
```

Each line is something the policy *would* have blocked. Nothing today is blocked; the policy is
report-only on purpose. Once the reports contain nothing you cannot explain, change the header name
in `securityHeaders` (`lib/security/headers.ts`) from `Content-Security-Policy-Report-Only` to
`Content-Security-Policy` and deploy that alone, so a problem has one obvious cause.

## Environment

Nothing here requires a new environment variable. Two optional ones:

- `DOCUMENTS_ENABLED=true` switches on the private document UI. Leave it off until an upload, a signed
  download, permission denial, and expired-link case have been confirmed against the real bucket — none of that path can be exercised by any test here.
- `LOG_LEVEL` trims log volume without a redeploy.

## What is still not covered by any test

Worth knowing before trusting the deployment:

- Supabase Auth, Storage and PostgREST behaviour. The migration harness stubs all three.
- Whether the Content-Security-Policy would actually hold. The nonce reaching every script tag was
  confirmed against a production build, and the headers are asserted by running the proxy — but no
  test can tell you what a real browser on a real page would have refused. That is what the
  report-only week is for.
- Real concurrency. The row locks are the right construction and the balance floors are proven, but
  genuine simultaneous writes need a multi-connection server.
- Wall-clock performance. Query *plans* are asserted and those transfer; timings do not.
