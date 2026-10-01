# Mantara technical and product audit — 1 October 2026

## Executive summary

The application source is in a relatively mature state: its main mining-operations modules, bilingual
catalogue, operational intelligence, and geology features are implemented. The former Supabase
database has been deleted and a replacement account/project is pending. This makes live behavior the
largest current risk: authentication, tenant isolation, database functions, Storage, seeded accounts,
and demo records must all be rebuilt and revalidated before the deployed app can be considered usable.

Local checks pass for TypeScript, ESLint, the mechanical accessibility scan, and the two-theme contrast
scan. These checks do not exercise a real Supabase project, a screen reader, responsive behavior on
physical devices, or concurrent production writes.

## Current evidence

| Area | Current finding |
| --- | --- |
| Repository | Clean at audit start; HEAD matched `origin/main`. |
| Supabase | Former database deleted by owner; replacement not yet connected. No live status is claimed. |
| Schema | 39 migration files exist, `0001`–`0039`; migration `0039` contains a security fix and is required on a fresh setup. |
| Static quality | Typecheck, lint, mechanical a11y, and contrast checks pass. |
| Localization | 824 English catalogue keys and 824 Kiswahili translations; no missing catalogue values. Static scan finds 399 uncatalogued phrase occurrences (280 unique) in 44 files. |
| UI quality | Static accessibility/contrast checks pass. A human visual/mobile/screen-reader review has not been performed in this audit. |
| Live security and integrations | Auth, RLS/PostgREST, Storage, export audit, concurrent writes, email delivery, and health monitoring must be repeated against the replacement. |

## Findings and priority

### P0 — Rebuild and prove the new Supabase environment

1. Provision the replacement project and update local/deployment credentials without reusing the old
   project's values.
2. Apply `supabase/migrations/0001` through `0039` in filename order, then run
   `supabase/verify-deployment.sql` and `npm run deploy:check`.
3. Recreate initial platform administration and any demo organization/users deliberately. Do not
   assume Auth accounts, database records, or private Storage objects survived the deletion.
4. Re-run live Auth, cross-tenant and restricted-site RLS, signed export, document upload/download and
   denial/expiry, and concurrent-write checks. Keep `DOCUMENTS_ENABLED` off until its checks pass.
5. Confirm Vercel points to the new project, then verify `/api/health`, logs, email configuration, and
   CSP reports. Old live-QA evidence applies only to the former project.

### P1 — Localization completeness

`npm run i18n:report` reports 399 phrase occurrences (280 unique) outside the catalogue. The largest
clusters are operational server actions: inventory (30), workers (24), safety (22), maintenance (21),
production (20), and equipment (18). Action-result messages are especially important because
operators need to know whether a record saved or why it was rejected. Add English/Kiswahili catalogue
keys and replace the hard-coded strings, then require the report to reach zero. Have a Tanzania-based
mining-domain speaker review technical vocabulary before pilot use.

### P1 — Human UX validation

- Walk the core daily workflow on a narrow phone and tablet: sign-in, choose site, attendance, shift
  and ore-bag capture, fuel/inventory movement, maintenance, expenses, and review.
- Check long Swahili labels, numeric precision/units (tonnes, PPM, grams), table overflow, keyboard
  focus, dialogs, and empty/error/loading states.
- Run a screen-reader pass with a human tester. The automated scanner is mechanical and does not
  replace this.
- Verify sidebar collapse/restore and fullscreen workspace at mobile and desktop breakpoints.

### P2 — Production operations and resilience

External `/api/health` monitoring, log collection/retention, documented backup retention, a restore
drill with RPO/RTO, and realistic concurrent-user load testing remain operational requirements. Offline
drafts exist for selected capture flows, but the operator recovery/sync experience should be included
in pilot QA.

### P3 — Product roadmap, after core live validation

Continue operational intelligence (scheduled summaries, forecast scenario/version history, cited
Mantara Brain), then richer GIS/drill-section and evidence-bounded GeoAI work. Do not let speculative
AI/geology features displace reliability of daily production, ore bagging, people, equipment, fuel,
maintenance, and expense capture.

## Suggested next sequence

1. Provision new Supabase and deploy credentials; keep customer traffic and document access disabled.
2. Apply and verify all 39 migrations, then establish a fresh non-production demo tenant.
3. Run live security/integration smoke tests; repair any environment-dependent failures before UI work.
4. Clear the 399 uncatalogued phrase occurrences and re-run `npm run audit:all`.
5. Conduct structured mobile, screen-reader, and pilot workflow QA; record findings in
   `docs/manual-qa-checklist.md`.
6. Complete monitoring, recovery, and load-test sign-off before a commercial pilot.
