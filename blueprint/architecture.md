# Mantara OS MVP — Architecture Blueprint

> Project status and the product/business journey are maintained in [the roadmap](../docs/roadmap.md). This document remains the technical design reference.

> **Implementation note — 7 August 2026:** This document was written before implementation began and has
> since been updated to describe what exists. Section 1 is kept as a record of the starting point;
> everything after it reflects the current system. Every domain in the entity map is implemented. See
> the [audited project status](../docs/project-status.md) for delivered scope and remaining gaps.

## 1. Repository assessment

### Starting state, for the record

At the time this document was written the repository contained only `README.md` (initial commit
`2c9b28a`), with no application stack, database integration, test suite, or deployment configuration
to preserve. The stack below was chosen from that blank start and has not changed since.

### Recommended stack

- Next.js (current stable) with App Router and React
- TypeScript with `strict: true`
- Tailwind CSS and accessible reusable UI primitives
- Supabase: PostgreSQL, Auth, Storage, and Row Level Security (RLS)
- Zod and React Hook Form for validated forms
- Vitest for unit and integration-style business-logic tests
- Vercel-compatible server components, route handlers, and server actions

### Primary risks

- Tenant isolation must be guaranteed at the database layer; RLS design and policy tests are non-negotiable.
- Approval rules and stock/fuel balance writes need transactional PostgreSQL functions to avoid race conditions.
- Site connectivity is variable, so early forms should be resilient to retry and partial network failures.
- Tanzania-specific requirements (licence rules, tax, and operational terminology) must remain configurable and not be encoded as legal conclusions.
- Supabase migrations require a project configuration and credentials before they can be applied to a remote database.

## 2. Proposed architecture

Use a domain-oriented Next.js structure. Pages compose server-side domain queries and reusable UI; mutations run through authenticated server actions or route handlers. The browser only receives the authenticated user session and public Supabase settings. All authorization is centralized in server-side permission helpers and duplicated in Supabase RLS policies.

```text
Browser
  -> Next.js App Router (layouts, server components, server actions)
      -> domain services (validation + permission checks)
          -> Supabase PostgreSQL / Storage
              -> RLS policies, constraints, audit triggers
```

Key principles:

- Every operational row has `organization_id`; site-specific rows also have `mine_site_id`.
- Membership and permission checks are reusable functions, never scattered role comparisons.
- Write paths validate input with Zod and use database transactions/RPCs for balance-sensitive records.
- Private storage access goes through authorization-checked signed URL helpers.
- Audit logging is append-only and produced by server/database write paths.
- Seed data is separate from migrations and only enabled explicitly for development.

## 3. Proposed folder structure

```text
app/
  (auth)/login, register/
  (onboarding)/onboarding/
  (platform)/dashboard, sites, workers, equipment, production, fuel, .../
  api/
  layout.tsx
components/
  ui/                 # generic accessible controls
  shell/              # sidebar, header, mobile navigation
  shared/             # data table, status badge, empty/loading/error states
features/
  auth/ organizations/ sites/ permissions/
  workers/ equipment/ production/ fuel/ maintenance/ inventory/
  expenses/ compliance/ safety/ reports/ notifications/ audit/
lib/
  supabase/           # browser, server, middleware clients
  auth/               # current context, permission helpers
  env.ts
  errors.ts
  utils.ts
supabase/
  migrations/
  seed.sql
  config.toml
tests/
  unit/
  integration/
blueprint/
```

## 4. Database schema plan

All UUID-keyed tables use UTC timestamps. Mutable primary records include `created_at`, `updated_at`, `created_by`, and `updated_by` where meaningful; critical records additionally use `deleted_at` and `deleted_by` for soft deletion.

