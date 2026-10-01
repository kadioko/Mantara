# Release readiness and pilot sign-off

**Status (1 October 2026): local implementation checks pass; live operational readiness is unverified because the former Supabase project was deleted and a replacement is pending.**

## Evidence already available

- Historical deployment evidence states migrations `0001`–`0038` were applied to the former project; none are confirmed on the replacement.
- Historical `supabase/verify-deployment.sql` evidence is from 12 August 2026 and is not valid evidence for a new project.
- On 1 October, `npm run typecheck`, `npm run lint`, `npm run a11y`, and `npm run contrast` pass locally. Build, test suite, and live integration checks were not run in this audit.
- `/api/health` checks database reachability without exposing tenant data; structured JSON logs redact common sensitive fields.

## Required live checks

| Area | Owner | Pass condition | Evidence |
| --- | --- | --- | --- |
| Auth | Pilot owner | Register, sign in/out, reset and invitation acceptance work with production email settings; invitation delivery is blocked because the three required email variables were absent on 2026-08-12 | Checklist initials + timestamp |
| PostgREST/RLS | Security tester | Re-run isolation and write-denial cases on replacement; former-project pass is historical only | Fresh `scripts/live-tenant-qa.mjs` output |
| Documents | Operations tester | Recreate private bucket, enable only after live upload/download/expiry/role-denial checks | Fresh upload evidence |
| Concurrent writes | Two testers | Competing fuel, stock and meter writes preserve constraints and present useful errors | Timestamped test script |
| Accessibility | Screen-reader user | Login, active-site selection, shift entry and document upload are understandable by keyboard and screen reader | Browser/device findings |
| Performance | Technical owner | Health endpoint and core pages meet agreed pilot response targets under a documented load profile | Load report |
| Recovery | Technical owner | A restore drill meets agreed RPO/RTO on a non-production project | Drill record |

## Monitoring and log collection

1. Configure an external HTTPS monitor to request `https://mantara-pi.vercel.app/api/health` every five minutes, alerting the designated technical owner after two consecutive failures.
2. Select a log destination before enabling a drain (for example Vercel Logs, Axiom, Datadog, or Better Stack), set its retention/access policy, then connect Vercel stdout. Do not place credentials or document contents in log searches.
3. Review CSP reports for seven days of real use before changing the report-only header to enforcing.

## Pilot decision

The pilot is ready to start only when every required live check is marked pass, a named support contact and escalation route exist, and the mine owner accepts the data-entry and recovery procedures. A failed check is a release blocker, not a waiver hidden in this document.
