# Mantara

Mantara OS is a secure, multi-tenant mining operations platform for artisanal, small-scale, and
medium-sized mining companies, built first for Tanzania.

The interface is bilingual in English and Kiswahili. Further African languages can be added through
the central catalogue in `lib/i18n/messages.ts` — English is the source of truth and anything a
locale has not translated falls back to it, so a new screen ships the day its English copy is
written rather than waiting on a translator.

## Project status

Every planned module is built: Workforce, Equipment, Production and ore handling, Fuel, Maintenance,
Inventory, Expenses, Compliance, Safety, Reports with CSV export, Notifications, the audit-log UI,
mine sites, organization settings, custom roles, members and invitations, and platform
administration.

**Every migration is applied.** `npm run deploy:check` confirms all 24 that PostgREST can see, using
only the publishable key and reading no tenant data. Five — `0019`, `0020`, `0024`, `0026`, `0029` —
create only triggers, indexes, policies or storage objects, which PostgREST cannot describe; run
`supabase/verify-deployment.sql` in the SQL editor to settle those.

Document storage (`0020`) stays hidden behind `DOCUMENTS_ENABLED` whether or not its migration ran,
and its bucket did not answer an anonymous probe — worth confirming before switching it on.

**[docs/deployment.md](docs/deployment.md) is the runbook for applying them**, including which take
locks that matter once there is real data, and `supabase/verify-deployment.sql` reports afterwards
what is actually present.

See the [project status](docs/project-status.md) for what is verified and what is not, and the
[roadmap](docs/roadmap.md) for the product phases and the business plan alongside them.

## Local setup

1. Copy `.env.example` to `.env.local` and set the values from your Supabase project.
2. Apply every migration in `supabase/migrations/` in filename order, `0001_foundation.sql` through
   `0030_fuel_reconciliation.sql`, using the Supabase CLI or the SQL editor. Migrations from
   `0019` onwards can safely be run twice, so a half-finished apply is fixed by running the file
   again rather than by hand.
3. Run `npm run dev`.

The first authenticated user creates their organization and initial mine site from `/onboarding`.

See [the architecture blueprint](blueprint/architecture.md) for how the pieces fit together, and the
[manual QA checklist](docs/manual-qa-checklist.md) for what only a person can verify.

## How the tenant boundary works

Row-level security is the boundary, not a convenience. Every table carries `organization_id`, every
policy resolves permission through `has_permission()`, and the application's own checks exist only to
produce a readable message — remove them all and no tenant could still reach another's data.

Three consequences worth knowing before changing anything:

- **`SECURITY DEFINER` functions bypass RLS by design**, so each one re-checks permission itself and
  is revoked from `anon` explicitly. Revoking from `PUBLIC` alone is not enough: Supabase grants
  `EXECUTE` to `anon` and `authenticated` by name.
- **Views run as their owner unless told otherwise.** `inventory_stock_overview` is declared
  `with (security_invoker = true)`. Deleting those five words would hand one mining company its
  competitor's stock levels. `tests/integration/stock-overview.test.ts` fails five ways if anyone does.
- **Restrictive policies narrow; permissive policies widen.** Site restriction (`0028`) is added as
  one restrictive policy per site-scoped table, AND-ed with the hundred-odd permissive policies
  already there. Rewriting each of those to also check a site would have been a large edit to the
  only thing separating two mining companies' data, and one missed table would be a silent hole.
  A restrictive policy cannot grant anything, so the change can only ever subtract.
- **A permission code that does not exist denies everyone silently.** `has_permission()` returns
  false for a code nobody holds, so a typo reads like a deliberate decision and nothing throws.
  `tests/unit/permission-codes.test.ts` checks every code the app asks for against the migrations.

## Platform administration

