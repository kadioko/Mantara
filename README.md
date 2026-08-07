# Mantara

Mantara OS is a secure, multi-tenant mining operations platform for artisanal, small-scale, and medium-sized mining companies.

## Project status

The foundation is implemented locally and linked to Supabase. Deploy the first migration before testing authentication or onboarding against the live project. See the [roadmap and journey](docs/roadmap.md) for current progress, product phases, and the parallel business plan.

## Local setup

1. Copy `.env.example` to `.env.local` and set the values from your Supabase project.
2. Apply every migration in `supabase/migrations/` in filename order (`0001_foundation.sql` through `0011_safety.sql`) using the Supabase CLI or SQL editor.
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

## User interface

Shared components live in `components/ui/` and follow shadcn/ui conventions on Tailwind v4: a `cn`
helper in `lib/utils.ts`, `class-variance-authority` for variants, and design tokens declared in
`app/globals.css`. Components from registries such as [21st.dev](https://21st.dev) ship as
shadcn-format source, so they compose with these tokens and can be added directly.

## Tests

```bash
npm run test
```

Unit tests cover form and schema validation. The integration tests in `tests/integration/` apply the real migration
files to a PostgreSQL database compiled to WebAssembly, then assert the rules the application relies on the database
to enforce — balance floors, approval lifecycles, and tenant isolation under RLS. They need no Docker and no Supabase
project, so they run anywhere `npm test` does.
