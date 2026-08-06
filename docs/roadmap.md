# Mantara roadmap and journey

**Current position: Foundation and workspace shell**  
**Last updated: 6 August 2026**

Mantara is being built as the digital operating system for African mining: a trusted, mobile-first tool that gives mining operators a reliable view of production, people, equipment, fuel, maintenance, inventory, costs, safety, and compliance.

## Where we are today

- Product vision and MVP scope are documented in [`blueprint/`](../blueprint/).
- The GitHub repository is connected and the project builds successfully.
- A Next.js, TypeScript, Tailwind, and Supabase foundation exists.
- Authentication, onboarding, organizations, memberships, roles, permissions, mine sites, audit-log tables, and RLS migration are implemented locally.
- The local app is linked to the Mantara Supabase project and has publishable client configuration in ignored `.env.local`.
- The production database migration is **not yet applied**; therefore real login and tenant data cannot be tested until it is deployed.

## Product journey

| Stage | Outcome | Status |
| --- | --- | --- |
| 0. Direction | Define Mantara OS as the first product; defer GeoAI, Vision, Brain, and Market | Complete |
| 1. Foundation | Authentication, multi-tenancy, RLS, roles, permissions, onboarding, mine sites | Code complete; awaiting migration deployment |
| 2. Workspace | Responsive shell, active organization/site context, protected navigation | Code complete; awaiting migration deployment |
| 3. Workforce | Workers, assignments, attendance, training, PPE | In progress: worker register implemented |
| 4. Equipment | Register, assignments, meter readings, statuses, documents | Planned |
| 5. Production | Shifts, production capture, approvals, summaries | Planned |
| 6. Controls | Fuel, maintenance, inventory, expenses, approvals | Planned |
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

1. Apply the foundation migration to Supabase and configure Auth redirect URLs.
2. Complete the workspace shell and manually test organization/site switching.
3. Build the Workers module end-to-end, including migration, RLS, validation, UI, tests, and QA checklist updates.
4. Begin design-partner interviews before production and fuel workflows are finalized.

## Decision rules

- Build one complete, tested module at a time.
- Never treat client-side checks as tenant security; RLS and server checks remain mandatory.
- No mock operational data outside explicit development seed data.
- Prioritize low-friction mobile data capture and clear audit trails over advanced features.
- Do not add AI, marketplace, trading, payment, computer vision, or geological certainty claims to the MVP.
