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
| Localization at original audit | 824 English catalogue keys and 824 Kiswahili translations; no missing catalogue values. Static scan found 399 uncatalogued phrase occurrences (280 unique) in 44 files. |
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

### P1 — Localization completeness (resolved in source after the original audit)

The original audit found 399 phrase occurrences (280 unique), including 209 action-result messages.
After the audit, UI action feedback and legacy action outcomes were connected to bilingual message
translations, and additional visible labels were catalogued. The current `npm run i18n:report` result
is 851 English/Kiswahili pairs and zero uncovered UI phrases. A Tanzania-based mining-domain speaker
must still review specialist vocabulary before pilot use; static parity does not certify translation
quality.

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
4. Keep `npm run i18n:report` at zero uncovered phrases and arrange a specialist Kiswahili review.
5. Conduct structured mobile, screen-reader, and pilot workflow QA; record findings in
   `docs/manual-qa-checklist.md`.
6. Complete monitoring, recovery, and load-test sign-off before a commercial pilot.

## Follow-up source work (1 October 2026)

- Added bilingual presentation for save confirmations and failure messages across action-driven forms,
  plus missing visible labels. The current report is 851 paired keys and zero uncovered phrases.
- Intelligence now compares the selected 30-day operating period with the preceding 30 days using
  existing RPC data; mixed-currency spend and heterogeneous stock variance are intentionally omitted.
- Geology summaries now describe loaded sample evidence rather than implying site-wide completeness.
  Invalid WGS84 map coordinates are excluded, and polygon holes retain their geometry in map display.
- `npm run audit:all` passes (typecheck, ESLint, accessibility, contrast, and translation coverage);
  `npm test` passes 56 files / 780 tests with 1 skipped. This source work does not establish live
  Supabase, screen-reader, field-translation, or real-device QA.
