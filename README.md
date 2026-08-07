# Mantara

Mantara OS is a secure, multi-tenant mining operations platform for artisanal, small-scale, and medium-sized mining companies.

The currently implemented interface supports English and Kiswahili. Additional African languages can be added through the centralized translation catalog in `lib/i18n/`.

## Project status

The multi-tenant foundation, Workforce register, attendance workflow, English/Kiswahili UI, and Mantara brand are implemented. Supabase migrations `0001`–`0003` are deployed and the Vercel production build is live. The MVP is still in progress: Equipment, Production, Fuel, Maintenance, Inventory, Expenses, Compliance, Safety, Reports, Notifications, and audit-log UI remain to be built.

See the [project-status audit](docs/project-status.md) for the precise delivered scope, gaps, and recommended next task. The [roadmap and journey](docs/roadmap.md) tracks delivery and the parallel mining-technology business plan.

## Local setup

1. Copy `.env.example` to `.env.local` and set the values from your Supabase project.
2. Apply the migrations in `supabase/migrations/` in order using the Supabase CLI or SQL editor.
3. Run `npm run dev`.

The first authenticated user creates their organization and initial mine site from `/onboarding`.

See [the architecture blueprint](blueprint/architecture.md) for the MVP plan and implementation sequence, and the [manual QA checklist](docs/manual-qa-checklist.md) for foundation verification.