| Domain | Core entities | Key integrity rules |
| --- | --- | --- |
| Identity and tenancy | `profiles`, `organizations`, `organization_memberships`, `mine_sites` | One membership per user/organization; all operational records reference organization; sites belong to exactly one organization. |
| Authorization | `roles`, `permissions`, `role_permissions` | Roles are organization-scoped where needed; permissions are stable string codes. |
| Governance | `audit_logs`, `notifications` | Audit rows are append-only and partitionable/indexed by organization/time. |
| Workforce | `workers`, `worker_assignments`, `attendance_records`, `training_records`, `ppe_issues` | Worker and assignment organization/site consistency enforced with composite foreign keys or trigger checks. |
| Production | `shifts`, `shift_assignments`, `production_entries`, `production_approvals`, `downtime_records` | Non-negative numeric checks and lifecycle status enum. |
| Equipment | `equipment`, `equipment_assignments`, `equipment_meter_readings`, `equipment_documents`, `equipment_status_history` | Status enum and monotonic meter reading validation. |
| Fuel | `fuel_storage_locations`, `fuel_receipts`, `fuel_issues`, `fuel_adjustments` | Transactional balance calculation prevents negative stock. |
| Maintenance | `maintenance_requests`, `maintenance_work_orders`, `maintenance_parts`, `maintenance_costs`, `maintenance_schedules` | Due dates and status/priority enums. |
| Inventory | `inventory_items`, `inventory_categories`, `inventory_locations`, `stock_receipts`, `stock_issues`, `stock_transfers`, `stock_adjustments`, `suppliers` | Transactional stock movement ledger prevents negative stock. |
| Finance | `expense_categories`, `expenses`, `expense_approvals`, `budgets` | Currency code is configurable; approval lifecycle is explicit. |
| Compliance | `mineral_licences`, `compliance_requirements`, `compliance_tasks`, `compliance_documents` | Deadlines indexed by organization, site, and due date. |
| Safety | `safety_incidents`, `safety_inspections`, `corrective_actions` | Sensitive details use granular permissions and audit logging. |

The foundation migration introduces the tenancy and authorization tables, timestamp trigger, RLS helper functions, policies, and indexes. Each domain migration adds its tables when its module begins. There are 26 migrations; they are numbered in application order and are never rewritten once deployed, so later migrations correct earlier ones in place rather than editing them.

## 5. Initial permission matrix

Permission codes use `domain.action` format. The matrix is a default role template; organization owners can later configure assignments without changing application code.

| Role | Scope | Default access |
| --- | --- | --- |
| `platform_super_admin` | Platform | Platform support/administration only; not implicit access to tenant records. |
| `company_owner` | Organization | Full organization management, all operational modules, approvals, reports, users, roles, and audit logs. |
| `mine_manager` | Organization/site | Operational management, records, approvals, reports, and team visibility; no role administration by default. |
| `site_supervisor` | Assigned sites | Workers, shifts, production, equipment, fuel requests, and site reports; can submit but not approve restricted adjustments. |
| `accountant` | Organization/site | Expenses, budgets, finance reports, and expense approval. |
| `storekeeper` | Assigned sites | Inventory and fuel receipts/issues; can submit adjustments. |
| `maintenance_officer` | Assigned sites | Equipment, maintenance, meter readings, work orders, and maintenance reports. |
| `safety_officer` | Organization/site | Safety incidents, inspections, corrective actions, and relevant compliance tasks. |
| `viewer` | Assigned sites | Read-only access to explicitly granted modules and reports. |

The permission codes now in use, by domain:

- Organization and access: `organization.read`, `organization.update`, `site.create`, `site.read`, `site.update`, `member.invite`, `member.read`, `member.update_role`, `role.read`, `role.manage`, `audit_log.read`
- Workforce: `worker.read`, `worker.create`, `worker.update`
- Equipment: `equipment.read`, `equipment.create`, `equipment.update`
- Production: `production.read`, `production.create`, `production.update`, `production.approve`
- Fuel: `fuel.read`, `fuel.manage`, `fuel.receive`, `fuel.issue`, `fuel.adjust`
- Maintenance: `maintenance.read`, `maintenance.create`, `maintenance.update`
- Inventory: `inventory.read`, `inventory.manage`, `inventory.receive`, `inventory.issue`, `inventory.transfer`, `inventory.adjust`
- Expenses: `expense.read`, `expense.create`, `expense.update`, `expense.approve`
- Compliance: `compliance.read`, `compliance.create`, `compliance.update`
- Safety: `safety.read`, `safety.create`, `safety.update`, `safety.read_sensitive`

