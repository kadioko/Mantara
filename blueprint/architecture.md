# Mantara OS MVP — Architecture Blueprint

> Project status and the product/business journey are maintained in [the roadmap](../docs/roadmap.md). This document remains the technical design reference.

> **Implementation note — 7 August 2026:** Foundation and Workforce migrations are deployed; only Workers and Attendance UI are currently implemented. The entity map below is the target MVP schema, not a claim that every domain table exists. See the [audited project status](../docs/project-status.md).

## 1. Repository assessment

### Current state

The linked GitHub repository is connected as `origin` and currently contains only `README.md` (initial commit `2c9b28a`). There is no existing application stack, package manifest, database integration, environment configuration, test suite, or deployment configuration to preserve.

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

The foundation migration introduces the tenancy and authorization tables, timestamp trigger, RLS helper functions, policies, and indexes. Subsequent domain migrations will add their tables only when their module begins.

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

Foundation permission codes: `organization.read`, `organization.update`, `site.create`, `site.read`, `site.update`, `member.invite`, `member.read`, `member.update_role`, `role.read`, `role.manage`, `audit_log.read`.

## 6. Route map

| Area | Routes |
| --- | --- |
| Authentication | `/login`, `/register` |
| Setup | `/onboarding` |
| Core workspace | `/dashboard`, `/sites`, `/sites/[siteId]` |
| Operations | `/workers`, `/workers/[workerId]`, `/attendance`, `/shifts`, `/production`, `/production/new`, `/production/[entryId]`, `/equipment`, `/equipment/[equipmentId]`, `/fuel`, `/maintenance`, `/inventory`, `/expenses`, `/compliance`, `/safety` |
| Intelligence | `/reports`, `/notifications` |
| Administration | `/settings`, `/settings/organization`, `/settings/users`, `/settings/roles`, `/settings/audit-logs` |

`(auth)` uses a minimal public layout. `(onboarding)` requires an authenticated user with no active organization. `(platform)` requires authentication, an active organization, and per-page permission checks.

## 7. Development phases

1. Foundation: Next.js setup, environment validation, Supabase clients, auth, profiles, organizations, memberships, mine sites, roles/permissions, RLS, and foundational tests.
2. Application shell: protected layout, organization/site context, navigation, responsive patterns, and error/loading states.
3. Workers and attendance.
4. Equipment.
5. Shifts and production with approval.
6. Fuel with transactional balance logic and approval.
7. Maintenance.
8. Inventory with transactional balance logic and approval.
9. Expenses and budgets with approval.
10. Compliance and safety.
11. Reports, notifications, and audit-log UI.
12. Production readiness: test hardening, accessibility, performance, storage, QA checklist, and deployment setup.

## 8. Assumptions

- A Supabase project will be supplied before remote migrations and authentication can be exercised.
- The first registered user creates an organization and becomes its `company_owner` through an onboarding transaction.
- User invitations use Supabase Auth email invitations; mail delivery needs configured Supabase SMTP in production.
- Site-level access is an optional restriction layered over organization membership; owner and manager roles default to all organization sites.
- Development seed data is opt-in and never bundled into production UI.

## 9. Exact initial files to create or modify

Foundation implementation will create or modify:

```text
package.json
next.config.ts
tsconfig.json
tailwind configuration and global styles
.env.example
app/(auth)/login/page.tsx
app/(auth)/register/page.tsx
app/(onboarding)/onboarding/page.tsx
app/(platform)/layout.tsx
app/(platform)/dashboard/page.tsx
app/auth/callback/route.ts
proxy.ts
components/shell/*
components/ui/*
features/auth/*
features/organizations/*
features/sites/*
features/permissions/*
lib/env.ts
lib/supabase/*
lib/auth/*
supabase/config.toml
supabase/migrations/0001_foundation.sql
supabase/seed.sql
tests/unit/permissions.test.ts
tests/unit/organization-validation.test.ts
tests/integration/tenant-isolation.test.ts (after a Supabase test project is configured)
docs/manual-qa-checklist.md
README.md
```
