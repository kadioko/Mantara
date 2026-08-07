# Mantara roadmap and journey

**Current position: Ore handling added to core operations; stage 8 in progress**  
**Last updated: 7 August 2026**

For the audited feature-by-feature state, including what is not yet implemented, see [project status](project-status.md).

Mantara is being built as the digital operating system for African mining: a trusted, mobile-first tool that gives mining operators a reliable view of production, people, equipment, fuel, maintenance, inventory, costs, safety, and compliance.

## Where we are today

- **Deployment update (7 August 2026):** Supabase migrations `0001` through `0013` are applied. To preserve the already-deployed platform-administrators migration at `0003`, Equipment through Safety were safely renumbered as `0004` through `0012`, and platform-admin consolidation follows as `0013`.
- English and Kiswahili headings, summaries, metrics, and primary sections are now translated on the operational module landing screens. Client-side forms and detail views remain the next localization pass.
- Product vision and MVP scope are documented in [`blueprint/`](../blueprint/).
- The GitHub repository is connected and the project builds successfully.
- A Next.js, TypeScript, Tailwind, and Supabase foundation exists.
- Authentication, onboarding, organizations, memberships, roles, permissions, mine sites, audit-log tables, and RLS migration are implemented locally.
- The workforce module is complete: worker register and detail, daily attendance, assignments, training, and PPE issue history.
- The equipment module is implemented: asset register and detail, transactional meter readings, status changes with automatic history, and operator assignments.
- The production module is implemented: shifts, PPM-aware production capture, a database-enforced approval lifecycle, downtime, bagged ore lots, and processing-plant dispatch records.
- Ore handling is the next operating wedge: each lot records tonnes, assay grade in PPM, bags and bag weight; a locked dispatch function prevents more tonnes or bags being sent to a processing plant than were recorded in the lot.
- Fuel control is implemented: storage locations with transactionally maintained balances, deliveries, issues, and adjustments that cannot drive a store negative.
- Maintenance is implemented: requests, work orders with a database-enforced lifecycle, parts, costs, and service schedules that roll forward when a work order is completed.
- Inventory is implemented: catalogue, stores, suppliers, and a stock ledger whose balances cannot go negative; transfers lock both stores in a fixed order so opposing transfers cannot deadlock.
- Expenses and budgets are implemented: an approval lifecycle mirroring production, and budget consumption computed by the database so drafts never count as spent.
- Platform administration is implemented at `/admin`: organization metadata, suspension, administrator management, and an append-only platform audit log.
- A shared UI layer in `components/ui/` uses shadcn/ui conventions and design tokens, so components from registries such as [21st.dev](https://21st.dev) drop in unchanged. Every screen now draws from it: the eight duplicated panel components and twelve copies of the form control classes are gone, and colours come from tokens rather than the stock palette, so the brand changes in one file.
- Compliance is implemented: licences with expiry tracking, organization-authored requirements, and tasks that reschedule themselves when a recurring obligation is completed.
- Safety is implemented: incidents, inspections, and corrective actions, with personal and medical detail held separately behind a granular permission and logged on every access.
- Role defaults now live in `role_permission_defaults`, so new organizations and existing ones are granted from one source instead of two hand-maintained lists.
- English and Kiswahili are supported through a cookie-based translation layer in `lib/i18n/`, designed for future African-language additions. Navigation and the authentication, onboarding, and dashboard screens are translated; the module screens added since are still English only.
- The Mantara brand mark and language switcher are in the workspace shell.
- The local app is linked to the Mantara Supabase project and has publishable client configuration in ignored `.env.local`.
- Migrations `0001`–`0003` are deployed to Supabase and the Vercel build is live. **Migrations `0004` onwards are not yet deployed**, so everything from Equipment forward cannot be exercised against the live project until they are applied.

### Verified locally

`npm run typecheck`, `npm run lint`, `npm run test` (310 tests), and `npm run build` all pass.

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
- A platform administrator reads **no rows** from any operational table, holds no permission in any organization,
  and cannot write tenant data; suspension makes an organization read-only without affecting any other.
- Sensitive safety details cannot be read or written without the granular permission, cannot be reached by querying
  the table directly, and every access — but never a denied attempt — is written to the audit log.
- Completing a recurring compliance obligation schedules the next one; a one-off task schedules nothing.

Two limits are worth stating plainly. The harness stubs Supabase's `auth` schema and API roles, so it models
Supabase rather than being it — Auth, Storage, and PostgREST behaviour are still unverified. And concurrency is not
exercised: the row locks are the right construction and the balance checks are proven, but genuine simultaneous
writes need a real multi-connection database. The manual QA checklist still carries those cases.

## Product journey

| Stage | Outcome | Status |
| --- | --- | --- |
| 0. Direction | Define Mantara OS as the first product; defer GeoAI, Vision, Brain, and Market | Complete |
| 1. Foundation | Authentication, multi-tenancy, RLS, roles, permissions, onboarding, mine sites | Complete; deployed to Supabase |
| 2. Workspace | Responsive shell, active organization/site context, protected navigation, English/Kiswahili | Complete; deployed to Vercel |
| 3. Workforce | Workers, assignments, attendance, training, PPE | Code complete; awaiting migration deployment |
| 4. Equipment | Register, assignments, meter readings, statuses, documents | Code complete; document upload deferred to storage work |
| 5. Production | Shifts, PPM grade capture, bagged ore lots, plant dispatches, approvals, summaries | Code complete; ore migration `0018` awaiting deployment |
| 6. Controls | Fuel, maintenance, inventory, expenses, approvals | Code complete; awaiting migration deployment |
| 7. Risk and insight | Compliance, safety, reports, notifications, audit-log UI | Code complete |
| 8. Release readiness | Security testing, performance, mobile QA, pilot deployment | In progress: paging, search, editing, rate limiting, accessibility, and monitoring done; performance testing, offline capture, and pilot signoff outstanding |

## Platform administration: what the role can and cannot do

Mantara's central promise is that one organization can never see another's data. A platform
administrator role is where that promise is easiest to lose, so the boundary is drawn deliberately.

**Platform admin is a separate axis from tenancy.** It is not a permission, not a role inside an
organization, and it grants no read path to any operational table. Because it confers no membership,
`has_permission()` is false for every organization, and every module's policies deny it without
needing to know the role exists.

| Can | Cannot |
| --- | --- |
| See organization names, countries, join dates, member and site counts | See any worker, attendance, equipment, production, fuel, inventory, maintenance, or expense record |
| Suspend and restore an organization, with a recorded reason | Read or write tenant data in any organization, including a suspended one |
| Grant and revoke platform administration | Revoke the last remaining administrator |
| Read the platform audit log | Write to the audit log or the administrator table directly |

Suspension makes an organization **read-only** rather than invisible: its people keep access to
records they already have, but nothing new can be written until it is restored. The rule lives in
`has_permission()` so every module inherits it rather than each table reimplementing it.

**Deliberately not built: support access to tenant data.** Real support work sometimes needs to see a
customer's records, and the tempting shortcut is to let platform admins read everything. That would
quietly void the isolation guarantee for every customer. The intended design is a time-boxed grant
that the *organization's own owner* creates, is scoped to read-only, and expires by itself — consent
from the tenant, not privilege from the platform. It is not implemented yet, and until it is, support
that needs tenant data should be done with the customer present.

**Bootstrapping is manual on purpose.** The first administrator is inserted directly through the
Supabase SQL editor, as documented at the end of `0009_platform_admin.sql`; there is no self-service
path into the role. Every later grant goes through `platform_grant_admin()` and is audited.

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

1. Apply migrations `0019`–`0024` to Supabase. `0020` creates the documents bucket but the surface stays hidden until `DOCUMENTS_ENABLED=true`.
2. Work the manual QA checklist, concentrating on what the integration tests cannot reach: real concurrency, Supabase Auth and Storage, and end-to-end behaviour through PostgREST.
3. Point a monitor at `/api/health` and a log drain at stdout. Both are ready and neither is wired to anything yet.
4. Run a screen-reader pass. `npm run a11y` and `npm run contrast` catch the mechanical failures and both pass; they cannot judge whether a label is meaningful or a focus order sensible.
5. Lift the 571 uncatalogued UI phrases into `lib/i18n/messages.ts` (`npm run i18n:report` ranks them by file) and find a Kiswahili speaker for the mining vocabulary.
6. Begin design-partner interviews now that production, fuel, maintenance, inventory, and expenses exist to demonstrate.

## Decision rules

- Build one complete, tested module at a time.
- Never treat client-side checks as tenant security; RLS and server checks remain mandatory.
- No mock operational data outside explicit development seed data.
- Prioritize low-friction mobile data capture and clear audit trails over advanced features.
- Do not add AI, marketplace, trading, payment, computer vision, or geological certainty claims to the MVP.
