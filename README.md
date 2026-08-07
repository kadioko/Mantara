# Mantara

Mantara OS is a secure, multi-tenant mining operations platform for artisanal, small-scale, and medium-sized mining companies.

The interface supports English and Kiswahili. Further African languages can be added through the central translation catalog in `lib/i18n/`.

## Project status

The multi-tenant foundation, Mantara brand, English/Kiswahili UI, and the Workforce, Equipment, Production, Fuel,
Maintenance, Inventory, Expenses, Compliance, and Safety modules are implemented, along with platform administration.
Reports, notifications, and the audit-log UI remain.

Migrations `0001`–`0003` are deployed to the Supabase project and the Vercel build is live. **Migrations `0004`
onwards have not been deployed yet**, so the newer modules cannot be exercised against the live project until they
are applied.

See the [project-status audit](docs/project-status.md) for the delivered scope and gaps, and the
[roadmap and journey](docs/roadmap.md) for progress, product phases, and the parallel business plan.

## Local setup

1. Copy `.env.example` to `.env.local` and set the values from your Supabase project.
2. Apply every migration in `supabase/migrations/` in filename order (`0001_foundation.sql` through `0014_members_and_notifications.sql`) using the Supabase CLI or SQL editor.
3. Run `npm run dev`.

The first authenticated user creates their organization and initial mine site from `/onboarding`.

See [the architecture blueprint](blueprint/architecture.md) for the MVP plan and implementation sequence, and the [manual QA checklist](docs/manual-qa-checklist.md) for foundation verification.

## Platform administration

`/admin` is the support and operations area for the team running Mantara itself. It shows organization
metadata and grants **no access to any tenant's operational records** — see
[the roadmap](docs/roadmap.md#platform-administration-what-the-role-can-and-cannot-do) for where that
boundary sits and why.

There is no self-service route into the role. Create the first administrator once, in the Supabase SQL
editor:

```sql
insert into public.platform_admins (user_id, note)
select id, 'Founding administrator' from auth.users where email = 'you@example.com';
```

An earlier `platform_administrators` table shipped in migration `0003`. Migration `0012` carries its rows into
`platform_admins` and removes it, so existing administrators keep their access and there is one source of truth.

## User interface

Shared components live in `components/ui/` and follow shadcn/ui conventions on Tailwind v4: a `cn`
helper in `lib/utils.ts`, `class-variance-authority` for variants, and design tokens declared in
`app/globals.css`. Components from registries such as [21st.dev](https://21st.dev) ship as
shadcn-format source, so they compose with these tokens and can be added directly.

Screens are built from these primitives rather than hand-written Tailwind: `Panel` for a titled
section, `Table` for lists, `Field`/`Input`/`Select` for forms, `Pagination` and `SearchField` for list
controls, and `Alert`/`EmptyState`/`StatCard`/`PageHeader` for page furniture. **Colours come from the
tokens, not the stock palette** — `bg-card`, `text-muted-foreground`, `border-border` and so on — so the
brand can change in one file and dark mode works everywhere. The only deliberate exception is the
workspace sidebar, which carries the Mantara brand colour directly.

## Tests

```bash
npm run test
```

Unit tests cover form and schema validation. The integration tests in `tests/integration/` apply the real migration
files to a PostgreSQL database compiled to WebAssembly, then assert the rules the application relies on the database
to enforce — balance floors, approval lifecycles, and tenant isolation under RLS. They need no Docker and no Supabase
project, so they run anywhere `npm test` does.

## Audits

```bash
npm run audit:all
```

Three static checks, each of which exists because something got past a review once:

- `npm run a11y` — labelling, heading order, icon-only controls, keyboard reachability. It catches
  the mechanical failures only. Whether a label is meaningful and whether a focus order makes sense
  still need a person.
- `npm run contrast` — every design token pair against WCAG AA, in both themes. Tokens are written
  in oklch, so it converts oklch to sRGB properly; reading the lightness number and guessing is what
  let a 1.58:1 sidebar ship. `--border` is recorded as decorative and exempt, with the reasoning in
  the script.
- `npm run i18n:report` — untranslated catalogue keys, and text written directly into components
  that no translator can reach. The second number is the one that matters.

## Operating the deployment

- `/api/health` returns `200` when the instance can reach the database and `503` when it cannot. It
  is anonymous and deliberately says nothing else, so it cannot be used to learn the schema or which
  tenants exist. Point an uptime monitor at it.
- Logs are one JSON line per event on stdout (`lib/observability/log.ts`). Any log drain will collect
  them. Personal and operational fields are redacted by name, because logs are readable by more
  people than the database is.
- `LOG_LEVEL` (`debug`/`info`/`warn`/`error`, default `info`) trims volume without a redeploy.
- `DOCUMENTS_ENABLED=true` switches on document storage. It is off until an upload and a download
  have been confirmed against a real bucket.
- `prune_rate_limit_events()` is safe to run from a scheduled job; without it `rate_limit_events`
  grows without bound.

## A note on the stock overview

`inventory_stock_overview` is declared `with (security_invoker = true)`. That is not decoration. A
PostgreSQL view runs with its *owner's* privileges by default, which on Supabase means it would read
past every row-level policy on the tables underneath and hand one mining company another's stock
levels. Deleting those five words is a tenant-isolation breach, not a style change, and
`tests/integration/stock-overview.test.ts` fails five ways if anyone does.
