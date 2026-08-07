# Mantara OS — project status audit

**Audited: 7 August 2026**
**Database state: migrations `0001`–`0013` applied to Supabase**

## Executive status

Mantara has a multi-tenant foundation with tenant isolation enforced in the database, and working
operational workflows for Workforce, Equipment, Production, Fuel, Maintenance, Inventory, Expenses,
Compliance, and Safety, plus a platform administration console.

The whole migration chain is applied to Supabase and the production build passes. A labelled demo
workspace exists in Supabase.

What remains before a pilot: reports and exports, notifications, document storage, organization
settings and user administration, the remaining Kiswahili coverage, and release hardening.

## Delivered

| Area | State |
| --- | --- |
| Foundation | Next.js 16, strict TypeScript, Tailwind v4, Supabase SSR clients, environment validation, Vercel deployment. |
| Authentication | Register, login, logout, callback, protected requests, onboarding redirect. Supabase owns password storage. |
| Tenancy | Organizations, memberships, mine sites, active organization/site cookies, constraints and RLS. |
| Authorization | Organization roles, stable permission codes, defaults in `role_permission_defaults`, and platform administration as a separate axis that grants no tenant access. |
| Workspace UI | Responsive shell, permission-driven navigation, brand mark, language switcher. |
| Localization | English and Kiswahili for navigation, authentication, onboarding, dashboard, and every module landing screen. |
| Workforce | Worker register and profile, assignments, training, PPE issues, daily attendance roster. |
| Equipment | Register and detail, meter readings that cannot move backwards, status history, operator assignments. |
| Production | Shifts, production capture, database-enforced approval lifecycle, downtime. |
| Fuel | Stores with transactional balances, deliveries, issues, adjustments; balances cannot go negative. |
| Maintenance | Requests, work orders with an enforced lifecycle, parts, costs, service schedules that roll forward. |
| Inventory | Catalogue, stores, suppliers, stock ledger with non-negative balances and deadlock-safe transfers. |
| Expenses | Categories, approval lifecycle, budgets whose consumption counts approved and paid spend only. |
| Compliance | Licences with expiry tracking, organization-authored requirements, recurring tasks. |
| Safety | Incidents, inspections, corrective actions; personal and medical detail behind a granular permission and logged on every access. |
| Insight | Dashboard with permission-gated operational figures, and an organization audit-log screen. |
| Platform administration | `/admin` with organization metadata, suspension, administrator management, and an append-only platform audit log. |
| Quality | `npm run typecheck`, `npm run lint`, `npm run build`, and 263 tests pass. |

## Test coverage

Unit tests cover schema and form validation. Integration tests in `tests/integration/` apply the real
migration files to PostgreSQL compiled to WebAssembly and assert what the database itself enforces:

- Meter monotonicity, and that a rejected reading leaves the meter untouched.
- Fuel and stock balance floors, capacity limits, and that a rejected movement writes no row.
- A failed stock transfer leaving both stores unchanged.
- Production and expense approval lifecycles, including frozen figures after approval.
- Work-order completion rolling service schedules forward.
- Cross-tenant reads and writes blocked by RLS, even with a known row id.
- Platform administrators reading no rows from any operational table.
- Sensitive safety details being unreadable without the granular permission, and every access audited.

**Not covered:** Supabase Auth, Storage, and PostgREST behaviour, since the harness stubs them; and
real concurrency, which needs a multi-connection server. Those remain in the manual QA checklist.

## Remaining work

### Insight layer

- Reports and CSV export for production, fuel, stock, and expenses.
- Notifications: the table exists from `0001` but nothing writes to it and there is no UI.
- Dashboard trends over time, rather than the current point-in-time figures.

### Administration

- Organization settings, user invitations, and role management UI. The permissions
  (`member.invite`, `member.update_role`, `role.manage`) exist with no screens behind them.
- Mine-site management UI beyond onboarding, and site-level access restrictions.

### Documents

- Private Supabase Storage buckets, upload UI, file validation, and signed-URL access.
  `equipment_documents`, `compliance_documents`, and training certificates all store a path today with
  no way to put a file at it.

### Localization

- Client-side forms and detail views are still English. Module landing screens are translated.

### Release readiness

- Pagination and filtering on every list; several screens currently cap at 50 rows with no way to page.
- Editing and deactivation for most records; the modules are create-and-read heavy.
- Rate limiting on sensitive actions, accessibility review, performance testing.
- PWA/offline capture, monitoring, backup and recovery, pilot manual-QA signoff.

## Recommended next task

Reports and exports, then notifications, which together complete the insight layer and stage 7. After
that, user administration is the largest gap between the product and a pilot, because an organization
currently cannot invite its own people.
