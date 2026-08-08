# Mantara roadmap and journey

**Current position: every module built; eight migrations awaiting deployment**  
**Last updated: 8 August 2026**

For the audited feature-by-feature state, including what is not implemented, see [project status](project-status.md).

Mantara is being built as the digital operating system for African mining: a trusted, mobile-first tool that gives mining operators a reliable view of production, people, equipment, fuel, maintenance, inventory, costs, safety, and compliance.

## Where we are today

**Deployment: migrations `0001`–`0018` are applied to Supabase and the Vercel build is live. `0019`–`0030` are written and tested but not deployed**, so mine-site management, organization settings, custom roles, rate limiting, the stock overview, the catalogue guards, the module totals, the compliance recurrence fix, the scheduled alerts and per-site access restriction are not yet available on the live site — and several headline figures there are still computed the old, incorrect way.

Every planned module exists:

- **Workforce** — worker register and profile with editing and removal, daily attendance, assignments, training, PPE issue history.
- **Equipment** — asset register and detail with editing and retirement, transactional meter readings that cannot move backwards, status changes with automatic history, operator assignments.
- **Production and ore handling** — shifts, PPM-aware capture, a database-enforced approval lifecycle, downtime, bagged ore lots recording tonnes, assay grade, bags and bag weight, and a locked dispatch function that refuses to send more tonnes or bags to a plant than the lot recorded.
- **Fuel** — tanks with transactionally maintained balances, deliveries, issues, adjustments that cannot drive a tank negative, full catalogue editing, reconciliation against a measured dip, and consumption per machine worked out from the meter readings already on each issue.
- **Maintenance** — requests, work orders with a database-enforced lifecycle, parts, costs, service schedules that roll forward on completion.
- **Inventory** — catalogue with full editing, stores, suppliers, a stock ledger whose balances cannot go negative, transfers that lock both stores in a fixed order so opposing transfers cannot deadlock, and a paged site-scoped stock overview.
- **Expenses** — an approval lifecycle mirroring production, and budget consumption computed by the database so drafts never count as spent.
- **Compliance** — licences with expiry tracking and editing, organization-authored requirements with editing and retirement, and tasks that reschedule themselves while the requirement is in service and stop when it is retired.
- **Safety** — incidents, inspections, corrective actions, with personal and medical detail held separately behind a granular permission, rate limited, and logged on every access.
- **Insight** — dashboard figures gated per module, an organization audit log, reports with CSV export that cannot silently truncate, and notifications that now include a daily job alerting on licence expiry, overdue compliance tasks and overdue corrective actions, so nobody has to remember to look.
- **Administration** — invitations, role changes, suspension, a custom-roles screen, per-member mine-site restriction, mine-site management, organization settings, and `/admin` for the platform team.
- **Operations** — `/api/health`, structured JSON logging with field redaction, and a Postgres-backed rate limiter.

Supporting work:

- A shared UI layer in `components/ui/` uses shadcn/ui conventions and design tokens, so components from registries such as [21st.dev](https://21st.dev) drop in unchanged. Every screen draws from it; colours come from tokens, so the brand changes in one file.
- Role defaults live in `role_permission_defaults`, so new and existing organizations are granted from one source instead of two hand-maintained lists.
- English and Kiswahili throughout, including the module data-entry forms. `useT()` gives client components the locale, which is what unblocked the forms — they had no way to read a cookie-based locale before, so they were stuck in English while the pages around them were bilingual.
- Three static audits — accessibility, colour contrast, and translation coverage — each added after something got past a review.
- A query-plan harness that seeds a realistic volume and asserts on the plans the screens produce, so a sequential scan fails a test rather than a pilot. It found one real ceiling in the stock overview, which is measured and documented rather than papered over.

### Verified locally

`npm run typecheck`, `npm run lint`, `npm run test` (551 tests), `npm run build`, `npm run a11y` and `npm run contrast` all pass.

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
- Completing a recurring compliance obligation schedules the next one; a one-off task schedules nothing; and a
  retired requirement schedules nothing, so dropping an obligation actually drops it.
- The stock overview enforces RLS **through the view**. Its `security_invoker` declaration is asserted directly,
  because without it the view would run as its owner and hand one company its competitor's stock levels.
- Module totals are gated on each module's own read permission, not merely on membership, so a headline number
  cannot disclose a module the caller may not open.
- A store or item holding stock, and a tank holding litres, cannot be retired; ordinary corrections still work.
- Rate limiting is keyed on `auth.uid()` with no subject argument, so no caller can spend another's allowance.
- Every permission code the application asks for exists in the migrations — a nonexistent one would deny
  everyone silently, since `has_permission()` simply returns false for a code nobody holds.

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
| 3. Workforce | Workers, assignments, attendance, training, PPE | Complete; deployed |
| 4. Equipment | Register, assignments, meter readings, statuses, documents | Complete; document upload stays behind `DOCUMENTS_ENABLED` |
| 5. Production | Shifts, PPM grade capture, bagged ore lots, plant dispatches, approvals, summaries | Complete; deployed |
| 6. Controls | Fuel, maintenance, inventory, expenses, approvals | Complete; catalogue editing and stock overview await `0023`–`0025` |
| 7. Risk and insight | Compliance, safety, reports, notifications, audit-log UI | Complete; recurrence fix awaits `0026` |
| 8. Release readiness | Security testing, performance, mobile QA, pilot deployment | In progress: paging, search, editing, rate limiting, accessibility, monitoring and bilingual forms done. Outstanding: deploy `0019`–`0026`, screen-reader pass, load testing, backup procedure, offline capture, pilot signoff |

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

1. Apply migrations `0019`–`0030` to Supabase, following [the deployment runbook](deployment.md). Every one of them can be run twice, so a half-finished apply is fixed by re-running the file. `0020` creates the documents bucket but the surface stays hidden until `DOCUMENTS_ENABLED=true`.
2. Work the manual QA checklist, concentrating on what the integration tests cannot reach: real concurrency, Supabase Auth and Storage, and end-to-end behaviour through PostgREST.
3. Point a monitor at `/api/health` and a log drain at stdout. Both are ready and neither is wired to anything yet.
4. Run a screen-reader pass. `npm run a11y` and `npm run contrast` catch the mechanical failures and both pass; they cannot judge whether a label is meaningful or a focus order sensible.
5. Lift the remaining 422 uncatalogued UI phrases into `lib/i18n/messages.ts` (`npm run i18n:report` ranks them by file). The lifting is mechanical; the Kiswahili for mining vocabulary — grade, assay, headgear, stope, waybill — needs a speaker, and faking it would produce something an operator would not trust.
6. Begin design-partner interviews now that production, fuel, maintenance, inventory, and expenses exist to demonstrate.

## Decision rules

- Build one complete, tested module at a time.
- Never treat client-side checks as tenant security; RLS and server checks remain mandatory.
- No mock operational data outside explicit development seed data.
- Prioritize low-friction mobile data capture and clear audit trails over advanced features.
- Do not add AI, marketplace, trading, payment, computer vision, or geological certainty claims to the MVP.
