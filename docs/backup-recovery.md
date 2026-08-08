# Backup and recovery runbook

## Objective

Protect tenant operational records with a documented, tested recovery path. This runbook does not replace the backup retention supplied by the selected Supabase plan.

## Before production pilot

1. Confirm the Supabase plan's automatic-backup retention and point-in-time-recovery capability in the project dashboard; record the chosen RPO and RTO below.
2. Restrict project-owner access and store recovery contacts outside the application.
3. Take an encrypted logical export before material migration or bulk-import work when the plan does not provide the required recovery point.
4. Never perform a restore drill on the live project. Restore to a separately named test project and use a non-production Vercel environment.

| Decision | Pilot value | Owner |
| --- | --- | --- |
| Recovery point objective (RPO) | To be agreed with pilot mine | Pilot owner |
| Recovery time objective (RTO) | To be agreed with pilot mine | Technical owner |
| Backup retention | Confirmed from Supabase plan before pilot | Technical owner |

## Quarterly recovery drill

1. Record the source backup timestamp and the expected organization/site counts.
2. Restore into a new test project using the plan-supported procedure.
3. Apply the same `0001`–`0033` migration history only when the restored backup requires it; never replay migrations blindly over a newer schema.
4. Point a temporary test deployment at the restored project and run `/api/health` plus the tenancy, dashboard, production, inventory, and audit-log smoke cases.
5. Compare record counts and a sample of balances, ore lots, dispatches, audit rows and attached-document metadata. Do not copy private document objects into a less protected environment unless the drill is approved.
6. Record elapsed time, gaps, corrective actions, and the next drill date.

## Incident procedure

1. Stop unsafe write activity and preserve relevant logs.
2. Identify whether the incident is a user error, an application defect, or a project-level loss; do not overwrite evidence.
3. Notify the pilot owner with the known impact and recovery decision.
4. Restore only to a test environment first, validate it, then obtain explicit authorization before any production recovery action.
5. Reconcile entries made after the selected recovery point through the normal audited workflows; do not directly insert operational rows to "catch up".
