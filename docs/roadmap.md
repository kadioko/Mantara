# Mantara roadmap and journey

**Current position: Stage 6 controls complete; migrations now executed and tested**  
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
- Maintenance is implemented: requests, work orders with a database-enforced lifecycle, parts, costs, and service schedules that roll forward when a work order is completed.
- Inventory is implemented: catalogue, stores, suppliers, and a stock ledger whose balances cannot go negative; transfers lock both stores in a fixed order so opposing transfers cannot deadlock.
- Expenses and budgets are implemented: an approval lifecycle mirroring production, and budget consumption computed by the database so drafts never count as spent.
- Role defaults now live in `role_permission_defaults`, so new organizations and existing ones are granted from one source instead of two hand-maintained lists.
- The local app is linked to the Mantara Supabase project and has publishable client configuration in ignored `.env.local`.
- The production database migrations are **not yet applied**; therefore real login and tenant data cannot be tested until they are deployed.

### Verified locally

`npm run typecheck`, `npm run lint`, `npm run test` (210 tests), and `npm run build` all pass.

The migrations are **executed, not just parsed**. `tests/integration/` boots a real PostgreSQL compiled to
WebAssembly ([PGlite](https://pglite.dev)), applies every migration file in order, and asserts the behaviour the
application depends on the database for. No Docker or remote Supabase project is required, so these run in ordinary CI.

What the integration tests now cover:

- Meter readings cannot move backwards, and a rejected reading leaves the meter untouched.
- Equipment status history is written on every write path, with the reason when one is supplied.
- Fuel and stock balances cannot go negative or exceed capacity, and a rejected movement writes no row.
- A failed stock transfer leaves **both** stores unchanged.
- Production and expense approval lifecycles: no skipped states, no double review, approved figures frozen.
- Work-order completion rolls the equipment's service schedule forward.
- Budget consumption counts approved and paid expenses only, respecting period and category scope.
- Cross-tenant reads and writes are blocked by RLS, including when a row id from another organization is known.
- Ledger tables have no insert policy, and the internal balance helpers are not executable by API roles.

Two limits are worth stating plainly. The harness stubs Supabase's `auth` schema and API roles, so it models
Supabase rather than being it — Auth, Storage, and PostgREST behaviour are still unverified. And concurrency is not
exercised: the row locks are the right construction and the balance checks are proven, but genuine simultaneous
writes need a real multi-connection database. The manual QA checklist still carries those cases.

## Product journey

| Stage | Outcome | Status |
| --- | --- | --- |
| 0. Direction | Define Mantara OS as the first product; defer GeoAI, Vision, Brain, and Market | Complete |
| 1. Foundation | Authentication, multi-tenancy, RLS, roles, permissions, onboarding, mine sites | Code complete; awaiting migration deployment |
| 2. Workspace | Responsive shell, active organization/site context, protected navigation | Code complete; awaiting migration deployment |
| 3. Workforce | Workers, assignments, attendance, training, PPE | Code complete; awaiting migration deployment |
| 4. Equipment | Register, assignments, meter readings, statuses, documents | Code complete; document upload deferred to storage work |
| 5. Production | Shifts, production capture, approvals, summaries | Code complete; awaiting migration deployment |
| 6. Controls | Fuel, maintenance, inventory, expenses, approvals | Code complete; awaiting migration deployment |
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

1. Apply migrations `0001`–`0008` to Supabase and configure Auth redirect URLs.
2. Work the manual QA checklist, concentrating on what the integration tests cannot reach: real concurrency, Supabase Auth and Storage, and end-to-end behaviour through PostgREST.
3. Build stage 7: compliance, safety, reports, notifications, and the audit-log UI.
4. Begin design-partner interviews now that production, fuel, maintenance, inventory, and expenses exist to demonstrate.

## Decision rules

- Build one complete, tested module at a time.
- Never treat client-side checks as tenant security; RLS and server checks remain mandatory.
- No mock operational data outside explicit development seed data.
- Prioritize low-friction mobile data capture and clear audit trails over advanced features.
- Do not add AI, marketplace, trading, payment, computer vision, or geological certainty claims to the MVP.