`/admin` is the support area for the team running Mantara itself. It shows organization metadata and
grants **no access to any tenant's operational records** — see
[the roadmap](docs/roadmap.md#platform-administration-what-the-role-can-and-cannot-do) for where that
boundary sits and why.

There is no self-service route into the role. Create the first administrator once, in the Supabase
SQL editor:

```sql
insert into public.platform_admins (user_id, note)
select id, 'Founding administrator' from auth.users where email = 'you@example.com';
```

An earlier `platform_administrators` table shipped in migration `0003`. Migration `0013` carries its
rows into `platform_admins` and removes it, so existing administrators keep access and there is one
source of truth.

## User interface

Shared components live in `components/ui/` and follow shadcn/ui conventions on Tailwind v4: a `cn`
helper in `lib/utils.ts`, `class-variance-authority` for variants, and design tokens in
`app/globals.css`. Components from registries such as [21st.dev](https://21st.dev) ship as
shadcn-format source, so they compose with these tokens and can be added directly.

Screens are built from these primitives rather than hand-written Tailwind: `Panel` for a titled
section, `Table` for lists, `Field`/`Input`/`Select` for forms, `CatalogueList`/`CatalogueRow` for
editable reference data, `Pagination` and `SearchField` for list controls, and
`Alert`/`EmptyState`/`StatCard`/`PageHeader` for page furniture.

**Colours come from the tokens, not the stock palette** — `bg-card`, `text-muted-foreground`,
`border-border` — so the brand changes in one file and dark mode works everywhere. The one deliberate
exception is the workspace sidebar, which carries the Mantara brand colour directly.

Forms use enclosing `<label>` elements rather than `id`/`htmlFor`. Lists render one editor per row,
and repeated ids would point every label at the first row's control.

## Translation

`t(locale, key)` on the server; `useT()` from `lib/i18n/client.tsx` in client components. The client
hook exists because `getLocale()` reads a cookie, which only a server component can do — without it
every data-entry form in the product was stuck in English while the pages around them were bilingual,
which is precisely backwards for an operator at a mine site.

`npm run i18n:report` shows two numbers. Catalogue coverage is the easy one. The number that matters
is text written directly into components, which no translator can reach at all.

## Tests

```bash
npm run test
```

Unit tests cover schemas, validation, paging, CSV generation, logging and the message catalogue. The
integration tests in `tests/integration/` apply the **real migration files** to a PostgreSQL database
compiled to WebAssembly, then assert the rules the application relies on the database to enforce:
balance floors, approval lifecycles, deadlock-safe transfers, and tenant isolation under RLS. They
need no Docker and no Supabase project, so they run anywhere `npm test` does.

The harness models Supabase's default privileges deliberately. A helper revoked only from `PUBLIC`
would still be callable by `authenticated`, and without that modelling the tests would not notice.

## Audits

```bash
npm run audit:all
```

Each of these exists because something got past a review once:

- `npm run a11y` — labelling, heading order, icon-only controls, keyboard reachability. Mechanical
  failures only. Whether a label is *meaningful* still needs a person.
- `npm run contrast` — every design token pair against WCAG AA, in both themes. Tokens are oklch, so
  it converts oklch to sRGB properly; reading the lightness number and guessing is what let a 1.58:1
  sidebar ship. `--border` is recorded as decorative and exempt, with the reasoning in the script.
- `npm run i18n:report` — catalogue gaps and unreachable UI text.

Two of the test files are checks of the same kind, run by `npm run test`:
`tests/unit/permission-codes.test.ts` verifies every permission code the app asks for exists in the
migrations, and `tests/unit/schema-contract.test.ts` does the same for every table, view, column and
RPC argument. **The Supabase client here is untyped**, so none of that is checked at compile time —
a renamed table or a misspelled RPC argument typechecks, lints, builds, and fails in front of an
operator.

`tests/integration/query-plans.test.ts` seeds a realistic volume and asserts on **query plans** for
the reads the screens actually perform. Wall-clock timings in WebAssembly are noise; a sequential
scan is a sequential scan on any hardware. `npm run plan:probe` reproduces the same measurement at
larger volumes when you need to see how something scales rather than whether it regressed.

## Operating the deployment

- `/api/health` returns `200` when the instance can reach the database and `503` when it cannot. It
  is anonymous and deliberately says nothing else, so it cannot be used to learn the schema or which
  tenants exist. Point an uptime monitor at it.
- Logs are one JSON line per event on stdout (`lib/observability/log.ts`). Any drain will collect
  them. Personal and operational fields are redacted by name, because logs are readable by more
  people than the database is.
- `LOG_LEVEL` (`debug`/`info`/`warn`/`error`, default `info`) trims volume without a redeploy.
- `DOCUMENTS_ENABLED=true` switches on document storage. It stays off until an upload and a download
  have been confirmed against a real bucket.
- `prune_rate_limit_events()` is safe to run from a scheduled job; without it `rate_limit_events`
  grows without bound.

### Alerts

`generate_alerts()` creates the notifications nobody would otherwise see in time — a licence
approaching expiry, an overdue compliance task, an overdue corrective action. `0027` schedules it
daily under `pg_cron`. Confirm it is scheduled:

```sql
select jobname, schedule, active from cron.job where jobname = 'mantara-daily-alerts';
```

If the project cannot use `pg_cron`, the migration says so in a notice and the function still exists;
schedule `select public.generate_alerts();` daily by whatever means the deployment has.

It runs **inside the database on purpose**. The alternative — an HTTP endpoint a scheduler calls —
needs a service-role key in the application, which bypasses RLS entirely. In a product whose whole
promise is that one organization cannot see another's data, that credential is not worth creating for
a cron job.

Running it twice creates nothing the second time. Every alert carries a `subject_key` naming exactly
what it is about, unique per user, so re-running after an outage is safe. That matters more than it
sounds: a job that re-sends "licence expires in 21 days" every morning teaches people to ignore
notifications, which leaves them worse off than no alerting at all.
