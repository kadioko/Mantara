# Mantara

Mantara OS is a secure, multi-tenant mining operations platform.

## Local setup

1. Copy `.env.example` to `.env.local` and set the values from your Supabase project.
2. Apply `supabase/migrations/0001_foundation.sql` using the Supabase CLI or SQL editor.
3. Run `npm run dev`.

The first authenticated user creates their organization and initial mine site from `/onboarding`.

See [the architecture blueprint](blueprint/architecture.md) for the MVP plan and implementation sequence.