Movement-level codes for fuel and inventory exist so a storekeeper can issue stock without also being
able to correct it. `safety.read_sensitive` is separate because incident records carry personal and
medical information; it is not granted to any role by default except the owner.

Role defaults live in the `role_permission_defaults` table rather than in application code, so a new
organization and an existing one are granted from one source.

Platform administration is deliberately **not** a permission code. It is a separate axis, held in
`platform_admins`, that grants no access to any tenant record.

## 6. Route map

Implemented, with anything still outstanding marked.

| Area | Routes |
| --- | --- |
| Authentication | `/login`, `/register` |
| Setup | `/onboarding` |
| Core workspace | `/dashboard`, `/sites`. Site detail lives on the list rather than its own route. |
| Workforce | `/workers`, `/workers/[workerId]`, `/attendance` |
| Operations | `/shifts`, `/production`, `/production/[entryId]`, `/equipment`, `/equipment/[equipmentId]` |
| Controls | `/fuel`, `/maintenance`, `/maintenance/[workOrderId]`, `/inventory`, `/expenses`, `/expenses/[expenseId]` |
| Risk | `/compliance`, `/safety`, `/safety/[incidentId]` |
| Intelligence | `/reports`, `/reports/export`, `/notifications` |
| Administration | `/settings/organization`, `/settings/users`, `/settings/audit-logs`, `/settings/roles` |
| Platform | `/admin`, `/admin/organizations`, `/admin/administrators`, `/admin/audit` |

Production capture happens on `/production` rather than a separate `/production/new`.

`(auth)` uses a minimal public layout. `(onboarding)` requires an authenticated user with no active
organization. `(platform)` requires authentication, an active organization, and per-page permission
checks. `(admin)` is a separate group requiring platform administration and nothing else, so a
platform administrator with no organization of their own can still reach it.

## 7. Development phases

Phases 1 to 11 are implemented. Phase 12 is in progress.

1. ✅ Foundation: Next.js setup, environment validation, Supabase clients, auth, profiles, organizations, memberships, mine sites, roles/permissions, RLS, and foundational tests.
2. ✅ Application shell: protected layout, organization/site context, navigation, responsive patterns, and error/loading states.
3. ✅ Workers and attendance, plus assignments, training, and PPE.
4. ✅ Equipment, with monotonic meter readings and automatic status history.
5. ✅ Shifts and production with a database-enforced approval lifecycle.
6. ✅ Fuel with transactional balance logic.
7. ✅ Maintenance, including service schedules that roll forward on completion.
8. ✅ Inventory with transactional stock logic and deadlock-safe transfers.
9. ✅ Expenses and budgets with approval.
10. ✅ Compliance and safety, the latter with sensitive details behind a granular, audited permission.
11. ✅ Reports, notifications, and audit-log UI, plus dashboard figures and user administration.
12. ⏳ Production readiness: paging, search, and record editing have started. Document storage,
    organization settings, the remaining Kiswahili coverage, accessibility, performance, and pilot QA
    signoff remain.

## 8. Assumptions

- A Supabase project will be supplied before remote migrations and authentication can be exercised.
- The first registered user creates an organization and becomes its `company_owner` through an onboarding transaction.
- User invitations use Supabase Auth email invitations; mail delivery needs configured Supabase SMTP in production.
- Site-level access is an optional restriction layered over organization membership; owner and manager roles default to all organization sites.
- Development seed data is opt-in and never bundled into production UI.

## 9. Implemented structure

Domain code lives under `features/<domain>/` as `schemas.ts` (Zod), `actions.ts` (server actions),
`catalogue-actions.ts` where reference data can be corrected, and one or more `*-forms.tsx` client
components. Pages under `app/(platform)/<domain>/` compose those with shared primitives from
`components/ui/`.

Cross-cutting helpers worth knowing about before adding a module:

