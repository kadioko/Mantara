# Mantara roadmap and journey

**Current position: Workforce, equipment, production, and fuel implemented**  
**Last updated: 7 August 2026**

Mantara is being built as the digital operating system for African mining: a trusted, mobile-first tool that gives mining operators a reliable view of production, people, equipment, fuel, maintenance, inventory, costs, safety, and compliance.

## Where we are today

- Product vision and MVP scope are documented in [`blueprint/`](../blueprint/).
- The GitHub repository is connected and the project builds successfully.
- A Next.js, TypeScript, Tailwind, and Supabase foundation exists.
- Authentication, onboarding, organizations, memberships, roles, permissions, mine sites, audit-log tables, and RLS migration are implemented locally.
- The workforce module is complete: worker register and detail, daily attendance, assignments, training, and PPE issue history.
- The equipment module is implemented: asset register and detail, transactional meter readings, status changes with automatic history, and operator assignments.
- The production module is implemented: shifts, production capture, a database-enforced approval lifecycle, and downtime.
- Fuel control is implemented: storage locations with transactionally maintained balances, deliveries, issues, and adjustments that cannot drive a store negative.
- Role defaults now live in `role_permission_defaults`, so new organizations and existing ones are granted from one source instead of two hand-maintained lists.
- The local app is linked to the Mantara Supabase project and has publishable client configuration in ignored `.env.local`.
- The production database migrations are **not yet applied**; therefore real login and tenant data cannot be tested until they are deployed.

### Verified locally

`npm run typecheck`, `npm run lint`, `npm run test` (80 unit tests), and `npm run build` all pass. Migration SQL is
syntax-checked with the PostgreSQL parser, but **no migration has been executed against a database yet**. Everything the
database enforces — RLS policies, the meter-reading and fuel-balance functions, the production approval lifecycle, and
the status triggers — remains unverified until the migrations are deployed and the QA checklist is worked through.

## Product journey

| Stage | Outcome | Status |
| --- | --- | --- |
| 0. Direction | Define Mantara OS as the first product; defer GeoAI, Vision, Brain, and Market | Complete |
| 1. Foundation | Authentication, multi-tenancy, RLS, roles, permissions, onboarding, mine sites | Code complete; awaiting migration deployment |
| 2. Workspace | Responsive shell, active organization/site context, protected navigation | Code complete; awaiting migration deployment |
| 3. Workforce | Workers, assignments, attendance, training, PPE | Code complete; awaiting migration deployment |
| 4. Equipment | Register, assignments, meter readings, statuses, documents | Code complete; document upload deferred to storage work |
| 5. Production | Shifts, production capture, approvals, summaries | Code complete; awaiting migration deployment |
| 6. Controls | Fuel, maintenance, inventory, expenses, approvals | In progress: fuel control complete; maintenance, inventory, and expenses planned |
| 7. Risk and insight | Compliance, safety, reports, notifications, audit-log UI | Planned |
| 8. Release readiness | Security testing, performance, mobile QA, pilot deployment | Planned |

## Business journey: becoming a mining-technology company

Software is the immediate priority, but Mantara should be built alongside real mining-market learning. The goal is not to operate mines; it is to become a trusted operational partner to mining businesses.

### In parallel with MVP development

1. Identify 3–5 Tanzania-based design partners across small-scale mining, processing, and quarry operations.
2. Interview owners, mine managers, supervisors, storekeepers, and accountants about their daily paper, Excel, and WhatsApp workflows.
3. Validate the first paid problem: accurate daily production and fuel control are likely the strongest starting wedge, but customer interviews should confirm this.
4. Establish trusted expert relationships for mining operations, compliance, safety, and data protection. Mantara stores and organizes compliance information; it does not provide legal advice.
5. Define a pilot offer: onboarding, data migration, team training, and a fixed pilot period with success measures.

### Pilot success measures

- A mine can record daily production, fuel movements, equipment events, and attendance without spreadsheet duplication.
- The mine owner can see yesterday’s operational position remotely.
- Authorized users cannot view another organization’s data.
- The pilot team identifies a measurable reduction in reporting delay, missing records, or fuel/inventory variance.
- At least one pilot is willing to convert to a paid subscription or reference customer.

## Immediate next actions

1. Apply migrations `0001`–`0005` to Supabase and configure Auth redirect URLs.
2. Work the manual QA checklist, especially the RLS, meter-monotonicity, approval-lifecycle, and fuel-balance checks that only a live database can confirm.
3. Continue stage 6 with maintenance, inventory, and expenses.
4. Begin design-partner interviews now that production and fuel capture exist to demonstrate.

## Decision rules

- Build one complete, tested module at a time.
- Never treat client-side checks as tenant security; RLS and server checks remain mandatory.
- No mock operational data outside explicit development seed data.
- Prioritize low-friction mobile data capture and clear audit trails over advanced features.
- Do not add AI, marketplace, trading, payment, computer vision, or geological certainty claims to the MVP.
