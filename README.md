# Mantara

Mantara OS is a secure, multi-tenant mining operations platform for artisanal, small-scale, and medium-sized mining companies.

## Project status

The foundation is implemented locally and linked to Supabase. Deploy the first migration before testing authentication or onboarding against the live project. See the [roadmap and journey](docs/roadmap.md) for current progress, product phases, and the parallel business plan.

## Local setup

1. Copy `.env.example` to `.env.local` and set the values from your Supabase project.
2. Apply every migration in `supabase/migrations/` in filename order (`0001_foundation.sql` through `0008_expenses.sql`) using the Supabase CLI or SQL editor.
3. Run `npm run dev`.

The first authenticated user creates their organization and initial mine site from `/onboarding`.

See [the architecture blueprint](blueprint/architecture.md) for the MVP plan and implementation sequence, and the [manual QA checklist](docs/manual-qa-checklist.md) for foundation verification.

## Tests

```bash
npm run test
```

Unit tests cover form and schema validation. The integration tests in `tests/integration/` apply the real migration
files to a PostgreSQL database compiled to WebAssembly, then assert the rules the application relies on the database
to enforce — balance floors, approval lifecycles, and tenant isolation under RLS. They need no Docker and no Supabase
project, so they run anywhere `npm test` does.