- `lib/auth/scope.ts` — `requireScope()` resolves the active organization and site and checks a
  permission; `rowInScope()` confirms a related row belongs to that scope before writing;
  `rpcMessage()` maps a raised PostgreSQL error onto something an operator can act on. Where the
  database raises a useful message — "this store still holds 40 of stock" — `rpcMessage` passes it
  through rather than replacing it with a generic failure.
- `lib/auth/permissions.ts` — `hasPermission()` reads the caller's whole permission set once through
  `my_permissions()` and caches it per request. It previously issued one Supabase request per check,
  which raced token refresh and produced *different navigation on identical page loads*.
- `lib/auth/rate-limit.ts` — allowances for sensitive actions. Fails open on limiter error, because
  RLS is the real protection and an unreachable limiter must not stop production being recorded.
- `lib/paging.ts` — page and search parsing for list screens, including escaping search terms so a
  typed `%` does not match everything.
- `lib/totals.ts` — module headline figures, read from the database rather than computed from a page.
  Returns null on failure so the screen can show a dash; a zero would be a claim.
- `lib/observability/log.ts` — one JSON line per event on stdout, with personal and operational
  fields redacted by name.
- `lib/i18n/` — `messages.ts` holds the catalogue and the server-side `t()`; `client.tsx` provides
  `LocaleProvider` and `useT()` for client components, which is what lets the data-entry forms be
  bilingual at all.
- `components/ui/` — `Button`, `Card`/`Panel`, `Table`, `Input`, `Select`, `Field`, `Badge`,
  `Pagination`, `CatalogueList`/`CatalogueRow`, and the `Alert`/`EmptyState`/`StatCard`/`PageHeader`
  set. Design tokens are declared in `app/globals.css` following shadcn/ui conventions.

### Three database rules that are easy to get wrong

Each of these has already caused a defect in this codebase:

1. **`SECURITY DEFINER` bypasses RLS**, so every such function re-checks permission itself. Revoking
   from `PUBLIC` is not enough — Supabase grants `EXECUTE` to `anon` and `authenticated` by name, so
   they must be revoked by name too. The test harness models those default grants deliberately;
   without that, a leak of this kind passes every test.
2. **A view runs as its owner unless declared `security_invoker`.** `inventory_stock_overview`
   declares it. Without those five words the view reads past every policy underneath.
3. **Restrictive policies are how you narrow access without touching what is already there.**
   Site restriction (`0028`) adds one restrictive policy per site-scoped table; PostgreSQL AND-s
   them with the existing permissive policies, so none of those had to be edited and none could be
   missed. A restrictive policy can never grant anything. The one real cost: a table added later
   needs its own policy, because the migration generates them from the catalogue as it stood when
   it ran. Any new table with a `mine_site_id` must add one.
4. **An unbounded query silently stops at 1000 rows.** PostgREST caps responses and says nothing, so
   a list, a total or a report simply comes back short and looks complete. Anything that must be
   whole either pages through (`features/reports/fetch-all.ts`) or aggregates in the database
   (`0025_module_totals.sql`).

### Static audits

`npm run audit:all` runs the type check, lint, and three project-specific audits: accessibility
(`scripts/a11y-audit.mjs`), colour contrast against WCAG AA in both themes
(`scripts/contrast-audit.mjs`), and translation coverage (`scripts/i18n-report.mjs`). Each was added
after a defect of that kind reached a running deployment.

### Tests

`tests/unit/` covers schemas, helpers, paging, CSV generation, logging and the message catalogue.
`tests/integration/` applies the **real migration files** to PostgreSQL compiled to WebAssembly
(PGlite) and asserts what the database enforces — no Docker, no remote project, runs in ordinary CI.

Two tests exist to guard whole classes of silent failure rather than one behaviour:
`tests/unit/permission-codes.test.ts` checks every permission code the application asks for against
the migrations, because a nonexistent code denies everyone without erroring; and the placeholder
parity check in `tests/unit/i18n.test.ts` catches a translation that drops a `{site}` and quietly
renders a sentence with the site name missing.
