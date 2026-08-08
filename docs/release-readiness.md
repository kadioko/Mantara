# Release readiness and pilot sign-off

**Status: implementation checks pass; live operational sign-off is pending.**

## Evidence already available

- Database migrations `0001`–`0033` are applied, including direct verification of policy/trigger/index-only migrations.
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, accessibility scan and contrast scan pass.
- `/api/health` checks database reachability without exposing tenant data; structured JSON logs redact common sensitive fields.

## Required live checks

| Area | Owner | Pass condition | Evidence |
| --- | --- | --- | --- |
| Auth | Pilot owner | Register, sign in/out, reset and invitation acceptance work with production email settings | Checklist initials + timestamp |
| PostgREST/RLS | Security tester | Two organizations cannot read or mutate one another through the UI or API session | Test accounts and result notes |
| Documents | Operations tester | Upload, signed download, expiry and role denials pass after `DOCUMENTS_ENABLED=true` | File name, role, screenshots |
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
